# Infraestrutura de Produção — Blue-Sentinel

Referência da stack de produção: topologia, portas, isolamento, TLS, segredos,
firewall e imagens. Procedimentos (dia a dia, incidentes) ficam no
[runbook](runbook.md); recuperação de desastre, no
[disaster-recovery](disaster-recovery.md).

## 1. Topologia

```text
Visitante
   │  HTTPS (443)
   ▼
┌──────────────────────── Cloudflare ────────────────────────┐
│  proxy ATIVADO (IP do origin escondido), cache, WAF, TLS   │
│  Caddy fala com o origin APENAS a partir destas faixas:     │
│  https://www.cloudflare.com/ips-v4 | ips-v6                │
└──────────────────────────────┬─────────────────────────────┘
                               │  HTTP/HTTPS (80/443) — origem Cloudflare
                               ▼
┌──────────────────────────── VPS ──────────────────────────────────────────┐
│ UFW: 22 (rate-limit) / 80 / 443      sysctl + fail2ban + auto-updates     │
│ DOCKER-USER (blue-sentinel-fw): 80/443 só de faixas CF — resto é DROP     │
│                                                                           │
│  caddy:80/443 (imagem custom xcaddy+cloudflare, USER caddy, read_only)    │
│      │  rede edge                                                          │
│      ├── /api/v1/*  ──────────────►  backend:8000 (uvicorn, read_only)     │
│      │                                  │ rede backend (internal: true)    │
│      │                                  ├── postgres:5432 (sem porta pub.) │
│      │                                  └── redis:6379   (sem porta pub.)  │
│      └── /*  ─────────────────────►  frontend:3000 (Next standalone)       │
│                                        └─ também na rede edge              │
└───────────────────────────────────────────────────────────────────────────┘
                     │                                │
              GHCR (imagens v*)                 S3 via rclone (backups age)
```

- **Único ponto de entrada**: as portas 80/443 publicadas do serviço `caddy`.
  Nenhum outro serviço publica porta.
- **Duas redes Docker**:
  - `edge` (bridge): caddy ↔ backend ↔ frontend. É a única rede com saída
    externa (ACME DNS-01, API do GitHub).
  - `backend` (bridge, **`internal: true`**): backend ↔ postgres ↔ redis.
    Sem rota para a internet — nem o firewall do host precisa ser a última
    linha de defesa ali.
- Não há serviço `worker` em produção: o e-mail do formulário roda como
  `BackgroundTasks` no próprio backend (`app/api/v1/contact.py`).

## 2. Portas e exposição (critério de aceitação)

| Porta | Quem publica | Quem alcança | Verificação |
|------:|--------------|--------------|-------------|
| 80/tcp | caddy | Cloudflare (80→443 redirect) + resto DROP | `healthcheck.sh` |
| 443/tcp | caddy | Cloudflare; acesso direto = 403 no Caddy | `healthcheck.sh` + `openssl s_client` |
| 22/tcp | host | mundo, com rate-limit do UFW | `ufw status` |
| 5432, 6379, 8000, 3000, 2019 | **ninguém** | nem localhost (só dentro da rede Docker) | `healthcheck.sh` faz scan e **falha** se abrir |

O `healthcheck.sh` valida tudo isso a cada execução e é o gate do deploy.

## 3. Fluxo de uma requisição (e o IP real do visitante)

1. Visitante → Cloudflare. O CF define `CF-Connecting-IP` (IP do visitante)
   e **invalida** cabeçalhos equivalentes vindos do cliente.
2. Cloudflare → Caddy (origin). O Caddy só responde se o IP de origem estiver
   nas faixas do CF (`@cf remote_ip ...`); fora delas, `403`.
3. Caddy repassa com
   `header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}` —
   ou seja, **um único IP**, o do visitante.
4. O uvicorn roda com `--proxy-headers --forwarded-allow-ips=*` e usa a
   **primeira** entrada do `X-Forwarded-For` = IP real. É ele que alimenta o
   rate limit por IP. Nenhuma mudança de código é necessária.

Rotas no Caddy (mesmo domínio):

- `/api/v1/*` → `backend:8000` (WebSocket do laboratório incluso — o Caddy
  faz upgrade por padrão).
- todo o resto → `frontend:3000`.

## 4. TLS e Cloudflare

- **ACME DNS-01** com o plugin `caddy-dns/cloudflare` (compilado na imagem via
  `xcaddy` — a imagem oficial do Caddy **não** tem o módulo). Não dependemos
  de HTTP-01: o proxy do Cloudflare nunca precisa repassar
  `/.well-known/acme-challenge/*`.
