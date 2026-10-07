#!/usr/bin/env bash
# Deploy da produção Blue-Sentinel (blue-green por tag + gate de saúde + rollback).
#
# Uso:
#   deploy.sh init                 # prepara .env.prod + secrets (uma vez por servidor)
#   deploy.sh <tag> [--build]      # publica tag (ex.: v1.4.0); --build = build local
#   deploy.sh --help
#
# Fluxo do deploy <tag>:
#   1. valida .env.prod e secrets
#   2. registra tag atual no histórico
#   3. pull das imagens da tag (ou build) — stack antiga segue no ar até aqui
#   4. sobe infra (postgres/redis) e espera healthy
#   5. migrations (alembic upgrade head) na imagem nova — falhou => aborta, nada mudou
#   6. docker compose up -d (switch)
#   7. gate de saúde (healthcheck.sh --wait 300) — falhou => rollback automático
#   8. registra resultado + prune de imagens soltas
#
# Env: ENV_FILE (padrão <repo>/.env.prod)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT}/.env.prod}"
COMPOSE_FILE="${ROOT}/docker-compose.prod.yml"
HISTORY="${ROOT}/.deploy-history"
HEALTHCHECK="${SCRIPT_DIR}/healthcheck.sh"
ROLLBACK="${SCRIPT_DIR}/rollback.sh"

log()  { echo "[deploy $(date -u +%H:%M:%S)] $*"; }
die()  { echo "[deploy FALHA] $*" >&2; exit 1; }

compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
env_get() { grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true; }
history() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$HISTORY"; }

usage() { awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"; exit 0; }

# --------------------------------------------------------------------- init --
gen_secret() { # gen_secret <nome-do-arquivo>
    local f="${ROOT}/secrets/$1"
    [ -f "$f" ] && return 0
    openssl rand -hex 32 > "$f"
    chmod 600 "$f"
    log "gerado secrets/$1 (guarda-o!)"
}

cmd_init() {
    command -v age-keygen >/dev/null || die "age-keygen não instalado (rode scripts/setup/harden-server.sh)"
    command -v rclone >/dev/null || die "rclone não instalado (rode scripts/setup/harden-server.sh)"
    command -v openssl >/dev/null || die "openssl não instalado"

    if [ ! -f "$ENV_FILE" ]; then
        cp "${ROOT}/.env.prod.example" "$ENV_FILE"
        chmod 600 "$ENV_FILE"
        log "criado ${ENV_FILE} a partir do exemplo — PREENCHA DOMAIN, SMTP, GITHUB_*"
    else
        log "${ENV_FILE} já existe — mantido"
    fi
    chmod 600 "$ENV_FILE"

    mkdir -p "${ROOT}/secrets"
    chmod 700 "${ROOT}/secrets"
    gen_secret postgres_password
    gen_secret smtp_password
    gen_secret secret_key          # JWT da sessão (SECRET_KEY no backend)
    gen_secret agent_api_key       # API key do agente de detecção
    gen_secret agent_hmac_secret   # HMAC do agente

    # Token do Cloudflare: NÃO é aleatório — precisa ser real (Zone:DNS:Edit).
    if [ ! -f "${ROOT}/secrets/cf_dns_api_token" ]; then
        if [ -t 0 ]; then
            echo -n "Cole o Cloudflare API Token (Zone > DNS > Edit, escopo do domínio): "
            read -r cf_token
            [ -n "$cf_token" ] || die "token vazio"
            printf '%s' "$cf_token" > "${ROOT}/secrets/cf_dns_api_token"
            chmod 600 "${ROOT}/secrets/cf_dns_api_token"
            log "gerado secrets/cf_dns_api_token"
        else
            die "secrets/cf_dns_api_token ausente (sem TTY para perguntar). Crie o token no painel do Cloudflare (Permission: Zone - DNS - Edit, Zone Resources: $DOMAIN) e rode:
  printf '%s' 'SEU_TOKEN' > secrets/cf_dns_api_token && chmod 600 secrets/cf_dns_api_token"
        fi
    fi

    if [ ! -f "${ROOT}/secrets/backup.age.key" ]; then
        age-keygen -o "${ROOT}/secrets/backup.age.key" > /dev/null
        chmod 600 "${ROOT}/secrets/backup.age.key"
        log "gerado secrets/backup.age.key"
    fi
    age-keygen -y "${ROOT}/secrets/backup.age.key" > "${ROOT}/secrets/backup-recipients.txt"
    chmod 600 "${ROOT}/secrets/backup-recipients.txt"

    if [ ! -f "${ROOT}/secrets/rclone.conf" ]; then
        cat > "${ROOT}/secrets/rclone.conf" <<'EOF'
# Config rclone para o armazenamento S3 de backups — edite este arquivo.
# Exemplos:  rclone config   (b2 / s3 / r2 ...)
# O remote DEVE bater com RCLONE_REMOTE no .env.prod.
[blue-sentinel-backups]
type = s3
provider = 
endpoint = 
access_key_id =
secret_access_key =
EOF
        chmod 600 "${ROOT}/secrets/rclone.conf"
        log "criado secrets/rclone.conf com PLACEHOLDERS — edite-o (rclone config)"
    fi

    echo
    log "init concluído. Próximos passos:"
    echo "  1) edite ${ENV_FILE} (DOMAIN, ACME_EMAIL, SMTP, GITHUB_*)"
    echo "  2) edite ${ROOT}/secrets/rclone.conf (credenciais S3)"
    echo "  3) confirme secrets/cf_dns_api_token (Cloudflare: Zone - DNS - Edit)"
    echo "  4) aponte o DNS do DOMAIN para o Cloudflare (proxy ATIVADO)"
    echo "  5) ./scripts/deployment/deploy.sh <tag>"
    exit 0
}

# ------------------------------------------------------------------- checks --
preflight() {
    [ -f "$ENV_FILE" ] || die "$ENV_FILE não existe — rode: deploy.sh init"
    command -v docker >/dev/null || die "docker não instalado"
    docker compose version >/dev/null 2>&1 || die "docker compose v2 indisponível"
    docker info >/dev/null 2>&1 || die "sem acesso ao Docker (docker group ou root?)"

    local p
    p="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || echo '?')"
    [ "$p" = "600" ] || log "AVISO: permissão de $ENV_FILE é $p (recomendado: chmod 600)"
    [ -n "$(env_get DOMAIN)" ] || die "DOMAIN vazio em $ENV_FILE"

    local f
    for f in postgres_password smtp_password secret_key agent_api_key \
             agent_hmac_secret cf_dns_api_token backup.age.key; do
        [ -f "${ROOT}/secrets/${f}" ] || die "secrets/${f} ausente — rode: deploy.sh init"
    done
    [ -n "$(env_get IMAGE_TAG)" ] || die "IMAGE_TAG vazio em $ENV_FILE"
}

fetch_images() { # fetch_images <build:0|1>
    if [ "$1" = 1 ]; then
        log "build local das imagens (caddy pode levar minutos: xcaddy)..."
        compose build
    else
        log "pull das imagens ($(env_get IMAGE_TAG))..."
        compose pull caddy backend frontend || die "pull falhou — rode 'docker login ghcr.io' (token PAT com read:packages) ou use --build"
    fi
}

wait_infra() {
    log "subindo infraestrutura (postgres/redis)..."
    compose up -d postgres redis
    local cid i status
    cid="$(compose ps -q postgres | head -n 1)"
    for i in $(seq 1 60); do
        status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo missing)"
        [ "$status" = healthy ] && return 0
        sleep 2
    done
    compose logs --tail 30 postgres || true
    die "postgres não ficou healthy em 120s"
}

