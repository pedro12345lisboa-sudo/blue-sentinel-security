#!/usr/bin/env bash
# Hardening do servidor Blue-Sentinel: firewall (UFW + Cloudflare-only nas
# portas Docker), sysctl, fail2ban, unattended-upgrades e regras persistentes.
#
# Uso (DEPOIS do install-docker.sh):
#   sudo ./scripts/setup/harden-server.sh
#   sudo ./scripts/setup/harden-server.sh --help
#
# O que faz:
#   1. UFW: deny incoming, allow SSH (porta detectada, rate-limit), allow 80/443
#   2. DOCKER-USER: só Cloudflare fala com 80/443 do origin (anti-bypass do proxy)
#      -> systemd unit idempotente, roda após o docker subir; CIDRs extraídos do
#         docker/caddy/Caddyfile (fonte única; fallback: cloudflare.com)
#   3. sysctl (anti-SYN/redirect/smurf), fail2ban (sshd), unattended-upgrades
#   4. NÃO mexe em sshd_config (evita lockout) — ver runbook.md
#
# NÃO roda o deploy. Ordem: install-docker.sh -> harden-server.sh -> deploy.sh init
set -euo pipefail

log() { echo "[harden] $*"; }
die() { echo "[harden FALHA] $*" >&2; exit 1; }

usage() { awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"; exit 0; }

case "${1:-}" in --help|-h) usage ;; "") : ;; *) die "argumento desconhecido: $1" ;; esac
[ "$(id -u)" = 0 ] || die "rode com sudo/root"
command -v docker >/dev/null || die "docker ausente — rode antes: scripts/setup/install-docker.sh"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ufw fail2ban unattended-upgrades curl ca-certificates >/dev/null

# ------------------------------------------------- 1. porta SSH detectada ----
detect_ssh_ports() {
    local ports=""
    # Melhor: portas em que o sshd realmente está escutando (cobre drop-ins).
    ports="$(ss -tlnp 2>/dev/null | awk '/sshd/ {print $4}' | sed 's/.*://' | sort -u | tr '\n' ' ')"
    if [ -z "${ports// /}" ]; then
        ports="$(/usr/sbin/sshd -T 2>/dev/null | awk '/^port /{print $2}' || true)"
    fi
    echo "${ports:-22}"
}

SSH_PORTS="$(detect_ssh_ports)"
log "portas SSH detectadas: ${SSH_PORTS}"

# ------------------------------------------------------------- 2. UFW --------
log "configurando UFW (não derruba sua sessão: regra de SSH entra ANTES do enable)..."
ufw --force default deny incoming >/dev/null
ufw --force default allow outgoing >/dev/null
for p in $SSH_PORTS; do
    ufw limit "$p"/tcp comment 'SSH (rate-limit)' >/dev/null
done
ufw allow 80/tcp  comment 'HTTP (Cloudflare->origin; filtro extra em DOCKER-USER)' >/dev/null
ufw allow 443/tcp comment 'HTTPS (Cloudflare->origin; filtro extra em DOCKER-USER)' >/dev/null
ufw --force enable >/dev/null
log "UFW ativo: $(ufw status | head -n 1)"

# --------------------------------------------------- 3. Cloudflare-only ------
# Fonte única das faixas: a linha `@cf remote_ip ...` do docker/caddy/Caddyfile
# (versionada no repo). Fallback: download oficial, se o repo não estiver aqui.
IPS_FILE=/etc/blue-sentinel/cloudflare-ips.txt
FW_SCRIPT=/usr/local/sbin/blue-sentinel-fw.sh
CADDYFILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/docker/caddy/Caddyfile"
mkdir -p /etc/blue-sentinel

if [ -f "$CADDYFILE" ]; then
    grep -E '^@cf remote_ip ' "$CADDYFILE" | tr ' ' '\n' | grep -E '/[0-9]+$' \
        > "$IPS_FILE" || true
fi

if [ ! -s "$IPS_FILE" ]; then
    log "Caddyfile não encontrado — baixando faixas de cloudflare.com..."
    curl -fsS --max-time 15 https://www.cloudflare.com/ips-v4 -o /tmp/cf-v4 \
        && curl -fsS --max-time 15 https://www.cloudflare.com/ips-v6 -o /tmp/cf-v6 \
        && cat /tmp/cf-v4 /tmp/cf-v6 > "$IPS_FILE" \
        && rm -f /tmp/cf-v4 /tmp/cf-v6 \
        || die "sem repo e sem rede para as faixas do Cloudflare"
fi
grep -q '/' "$IPS_FILE" || die "extraiu 0 faixas de $IPS_FILE"
log "faixas em $IPS_FILE: $(grep -c . "$IPS_FILE") CIDRs (v4+v6)"
chmod 644 "$IPS_FILE"

