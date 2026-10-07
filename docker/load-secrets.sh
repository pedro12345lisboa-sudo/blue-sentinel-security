#!/bin/sh
# Carrega segredos do Docker (/run/secrets/<nome>) em variáveis de ambiente,
# mas apenas quando a variável ainda está vazia (nunca sobrescreve).
#
# Uso: entrypoint dos serviços que consomem segredos (caddy, backend):
#   entrypoint: ["/usr/local/bin/load-secrets.sh"]
#   command: [...]
#
# Compatível com busybox sh (Alpine) e dash (Debian).
set -eu

load_secret() {
    _var="$1"
    _name="$2"
    _file="/run/secrets/${_name}"
    [ -r "$_file" ] || return 0
    eval "_current=\${$_var:-}"
    if [ -z "$_current" ]; then
        export "$_var=$(cat "$_file")"
    fi
}

load_secret POSTGRES_PASSWORD postgres_password
load_secret SECRET_KEY secret_key
load_secret AGENT_API_KEY agent_api_key
load_secret AGENT_HMAC_SECRET agent_hmac_secret
load_secret SMTP_PASSWORD smtp_password
load_secret CF_DNS_API_TOKEN cf_dns_api_token

exec "$@"
