#!/usr/bin/env bash
# Backup diário criptografado do banco (age) + sincronização S3 (rclone) + retenção.
#
# Uso:
#   backup.sh                    # dump -> age -> rclone -> retenção local/remota
#   backup.sh --install-cron     # instala cron diário + teste mensal de restore (root)
#   backup.sh --verify [arquivo] # baixa o backup do remoto e confere a criptografia
#   backup.sh --help
#
# Saída: backups/blue-sentinel-AAAAMMDD-HHMMSS.dump.age (local) e a mesma
# cópia no RCLONE_REMOTE. A chave age NÃO sai do servidor: o escrow da chave
# privada é externo (ver docs/architecture/disaster-recovery.md).
#
# Env: ENV_FILE (padrão <repo>/.env.prod)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT}/.env.prod}"
COMPOSE_FILE="${ROOT}/docker-compose.prod.yml"

log()  { echo "[backup $(date -u +%H:%M:%S)] $*"; }
die()  { echo "[backup FALHA] $*" >&2; exit 1; }

env_get() { grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true; }
abs_path() { case "$1" in /*) echo "$1" ;; *) echo "${ROOT}/${1#./}" ;; esac; }

usage() { awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"; exit 0; }

# --------------------------------------------------------------------- args --
MODE=run
VERIFY_FILE=""
while [ $# -gt 0 ]; do
    case "$1" in
        --install-cron) MODE=cron ;;
        --verify) MODE=verify; VERIFY_FILE="${2:-}"; [ $# -gt 1 ] && shift ;;
        --help|-h) usage ;;
        *) die "argumento desconhecido: $1" ;;
    esac
    shift
done

[ -f "$ENV_FILE" ] || die "$ENV_FILE não existe — rode deploy.sh init"
docker info >/dev/null 2>&1 || die "sem acesso ao Docker"

POSTGRES_USER="$(env_get POSTGRES_USER)"; POSTGRES_USER="${POSTGRES_USER:-sentinel}"
POSTGRES_DB="$(env_get POSTGRES_DB)"; POSTGRES_DB="${POSTGRES_DB:-blue_sentinel}"
RCLONE_REMOTE="$(env_get RCLONE_REMOTE)"
RCLONE_CONFIG="$(abs_path "${RCLONE_CONFIG:-$(env_get RCLONE_CONFIG)}")"
AGE_KEY_FILE="$(abs_path "${AGE_KEY_FILE:-$(env_get AGE_KEY_FILE)}")"
AGE_RECIPIENTS_FILE="$(abs_path "${AGE_RECIPIENTS_FILE:-$(env_get AGE_RECIPIENTS_FILE)}")"
BACKUP_LOCAL_DIR="$(abs_path "${BACKUP_LOCAL_DIR:-$(env_get BACKUP_LOCAL_DIR)}")"
RETENTION_DAYS="$(env_get BACKUP_RETENTION_DAYS)"; RETENTION_DAYS="${RETENTION_DAYS:-7}"
RETENTION_WEEKS="$(env_get BACKUP_RETENTION_WEEKS)"; RETENTION_WEEKS="${RETENTION_WEEKS:-4}"

compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

# ------------------------------------------------------------------- verify --
do_verify() {
    local remote="${RCLONE_REMOTE:?RCLONE_REMOTE vazio no ENV_FILE}"
    local conf="${RCLONE_CONFIG:?}"
    command -v rclone >/dev/null || die "rclone não instalado"
    command -v age >/dev/null || die "age não instalado"

    local file="$VERIFY_FILE"
    if [ -z "$file" ]; then
        log "último backup no remoto..."
        file="$(rclone --config "$conf" lsf "${remote}:" --files-only 2>/dev/null \
            | grep -E '^blue-sentinel-[0-9]{8}-[0-9]{6}\.dump\.age$' | sort | tail -n 1 || true)"
        [ -n "$file" ] || die "nenhum backup encontrado no remoto ${remote}:"
        log "testando ${file}"
    fi
    [ -f "$file" ] || rclone --config "$conf" copyto "${remote}:${file}" "$file"
    age -d -i "$AGE_KEY_FILE" "$file" > /dev/null
    log "OK: ${file} descriptografa com a chave local"

    # Pacote de configuração (.env.prod + seeds) — avisa se faltar (DR sem ele não sobe).
    local cfgf tmpc
    cfgf="$(rclone --config "$conf" lsf "${remote}:" --files-only 2>/dev/null \
        | grep -E '^blue-sentinel-config-[0-9]{8}-[0-9]{6}\.tar\.age$' | sort | tail -n 1 || true)"
    if [ -n "$cfgf" ]; then
        tmpc="$(mktemp)"
        rclone --config "$conf" copyto "${remote}:${cfgf}" "$tmpc"
        age -d -i "$AGE_KEY_FILE" "$tmpc" | tar -tf - >/dev/null
        rm -f "$tmpc"
        log "OK: ${cfgf} descriptografa e é tar válido"
    else
        log "AVISO: nenhum pacote blue-sentinel-config-*.tar.age no remoto (rode um backup)"
    fi
    exit 0
}

[ "$MODE" = verify ] && do_verify

# -------------------------------------------------------------------- cron ---
if [ "$MODE" = cron ]; then
    [ "$(id -u)" = 0 ] || die "--install-cron precisa de root"
    command -v age >/dev/null || die "age não instalado"
    command -v rclone >/dev/null || die "rclone não instalado"
    mkdir -p "${ROOT}/logs" "${ROOT}/backups"
    now="$(date -u +%M)"   # minuto sorteado no install, fora de pico
    cat > /etc/cron.d/blue-sentinel <<EOF
# Blue-Sentinel — backups criptografados (gerado por backup.sh --install-cron)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
MAILTO=""
# Dump diário (retém 7 diários + 4 semanais) -> logs/backup.log
${now} 3 * * * root cd '${ROOT}' && ./scripts/deployment/backup.sh >> logs/backup.log 2>&1
# Teste mensal de restauração em ambiente limpo (dia 1) -> logs/restore-test.log
$(( (now + 6) % 60 )) 4 1 * * root cd '${ROOT}' && ./scripts/deployment/restore.sh --test --auto >> logs/restore-test.log 2>&1
EOF
    chmod 644 /etc/cron.d/blue-sentinel
    log "cron instalado: /etc/cron.d/blue-sentinel"
    exit 0
fi

# --------------------------------------------------------------------- run ---
TMP_DUMP=""
# Nunca deixa dump EM TEXTO PLAINTEXT para trás (sai por qualquer motivo).
trap 'rc=$?; if [ -n "$TMP_DUMP" ] && [ -f "$TMP_DUMP" ]; then rm -f "$TMP_DUMP"; fi; exit $rc' EXIT

do_backup() {
    command -v age >/dev/null || die "age não instalado"
    command -v rclone >/dev/null || die "rclone não instalado"
    [ -f "$AGE_RECIPIENTS_FILE" ] || die "$AGE_RECIPIENTS_FILE ausente (rode deploy.sh init)"
    [ -f "$RCLONE_CONFIG" ] || die "$RCLONE_CONFIG ausente (rode deploy.sh init e edite)"
    [ -n "${RCLONE_REMOTE:-}" ] || die "RCLONE_REMOTE vazio no ENV_FILE"

    mkdir -p "$BACKUP_LOCAL_DIR"
    local ts name enc
    ts="$(date -u +%Y%m%d-%H%M%S)"
    name="blue-sentinel-${ts}.dump.age"
    TMP_DUMP="${BACKUP_LOCAL_DIR}/.tmp-${ts}.dump"
    enc="${BACKUP_LOCAL_DIR}/${name}"

    log "pg_dump (${POSTGRES_DB})..."
    compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$TMP_DUMP"
    [ -s "$TMP_DUMP" ] || die "pg_dump vazio"

    log "criptografando com age..."
    age -R "$AGE_RECIPIENTS_FILE" -o "$enc" "$TMP_DUMP"
    rm -f "$TMP_DUMP"; TMP_DUMP=""
    chmod 600 "$enc"

    log "enviando para ${RCLONE_REMOTE}:..."
    rclone --config "$RCLONE_CONFIG" copyto "$enc" "${RCLONE_REMOTE}:${name}"
    rclone --config "$RCLONE_CONFIG" check "$enc" "${RCLONE_REMOTE}:${name}" --one-way \
        || die "rclone check falhou — cópia remota divergente"

    # Pacote de configuração (.env.prod + secrets/): sem ele o DR novo servidor
    # não sobe. Criptografado no mesmo archive age, mesmo remoto, mesma retenção.
    local cfg_name cfg
    cfg_name="blue-sentinel-config-${ts}.tar.age"
    cfg="${BACKUP_LOCAL_DIR}/${cfg_name}"
    log "backup de configuração (.env.prod + secrets)..."
    tar -C "$ROOT" -cf - .env.prod secrets | age -R "$AGE_RECIPIENTS_FILE" -o "$cfg"
    chmod 600 "$cfg"
    rclone --config "$RCLONE_CONFIG" copyto "$cfg" "${RCLONE_REMOTE}:${cfg_name}"
    rclone --config "$RCLONE_CONFIG" check "$cfg" "${RCLONE_REMOTE}:${cfg_name}" --one-way \
        || die "rclone check (config) falhou"

    prune_all

    local size
    size="$(du -h "$enc" | cut -f1)"
    log "OK: ${name} (${size}) + config, local e remoto; retenção ${RETENTION_DAYS}d / ${RETENTION_WEEKS} semanais"
}

# Retenção: mantém arquivos dos últimos N dias + domingos das últimas S semanas.
# Vale para dumps (.dump.age) e para o pacote de configuração (.tar.age).
should_keep() { # should_keep <timestamp YYYYMMDD-HHMMSS>
    local ts="$1" now age dow
    now="$(date -u +%s)"
    ts="$(date -u -d "${ts:0:8} ${ts:9:2}:${ts:11:2}:${ts:13:2}" +%s 2>/dev/null)" || return 1
    age=$(( (now - ts) / 86400 ))
    [ "$age" -lt "$RETENTION_DAYS" ] && return 0
    dow="$(date -u -d "@$ts" +%u)"
    [ "$dow" = 7 ] && [ "$age" -lt $((RETENTION_WEEKS * 7)) ] && return 0
    return 1
}

strip_name() { # strip_name <arquivo-base> -> timestamp
    local n="$1"
    n="${n#blue-sentinel-}"; n="${n#config-}"
    n="${n%.dump.age}"; n="${n%.tar.age}"
    echo "$n"
}

prune_all() {
    local f ts
    for f in "$BACKUP_LOCAL_DIR"/blue-sentinel-*.dump.age \
             "$BACKUP_LOCAL_DIR"/blue-sentinel-config-*.tar.age; do
        [ -e "$f" ] || continue
        ts="$(strip_name "$(basename "$f")")"
        should_keep "$ts" || { log "retenção: removendo $(basename "$f")"; rm -f "$f"; }
    done
    rclone --config "$RCLONE_CONFIG" lsf "${RCLONE_REMOTE}:" --files-only 2>/dev/null \
        | grep -E '^blue-sentinel-(config-)?[0-9]{8}-[0-9]{6}\.(dump|tar)\.age$' \
        | while read -r f; do
            ts="$(strip_name "$f")"
            should_keep "$ts" || { log "retenção remota: removendo $f"; rclone --config "$RCLONE_CONFIG" deletefile "${RCLONE_REMOTE}:$f"; }
        done
}

do_backup
