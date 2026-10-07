#!/usr/bin/env bash
# Restauração de backup: teste seguro em ambiente LIMPO (cron mensal) ou
# restauração real (DESTRUTIVA) no banco de produção.
#
# Uso:
#   restore.sh --test [arquivo.age]   # teste: sobe PG temporário, restaura e valida
#   restore.sh --test --auto          # idem, sem interação (cron)
#   restore.sh --latest               # DESTRUTIVO: último backup local no banco atual
#   restore.sh <arquivo.age>          # DESTRUTIVO: arquivo específico no banco atual
#   restore.sh --help
#
# O teste NUNCA toca o banco real: PG temporário sem porta publicada, removido
# ao final. A restauração real pede confirmação e grava snapshot pré-restauração
# (também criptografado) em backups/.
#
# Env: ENV_FILE (padrão <repo>/.env.prod)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT}/.env.prod}"
COMPOSE_FILE="${ROOT}/docker-compose.prod.yml"

MODE=""          # test | real
AUTO=0
FILE=""

log()  { echo "[restore $(date -u +%H:%M:%S)] $*" >&2; }  # stderr: nunca poluir $(...)
die()  { echo "[restore FALHA] $*" >&2; exit 1; }

env_get() { grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true; }
abs_path() { case "$1" in /*) echo "$1" ;; *) echo "${ROOT}/${1#./}" ;; esac; }
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

usage() { awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"; exit 0; }

# --------------------------------------------------------------------- args --
while [ $# -gt 0 ]; do
    case "$1" in
        --test) MODE=test ;;
        --auto) AUTO=1 ;;
        --latest) MODE=real; FILE="--latest" ;;
        --help|-h) usage ;;
        -*) die "opção desconhecida: $1" ;;
        *)  MODE="${MODE:-real}"; FILE="$1" ;;
    esac
    shift
done
[ -n "$MODE" ] || usage

[ -f "$ENV_FILE" ] || die "$ENV_FILE não existe"
docker info >/dev/null 2>&1 || die "sem acesso ao Docker"
command -v age >/dev/null || die "age não instalado"

POSTGRES_USER="$(env_get POSTGRES_USER)"; POSTGRES_USER="${POSTGRES_USER:-sentinel}"
POSTGRES_DB="$(env_get POSTGRES_DB)"; POSTGRES_DB="${POSTGRES_DB:-blue_sentinel}"
RCLONE_REMOTE="$(env_get RCLONE_REMOTE)"
RCLONE_CONFIG="$(abs_path "${RCLONE_CONFIG:-$(env_get RCLONE_CONFIG)}")"
AGE_KEY_FILE="$(abs_path "${AGE_KEY_FILE:-$(env_get AGE_KEY_FILE)}")"
AGE_RECIPIENTS_FILE="$(abs_path "${AGE_RECIPIENTS_FILE:-$(env_get AGE_RECIPIENTS_FILE)}")"
BACKUP_LOCAL_DIR="$(abs_path "${BACKUP_LOCAL_DIR:-$(env_get BACKUP_LOCAL_DIR)}")"
RESTORE_TEST_IMAGE="$(env_get RESTORE_TEST_IMAGE)"; RESTORE_TEST_IMAGE="${RESTORE_TEST_IMAGE:-postgres:16-alpine}"

# ------------------------------------------------------------------ limpeza --
CID=""
TMP_DUMP=""
cleanup() {
    rc=$?
    [ -n "$TMP_DUMP" ] && [ -f "$TMP_DUMP" ] && rm -f "$TMP_DUMP"
    [ -n "$CID" ] && docker rm -f "$CID" >/dev/null 2>&1 || true
    exit $rc
}
trap cleanup EXIT

# -------------------------------------------------------------- achar dump --
resolve_file() {
    # $1 = arquivo | --latest | vazio
    local want="$1" f
    if [ -n "$want" ] && [ "$want" != "--latest" ]; then
        [ -f "$want" ] || die "arquivo não encontrado: $want"
        echo "$want"; return 0
    fi
    # local mais recente
    f="$(ls -1 "$BACKUP_LOCAL_DIR"/blue-sentinel-*.dump.age 2>/dev/null | sort | tail -n 1 || true)"
    if [ -n "$f" ]; then echo "$f"; return 0; fi
    # baixa o mais recente do remoto
    [ -n "${RCLONE_REMOTE:-}" ] || die "sem backup local e RCLONE_REMOTE vazio"
    command -v rclone >/dev/null || die "rclone não instalado"
    mkdir -p "$BACKUP_LOCAL_DIR"
    f="$(rclone --config "$RCLONE_CONFIG" lsf "${RCLONE_REMOTE}:" --files-only 2>/dev/null \
        | grep -E '^blue-sentinel-[0-9]{8}-[0-9]{6}\.dump\.age$' | sort | tail -n 1 || true)"
    [ -n "$f" ] || die "nenhum backup no remoto ${RCLONE_REMOTE}:"
    log "baixando ${f} do remoto..."
    rclone --config "$RCLONE_CONFIG" copyto "${RCLONE_REMOTE}:${f}" "${BACKUP_LOCAL_DIR}/${f}"
    echo "${BACKUP_LOCAL_DIR}/${f}"
}

# ------------------------------------------------- sanidade pós-restauração --
sanity() { # sanity <container do postgres: id ou nome> -> tabelas/linhas; falha se 0 tabelas
    local cid="$1" count names t n
    count="$(docker exec "$cid" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
        "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
    [ "${count:-0}" -ge 1 ] || die "restauração OK mas banco VAZIO (0 tabelas)"
    log "tabelas públicas: ${count}"
    names="$(docker exec "$cid" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1")"
    for t in $names; do
        n="$(docker exec "$cid" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
            "SELECT count(*) FROM \"$t\"" 2>/dev/null || echo "?")"
        echo "    ${t}: ${n} linhas"
    done
    if docker exec "$cid" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
        "SELECT 1 FROM alembic_version LIMIT 1" >/dev/null 2>&1; then
        log "alembic: $(docker exec "$cid" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc 'SELECT version_num FROM alembic_version')"
    fi
    if ! docker exec "$cid" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
        "SELECT to_regclass('public.contact_messages')" | grep -q contact_messages; then
        log "AVISO: tabela contact_messages ausente (backup antigo/parcial?)"
    fi
}

# --------------------------------------------------------------- modo teste --
run_test() {
    local file
    file="$(resolve_file "$FILE")"
    log "TESTE de restauração com: $(basename "$file")"

    age -d -i "$AGE_KEY_FILE" "$file" > /dev/null \
        || die "descriptografia falhou (chave errada/corrompida)"
    log "criptografia OK"

    local tmp_name="blue-sentinel-restore-test"
    docker rm -f "$tmp_name" >/dev/null 2>&1 || true
    log "subindo PostgreSQL temporário (${RESTORE_TEST_IMAGE}, sem portas)..."
    CID="$(docker run -d --name "$tmp_name" \
        -e POSTGRES_USER="$POSTGRES_USER" \
        -e POSTGRES_PASSWORD=so-para-teste-local \
        -e POSTGRES_DB="$POSTGRES_DB" \
        "$RESTORE_TEST_IMAGE")"

    local i ready=0
    for i in $(seq 1 60); do
        if docker exec "$tmp_name" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
            ready=1; break
        fi
        sleep 2
    done
    [ "$ready" = 1 ] || { docker logs --tail 30 "$tmp_name" || true; die "PG temporário não ficou pronto em 120s"; }

    log "restaurando dump no PG temporário..."
    if ! age -d -i "$AGE_KEY_FILE" "$file" | docker exec -i "$tmp_name" \
        pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error; then
        die "pg_restore falhou (dump corrompido ou incompatível de versão)"
    fi

    sanity "$tmp_name"
    log "TESTE DE RESTAURAÇÃO: PASSOU"
}

# ------------------------------------------------------- modo destrutivo -----
run_real() {
    [ -f "$RCLONE_CONFIG" ] || true
    local file
    file="$(resolve_file "$FILE")"
    log "restauração REAL de $(basename "$file") no banco '${POSTGRES_DB}'"

    if [ "$AUTO" != 1 ]; then
        echo "!!! ISTO SUBSTITUI TODOS OS DADOS de '${POSTGRES_DB}' !!!"
        printf "Digite o nome do banco para confirmar [%s]: " "$POSTGRES_DB"
        read -r answer
        [ "$answer" = "$POSTGRES_DB" ] || die "confirmação não bate — abortado (nada foi alterado)"
    else
        log "modo --auto: sem confirmação (uso pensado em --test)"
    fi

    # Snapshot de segurança do estado atual (criptografado).
    local ts pre
    ts="$(date -u +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP_LOCAL_DIR"
    TMP_DUMP="${BACKUP_LOCAL_DIR}/.tmp-pre-restore-${ts}.dump"
    pre="${BACKUP_LOCAL_DIR}/pre-restore-${ts}.dump.age"
    log "snapshot pré-restauração..."
    compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$TMP_DUMP"
    age -R "$AGE_RECIPIENTS_FILE" -o "$pre" "$TMP_DUMP"
    rm -f "$TMP_DUMP"; TMP_DUMP=""
    chmod 600 "$pre"
    log "snapshot: $pre"

    log "esvaziando schema public..."
    compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

    log "restaurando dump..."
    if ! age -d -i "$AGE_KEY_FILE" "$file" | compose exec -T postgres \
        pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error; then
        die "pg_restore falhou — restaure o snapshot: $pre (ver disaster-recovery.md)"
    fi

    sanity "$(compose ps -q postgres | head -n 1)"
    log "sanidade local OK — verificando readiness da app..."
    if compose exec -T backend curl -fsS http://localhost:8000/api/v1/health/ready 2>/dev/null \
        | grep -q '"status":"ok"'; then
        log "app: pronta"
    else
        log "app não respondeu — reiniciando backend..."
        compose restart backend
        compose exec -T backend sh -c 'for i in $(seq 1 30); do curl -fsS http://localhost:8000/api/v1/health/ready | grep -q "\"status\":\"ok\"" && exit 0; sleep 2; done; exit 1' \
            || die "app não ficou pronta após restauração"
        log "app: pronta após restart"
    fi
    log "RESTAURAÇÃO REAL CONCLUÍDA (snapshot: $pre)"
}

case "$MODE" in
    test) run_test ;;
    real) run_real ;;
esac