run_migrations() {
    log "migrations: alembic upgrade head (imagem $(env_get IMAGE_TAG))..."
    if ! compose run --rm --no-deps -T backend alembic upgrade head; then
        compose logs --tail 100 backend || true
        die "migrations falharam — stack continua na tag anterior (nada foi trocado)"
    fi
    log "migrations OK"
}

main_deploy() {
    local tag="$1" build="$2"
    preflight

    local prev
    prev="$(env_get IMAGE_TAG)"
    log "deploy $prev -> $tag"

    sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${tag}/" "$ENV_FILE"
    history "$tag started (previous=$prev)"

    fetch_images "$build"
    wait_infra
    run_migrations

    log "switch: docker compose up -d (nova tag no ar)..."
    compose up -d --remove-orphans

    log "gate de saúde (até 300s)..."
    if ENV_FILE="$ENV_FILE" "$HEALTHCHECK" --quiet --wait 300; then
        history "$tag ok (previous=$prev)"
        docker image prune -f >/dev/null 2>&1 || true
        log "deploy CONCLUÍDO: $tag"
        compose ps
        exit 0
    fi

    # ---- falhou => rollback automático para a tag anterior ----
    history "$tag FAILED (previous=$prev) — auto-rollback"
    log "gate de saúde FALHOU — iniciando rollback automático para $prev..."
    sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${prev}/" "$ENV_FILE"
    if [ -f "$ROLLBACK" ]; then
        ENV_FILE="$ENV_FILE" "$ROLLBACK" "$prev" --quiet || true
    fi
    die "deploy de $tag falhou; stack restaurada para $prev (veja: docker compose logs backend | caddy)"
}

# --------------------------------------------------------------------- main --
[ $# -ge 1 ] || usage
case "$1" in
    --help|-h) usage ;;
    init) cmd_init ;;
    *) tag="$1"; shift; build=0
       while [ $# -gt 0 ]; do
           case "$1" in
               --build) build=1 ;;
               *) die "opção desconhecida: $1" ;;
           esac
           shift
       done
       case "$tag" in
           v*) main_deploy "$tag" "$build" ;;
           *) die "tag deve começar com 'v' (ex.: v1.4.0) — tags vêm do git/CI" ;;
       esac
       ;;
esac
