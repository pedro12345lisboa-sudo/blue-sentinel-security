#!/usr/bin/env bash
# Rollback da produção para uma tag anterior (imagens já baixadas + gate de saúde).
#
# Uso:
#   rollback.sh                # volta para a tag anterior à atual (histórico)
#   rollback.sh <tag>          # volta para uma tag específica (ex.: v1.3.0)
#   rollback.sh --list         # mostra o histórico de deploys
#   rollback.sh --quiet        # menos saída (usado pelo deploy.sh)
#   rollback.sh --help
#
# IMPORTANTE: o rollback SÓ troca as imagens. Migrations nunca são "desfeitas"
# (política expand-contract — ver docs/architecture/runbook.md). Por isso
# deploys com mudança irreversível exigem backup antes (backup.sh).
#
# Env: ENV_FILE (padrão <repo>/.env.prod)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT}/.env.prod}"
COMPOSE_FILE="${ROOT}/docker-compose.prod.yml"
HISTORY="${ROOT}/.deploy-history"
HEALTHCHECK="${SCRIPT_DIR}/healthcheck.sh"

QUIET=0
log()  { [ "$QUIET" = 1 ] || echo "[rollback $(date -u +%H:%M:%S)] $*"; }
die()  { echo "[rollback FALHA] $*" >&2; exit 1; }

compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
env_get() { grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true; }
history() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$HISTORY"; }

usage() { awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"; exit 0; }

list_history() {
    if [ -f "$HISTORY" ]; then
        cat "$HISTORY"
    else
        echo "(sem histórico: $HISTORY)"
    fi
    exit 0
}

# Última tag diferente da atual registrada com "ok" ou "started".
previous_tag() {
    local cur
    cur="$(env_get IMAGE_TAG)"
    grep -E ' (ok|started) ' "$HISTORY" 2>/dev/null \
        | awk '{print $2}' | grep -v "^${cur}\$" | tail -n 1 || true
}

TAG=""
while [ $# -gt 0 ]; do
    case "$1" in
        --list) list_history ;;
        --quiet) QUIET=1; shift; continue ;;
        --help|-h) usage ;;
        v*) TAG="$1" ;;
        *) die "argumento desconhecido: $1" ;;
    esac
    shift
done

[ -f "$ENV_FILE" ] || die "$ENV_FILE não existe"
docker info >/dev/null 2>&1 || die "sem acesso ao Docker"

if [ -z "$TAG" ]; then
    TAG="$(previous_tag)"
    [ -n "$TAG" ] || die "não achei tag anterior no histórico — especifique: rollback.sh <tag>"
fi

CUR="$(env_get IMAGE_TAG)"
if [ "$TAG" = "$CUR" ]; then
    log "tag atual já é $TAG — subindo de novo mesmo assim (redeploy)"
fi

log "rollback: $CUR -> $TAG"
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${TAG}/" "$ENV_FILE"

log "subindo stack com a tag $TAG (imagens normalmente já estão locais)..."
compose up -d --remove-orphans

log "gate de saúde (até 300s)..."
if ENV_FILE="$ENV_FILE" "$HEALTHCHECK" --quiet --wait 300; then
    history "ROLLBACK ok $TAG (from=$CUR)"
    log "rollback CONCLUÍDO: $TAG"
    compose ps
    exit 0
fi

history "ROLLBACK FAILED $TAG (from=$CUR)"
die "rollback para $TAG NÃO passou no gate — veja 'docker compose logs backend caddy'. Estado: IMAGE_TAG=$TAG em $ENV_FILE"
