#!/usr/bin/env bash
# Health check da produção: containers, readiness interno, HTTPS público,
# portas internas fechadas (banco/Redis/backup), certificado e disco.
#
# Uso:
#   healthcheck.sh                  # uma execução, relatório completo
#   healthcheck.sh --quiet          # só falas/avisos (usado pelo deploy)
#   healthcheck.sh --wait 240       # repete até OK ou 240s (gate do deploy)
#   healthcheck.sh --help
#
# Env: ENV_FILE (padrão <repo>/.env.prod)
# Código de saída: 0 = tudo OK (avisos não derrubam), 1 = falha.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT}/.env.prod}"
COMPOSE_FILE="${ROOT}/docker-compose.prod.yml"

QUIET=0
WAIT=0

usage() { awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"; exit 0; }

while [ $# -gt 0 ]; do
    case "$1" in
        --quiet) QUIET=1 ;;
        --wait) WAIT="${2:?--wait precisa de segundos}"; shift ;;
        --help|-h) usage ;;
        *) echo "opção desconhecida: $1" >&2; exit 2 ;;
    esac
    shift
done

[ -f "$ENV_FILE" ] || { echo "FATAL: $ENV_FILE não existe (rode deploy.sh init)" >&2; exit 1; }

env_get() { grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true; }

DOMAIN="$(env_get DOMAIN)"
POSTGRES_USER="$(env_get POSTGRES_USER)"; POSTGRES_USER="${POSTGRES_USER:-sentinel}"
POSTGRES_DB="$(env_get POSTGRES_DB)"; POSTGRES_DB="${POSTGRES_DB:-blue_sentinel}"

compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

FAILURES=0
WARNINGS=0

ok()   { [ "$QUIET" = 1 ] || echo "[ OK ] $1"; }
warn() { WARNINGS=$((WARNINGS + 1)); echo "[WARN] $1"; }
fail() { FAILURES=$((FAILURES + 1)); echo "[FAIL] $1"; }

# --- 1. Containers: rodando e healthy ---------------------------------------
check_containers() {
    local svc cid status
    for svc in caddy postgres redis backend frontend; do
        cid="$(compose ps -q "$svc" 2>/dev/null | head -n 1 || true)"
        if [ -z "$cid" ]; then
            fail "container do serviço '$svc' não existe (compose up?)"
            continue
        fi
        status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo missing)"
        case "$status" in
            healthy|running) ok "svc $svc: $status" ;;
            starting)       fail "svc $svc: ainda subindo (health starting)" ;;
            restarting)     fail "svc $svc: em restart — veja docker logs --tail 50 ${svc}" ;;
            *)              fail "svc $svc: status=$status" ;;
        esac
    done
}

# --- 2. Readiness interno (dentro da rede, sem depender do proxy/CF) --------
check_backend_ready() {
    local out
    if out="$(compose exec -T backend curl -fsS http://localhost:8000/api/v1/health/ready 2>/dev/null)" \
        && printf '%s' "$out" | grep -q '"status":"ok"'; then
        ok "backend readiness interno: ok"
    else
        fail "backend readiness interno falhou (postgres/redis/disco?)"
    fi
}

# --- 3. HTTPS público (passa pelo Cloudflare -> origin) ---------------------
check_https() {
    local out
    if [ -z "$DOMAIN" ]; then
        warn "DOMAIN vazio no .env — pulando checagem de HTTPS"
        return 0
    fi
    if out="$(curl -fsS --max-time 15 "https://${DOMAIN}/api/v1/health/ready" 2>/dev/null)" \
        && printf '%s' "$out" | grep -q '"status":"ok"'; then
        ok "HTTPS https://${DOMAIN}/api/v1/health/ready: ok"
    else
        fail "HTTPS público falhou em https://${DOMAIN} (DNS, CF->origin ou app?)"
    fi
}

# --- 4. Portas que NÃO podem estar publicadas ------------------------------
# Critério de aceitação: 5432/6379/8000/3000 fechadas no próprio servidor.
check_ports_closed() {
    local p
    for p in 5432 6379 8000 3000 2019; do
        if timeout 3 bash -c "exec 3<>/dev/tcp/127.0.0.1/${p}" 2>/dev/null; then
            fail "porta ${p} ABERTA em 127.0.0.1 (não deveria aceitar conexão)"
        else
            ok "porta ${p}: fechada"
        fi
    done
}

# --- 5. Certificado público (é o que o scanner público vê) -----------------
check_cert() {
    local enddate
    if [ -z "$DOMAIN" ]; then return 0; fi
    if enddate="$(echo | timeout 10 openssl s_client -connect "${DOMAIN}:443" -servername "$DOMAIN" 2>/dev/null \
        | openssl x509 -checkend $((14 * 86400)) -noout 2>/dev/null)"; then
        ok "certificado válido por mais de 14 dias (edge Cloudflare)"
    else
        fail "certificado expira em menos de 14 dias (ou handshake falhou): ${DOMAIN}"
    fi
}

# --- 6. Disco ---------------------------------------------------------------
check_disk() {
    local pct
    pct="$(df -P / 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print $5}')"
    if [ -z "$pct" ]; then
        warn "não foi possível ler o uso de disco"
    elif [ "$pct" -ge 90 ]; then
        fail "disco em ${pct}% (>= 90) — limpeza urgente (runbook: disco encher)"
    elif [ "$pct" -ge 80 ]; then
        warn "disco em ${pct}% (>= 80)"
    else
        ok "disco: ${pct}%"
    fi
}

# --- 7. Faixas do Cloudflare atualizadas (só aviso) ------------------------
check_cf_ips() {
    local caddyfile="${ROOT}/docker/caddy/Caddyfile"
    local remote_v4 local_v4
    [ -f "$caddyfile" ] || return 0
    remote_v4="$(curl -fsS --max-time 10 https://www.cloudflare.com/ips-v4 2>/dev/null | sort || true)"
    [ -n "$remote_v4" ] || return 0   # sem rede: pula (não é falha)
    local_v4="$(grep -E '^@cf remote_ip ' "$caddyfile" | tr ' ' '\n' | grep -E '^[0-9]+\.' | sort || true)"
    if [ "$remote_v4" != "$local_v4" ]; then
        warn "faixas IPv4 do Cloudflare no Caddyfile desatualizadas (ver https://www.cloudflare.com/ips-v4)"
    else
        ok "faixas IPv4 do Cloudflare: atualizadas"
    fi
}

run_all() {
    FAILURES=0
    WARNINGS=0
    check_containers
    check_backend_ready
    check_https
    check_ports_closed
    check_cert
    check_disk
    check_cf_ips
    if [ "$FAILURES" -gt 0 ]; then
        echo "=> ${FAILURES} falha(s), ${WARNINGS} aviso(s)"
        return 1
    fi
    [ "$QUIET" = 1 ] || echo "=> tudo OK (${WARNINGS} aviso(s))"
    return 0
}

if [ "$WAIT" -gt 0 ] 2>/dev/null; then
    deadline=$(( $(date +%s) + WAIT ))
    while :; do
        if run_all; then exit 0; fi
        [ "$(date +%s)" -lt "$deadline" ] || { echo "=> gate de saúde NÃO passou em ${WAIT}s" >&2; exit 1; }
        sleep 5
    done
else
    run_all || exit 1
fi