- Variáveis: `DOMAIN`, `ACME_EMAIL` (`.env.prod`) e o token
  `secrets/cf_dns_api_token` (permissão **Zone — DNS — Edit**, zona do domínio).
- Certificado é emitido/renovado pelo Caddy no volume `caddy_data`. O
  `healthcheck.sh` falha se o cert público do edge expirar em < 14 dias.
- Configuração do Cloudflare no primeiro deploy:
  - Registro **A** apontando para o IP da VPS, **proxy ativado** (nuvem laranja).
  - SSL/TLS mode: **Full (strict)** (o origin tem cert LE real).
  - Always Use HTTPS: on. TLS 1.2 mínimo (já garantido no Caddy).
  - Cache Rule: **Bypass cache** para `/api/v1/*` (o backend já manda
    `Cache-Control: no-store` nos endpoints de saúde; a regra blinda o resto).
- **Fonte única das faixas do CF**: a linha `@cf remote_ip ...` do
  `docker/caddy/Caddyfile`. Ela alimenta o Caddy **e** o firewall
  (`harden-server.sh` extrai os CIDRs de lá). Se o CF mudar as faixas, o
  `healthcheck.sh` avisa — atualizar o Caddyfile, revalidar
  (`caddy validate`), fazer deploy e rodar `harden-server.sh` de novo.

### Variante de depuração

`CADDY_CONFIG=Caddyfile.direct` no `.env.prod` usa
`docker/caddy/Caddyfile.direct`: não filtra por faixa de CF (DNS-only) —
apenas para testar o origin diretamente. Voltar ao normal exige redefinir
`CADDY_CONFIG=Caddyfile` e reiniciar o Caddy.

## 5. Serviços (docker-compose.prod.yml)

| Serviço | Imagem | Portas | Healthcheck | Limites | Notas |
|---------|--------|--------|-------------|---------|-------|
| caddy | `.../blue-sentinel-caddy:<tag>` | 80, 443 | admin API `:2019` | 0.5 CPU / 128M | `USER caddy` + `net.ipv4.ip_unprivileged_port_start=0` (fallback: `cap_add: NET_BIND_SERVICE` em kernel < 4.11) |
| postgres | `postgres:16-alpine` | — | `pg_isready` | 1 CPU / 512M | volume `postgres_data`; `POSTGRES_PASSWORD_FILE` nativo; `user: postgres` |
| redis | `redis:7-alpine` | — | `redis-cli ping` | 0.5 CPU / 256M | AOF everysec (fila de e-mail não pode sumir); `volatile-lru`; **sem senha** (rede internal, decisão registrada) |
| backend | `.../blue-sentinel-backend:<tag>` | — | `/api/v1/health/ready` **com grep** `"status":"ok"` | 2 CPU / 768M | uvicorn `--proxy-headers`; `RATE_LIMIT_FAIL_CLOSED=true`; rules montadas em `/rules:ro` |
| frontend | `.../blue-sentinel-frontend:<tag>` | — | `wget localhost:3000` | 1 CPU / 512M | standalone; `BACKEND_INTERNAL_URL` só nos rewrites; cache ISR em tmpfs |

Todos: `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges`, `pids_limit`,
restart `unless-stopped`, logs `json-file` com rotação 10M×3.

O healthcheck do backend faz grep porque `/health/ready` retorna HTTP 200
mesmo em estado *degraded* — o gate precisa do `"status":"ok"` real
(Postgres + Redis + disco OK).

## 6. Segredos

Arquivos em `./secrets/` (dir `700`, arquivos `600`, **fora do Git**), montados
como Docker secrets e exportados pelo entrypoint `docker/load-secrets.sh`
(só quando a variável está vazia — nunca sobrescreve env explícito):

| Arquivo | Variável exportada | Consumidor | Geração/Origem |
|---------|--------------------|------------|----------------|
| `postgres_password` | `POSTGRES_PASSWORD` | postgres, backend | `deploy.sh init` (aleatório) |
| `secret_key` | `SECRET_KEY` | backend (JWT) | `deploy.sh init` (aleatório) |
| `agent_api_key` | `AGENT_API_KEY` | backend | `deploy.sh init` (aleatório) |
| `agent_hmac_secret` | `AGENT_HMAC_SECRET` | backend | `deploy.sh init` (aleatório) |
| `smtp_password` | `SMTP_PASSWORD` | backend | `deploy.sh init` (aleatório; substituir pelo real do provedor) |
| `cf_dns_api_token` | `CF_DNS_API_TOKEN` | caddy | **manual**: token real do CF (DNS Edit) |
| `backup.age.key` | — (só scripts) | age (backup/restore) | `deploy.sh init` (`age-keygen`) — **escrow externo obrigatório** |
| `backup-recipients.txt` | — | age (destinatários) | derivada da chave acima |
| `rclone.conf` | — | rclone (S3) | **manual**: `rclone config` |

