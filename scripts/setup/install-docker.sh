#!/usr/bin/env bash
# Instala Docker Engine + Compose v2 pelo repositório oficial (Ubuntu/Debian).
#
# Uso:
#   sudo ./scripts/setup/install-docker.sh [usuario-para-docker-group]
#   sudo ./scripts/setup/install-docker.sh --help
#
# Após rodar: relogue (ou `newgrp docker`) e valide:
#   docker version && docker compose version
# Ordem recomendada no servidor: install-docker.sh -> harden-server.sh
set -euo pipefail

log() { echo "[docker-install] $*"; }
die() { echo "[docker-install FALHA] $*" >&2; exit 1; }

usage() { awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"; exit 0; }

[ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ] && usage

[ "$(id -u)" = 0 ] || die "rode com sudo/root"

# Usuário que entra no grupo docker: argumento > SUDO_USER (não use root).
TARGET_USER="${1:-${SUDO_USER:-}}"

export DEBIAN_FRONTEND=noninteractive

# Compatibilidade com pacotes antigos/distro (docker.io, podman, etc.)
log "removendo pacotes conflitantes (se houver)..."
for pkg in docker.io docker-compose docker-compose-v2 podman-docker runc containerd; do
    apt-get remove -y --purge "$pkg" >/dev/null 2>&1 || true
done
apt-get autoremove -y >/dev/null 2>&1 || true

log "checando distribuição..."
. /etc/os-release
case "${ID:-}:${VERSION_CODENAME:-}" in
    ubuntu:*|debian:*) log "ok: ${PRETTY_NAME:-$ID}" ;;
    *) die "distro não suportada por este script (use Ubuntu 22.04+/Debian 12+): ${ID:-?}" ;;
esac

log "instalando pré-requisitos + age/rclone/jq (usados pelos scripts de backup)..."
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg lsb-release \
    age rclone jq openssl ufw fail2ban unattended-upgrades >/dev/null

# --------------------------- repositório oficial do Docker -------------------
install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
    log "baixando chave GPG do Docker..."
    curl -fsSL https://download.docker.com/linux/"${ID}"/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
fi

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list

apt-get update -qq
log "instalando docker-ce, cli, containerd, buildx e compose plugin..."
apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin >/dev/null

systemctl enable --now docker

# ------------------------------- grupo docker -------------------------------
if [ -n "$TARGET_USER" ] && [ "$TARGET_USER" != root ] && id "$TARGET_USER" >/dev/null 2>&1; then
    usermod -aG docker "$TARGET_USER"
    log "usuário '${TARGET_USER}' adicionado ao grupo docker (relogue para efeito)"
else
    log "AVISO: nenhum usuário indicado para o grupo docker (root já tem acesso)"
fi

# ------------------------------- validação ----------------------------------
docker version >/dev/null 2>&1 || die "docker não respondeu após instalação"
docker compose version >/dev/null 2>&1 || die "docker compose v2 indisponível"
log "OK: $(docker --version) / $(docker compose version | head -n 1)"
log "próximo: sudo ./scripts/setup/harden-server.sh"
