# Caddy com o provedor DNS Cloudflare (ACME DNS-01).
# A imagem oficial só traz os módulos "standard" — o caddy-dns/cloudflare
# precisa ser compilado (xcaddy). Construída pelo release.yml e, em último
# caso, localmente via `docker compose build caddy`.

FROM caddy:2.11-builder AS builder

RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2.11

COPY --from=builder /usr/bin/caddy /usr/bin/caddy

# A imagem oficial não cria usuário de serviço: cria um não-root dedicado.
# Portas 80/443 são ligadas por este usuário graças a
# net.ipv4.ip_unprivileged_port_start=0 (docker-compose.prod.yml) — a imagem
# oficial usava setcap, mas o set é perdido no COPY e cap_drop: ALL removeria
# a capacidade de qualquer forma.
RUN addgroup -S -g 10001 caddy \
 && adduser -S -u 10001 -G caddy caddy \
 && chmod 1777 /data/caddy /config/caddy

USER caddy:caddy

EXPOSE 80 443