Rotinas de rotação: [runbook §7](runbook.md).

## 7. Firewall e hardening (scripts/setup/)

`harden-server.sh` (idempotente, roda antes do primeiro deploy):

1. **UFW**: padrão *deny incoming* / *allow outgoing*; SSH detectado
   (`sshd` escutando) com `ufw limit`; 80/443 liberados no INPUT (o filtro
   real das portas Docker fica no próximo item).
2. **DOCKER-USER**: unit systemd `blue-sentinel-fw.service`
   (`After=docker.service`) aplica a chain `BLUE-CF-V4/v6`:
   aceita 80/443 só das faixas do CF (CIDRs extraídos do Caddyfile →
   `/etc/blue-sentinel/cloudflare-ips.txt`) e **DROP** no resto; demais
   tráfegos do Docker retornam intactos. Sem dependência de rede no boot.
3. **sysctl** (`/etc/sysctl.d/99-blue-sentinel.conf`): rp_filter, anti-redirect,
   syncookies, kptr/dmesg/yama.
4. **fail2ban** (jail `sshd`, ban 1h) e **unattended-upgrades** (diário).
5. **Não mexe em `sshd_config`** (evita lockout) — endurecimento manual
   recomendado no runbook.

`install-docker.sh` instala Docker Engine + Compose v2 pelo repositório
oficial (mais `age`, `rclone`, `jq`, UFW, fail2ban) e adiciona o usuário ao
grupo `docker`.

## 8. Imagens, CI e configuração

- Registro: `ghcr.io/pedro12345lisboa-sudo/blue-sentinel-{caddy,backend,frontend}`.
- Release: `.github/workflows/release.yml` dispara em **tag `v*`**, roda os
  gates (pytest ≥85%, regras, lint/tipos/unit do frontend) e só então faz
  build/push (BuildKit + cache GHA). Tags publicadas: `vX.Y.Z`.
- Build contexts: `docker/caddy` (xcaddy + cloudflare), `backend`, `frontend`.
  As imagens de produção são **genéricas** (nenhum domínio embutido no build).
- Deploy no servidor: `./scripts/deployment/deploy.sh vX.Y.Z` — pull da tag,
  migrations antes do switch, gate de saúde, auto-rollback.
  `--build` é o fallback offline do registro (build local).
- Artefatos versionados com o código: `docker-compose.prod.yml`,
  `docker/caddy/*`, `docker/load-secrets.sh`, `.env.prod.example`,
  `scripts/deployment/*`, `scripts/setup/*`.
- Configuração por ambiente: **`.env.prod`** (produção). Staging usa
  `.env.staging` + `ENV_FILE=.env.staging` (+ `COMPOSE_PROJECT_NAME` e
  `DOMAIN` distintos, idealmente outro host) — nunca compartilhar o mesmo
  `.env` entre ambientes.

## 9. Dados e retenção

| Dado | Onde | Persistência | Backup |
|------|------|--------------|--------|
| Mensagens de contato, sessões do lab, logs de auditoria | volume `postgres_data` | permanente | `pg_dump -Fc` diário, criptografado (age), local + S3 (rclone) |
| Fila de e-mail + cache | volume `redis_data` (AOF) | permanente | **não** backupado: é fila volátil; perda = reenviar contato manualmente |
| Certificados/conta ACME do Caddy | volume `caddy_data` | permanente | recreável (rate limits do LE; escassez é monitorada pelo healthcheck) |
| `.env.prod` + `secrets/` | disco do host | permanente | tar `.tar.age` no **mesmo backup diário** (essencial para DR) |
| Imagens | registro + disco local | recreáveis | `docker pull` (não é backup) |

Detalhes, RPO/RTO e playbooks: [disaster-recovery](disaster-recovery.md).

## 10. Observabilidade

- `./scripts/deployment/healthcheck.sh` — checagem completa (containers,
  readiness interno, HTTPS público, portas fechadas, cert, disco, faixas CF);
  `--wait 240` é o gate de deploy; `--quiet` para scripts.
- Logs: `docker compose logs -f <svc>` (JSON com rotação) e
  `logs/{backup,restore-test}.log` dos crons.
- O Caddy loga em JSON no stdout (`output stdout`, `format json`).
- Não há coletor central nesta fase — para alerta, apontar um monitor de
  uptime em `https://<DOMAIN>/api/v1/health/ready` (pode ser externo, ex.:
  Uptime Kuma/Healthchecks.io) e monitorar o exit code do `healthcheck.sh`
  via cron próprio.