cat > "$FW_SCRIPT" <<'FW'
#!/usr/bin/env bash
# Idempotente: (re)cria a chain BLUE-CF-V4/v6 e a prende em DOCKER-USER.
# Portas 80/443 publicadas só respondem a origem Cloudflare; resto é DROP.
# As faixas vêm de /etc/blue-sentinel/cloudflare-ips.txt (gerado pelo
# harden-server.sh a partir do Caddyfile) — sem rede no boot.
set -euo pipefail
IPS_FILE=/etc/blue-sentinel/cloudflare-ips.txt
PORTS="80 443"

[ -s "$IPS_FILE" ] || { echo "sem $IPS_FILE" >&2; exit 1; }

v4() { grep -E '^[0-9]+\.[0-9]+' "$IPS_FILE"; }
v6() { grep -E ':' "$IPS_FILE"; }

# ---------------- IPv4 ----------------
if iptables -L DOCKER-USER -n >/dev/null 2>&1; then
    iptables -N BLUE-CF-V4 2>/dev/null || true
    iptables -F BLUE-CF-V4
    while read -r range; do
        [ -n "$range" ] || continue
        for port in $PORTS; do
            iptables -A BLUE-CF-V4 -s "$range" -p tcp --dport "$port" -m comment \
                --comment "cloudflare-ok" -j ACCEPT
        done
    done < <(v4)
    # Qualquer outro originário para 80/443: silencioso (DROP).
    for port in $PORTS; do
        iptables -A BLUE-CF-V4 -p tcp --dport "$port" -m comment \
            --comment "nao-cloudflare" -j DROP
    done
    # Resto do tráfego do docker segue normalmente.
    iptables -C DOCKER-USER -j BLUE-CF-V4 2>/dev/null || iptables -I DOCKER-USER 1 -j BLUE-CF-V4
fi

# ---------------- IPv6 ----------------
if ip6tables -L DOCKER-USER -n >/dev/null 2>&1; then
    ip6tables -N BLUE-CF-V6 2>/dev/null || true
    ip6tables -F BLUE-CF-V6
    while read -r range; do
        [ -n "$range" ] || continue
        for port in $PORTS; do
            ip6tables -A BLUE-CF-V6 -s "$range" -p tcp --dport "$port" -m comment \
                --comment "cloudflare-ok" -j ACCEPT
        done
    done < <(v6)
    for port in $PORTS; do
        ip6tables -A BLUE-CF-V6 -p tcp --dport "$port" -m comment \
            --comment "nao-cloudflare" -j DROP
    done
    ip6tables -C DOCKER-USER -j BLUE-CF-V6 2>/dev/null || ip6tables -I DOCKER-USER 1 -j BLUE-CF-V6
fi
echo "blue-sentinel-fw: regras aplicadas ($(date -u +%FT%TZ))"
FW
chmod 700 "$FW_SCRIPT"

cat > /etc/systemd/system/blue-sentinel-fw.service <<'UNIT'
[Unit]
Description=Firewall Cloudflare-only para portas Docker do Blue-Sentinel
After=docker.service network-online.target
Wants=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/blue-sentinel-fw.sh
ExecReload=/usr/local/sbin/blue-sentinel-fw.sh

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now blue-sentinel-fw.service
systemctl restart blue-sentinel-fw.service
log "regra DOCKER-USER ativa: só Cloudflare alcança 80/443"

# --------------------------------------------------------- 4. sysctl ---------
cat > /etc/sysctl.d/99-blue-sentinel.conf <<'SYSCTL'
# Blue-Sentinel — hardening de rede/núcleo
# (ip_unprivileged_port_start fica POR CONTAINER no compose — não global)
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.tcp_syncookies = 1
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
kernel.yama.ptrace_scope = 1
fs.protected_symlinks = 1
fs.protected_hardlinks = 1
SYSCTL
sysctl --system >/dev/null
log "sysctl aplicado (/etc/sysctl.d/99-blue-sentinel.conf)"

# -------------------------------------------------------- 5. fail2ban ---------
mkdir -p /etc/fail2ban/jail.d
cat > /etc/fail2ban/jail.d/blue-sentinel.local <<FJB
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port = $(echo ${SSH_PORTS} | tr ' ' ',')
FJB
systemctl enable --now fail2ban
systemctl restart fail2ban
log "fail2ban ativo (jail sshd)"

# ------------------------------------------- 6. unattended-upgrades -----------
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'APTU'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APTU
systemctl enable --now unattended-upgrades
log "unattended-upgrades ativo (segurança automática)"

log "hardening CONCLUÍDO. Valide:"
echo "  ufw status verbose          # 80/443 + SSH (rate-limit) visíveis"
echo "  systemctl status blue-sentinel-fw"
echo "  fail2ban-client status sshd"
echo "  (opcional recomendado no runbook: sshd PasswordAuthentication no)"
exit 0
