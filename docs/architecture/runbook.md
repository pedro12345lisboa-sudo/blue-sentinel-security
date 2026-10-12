# Runbook de Operação — Blue-Sentinel (produção)

Guia prático de operação. Topologia e explicações: [infrastructure](infrastructure.md).
Recuperação de desastre: [disaster-recovery](disaster-recovery.md).

## 1. Convenções

- Repo clonado em `/opt/blue-sentinel` (qualquer caminho serve; os scripts
  resolvem a raiz sozinhos).
- Comandos executados **na raiz do repo**, como usuário com acesso ao Docker
  (grupo `docker`) — os crons rodam como `root`.
- `ENV_FILE` aponta para o ambiente (padrão `.env.prod`). Staging:
  `ENV_FILE=.env.staging ./scripts/deployment/deploy.sh ...`
- Todo script aceita `--help`.

Atalhos usados abaixo:

```bash
HC=./scripts/deployment/healthcheck.sh
DC="docker compose --env-file .env.prod -f docker-compose.prod.yml"
```

## 2. Instalação do zero (servidor novo)

```bash
# 1) como root, no diretório do repo (git clone primeiro, se preferir)
sudo ./scripts/setup/install-docker.sh SEU_USUARIO   # Docker + age + rclone + UFW
sudo ./scripts/setup/harden-server.sh                # firewall/CLOUDFLARE-only + sysctl + fail2ban

# 2) configuração
./scripts/deployment/deploy.sh init                  # .env.prod + secrets (+ pergunta o token CF)
$EDITOR .env.prod                                    # DOMAIN, ACME_EMAIL, SMTP_*, GITHUB_*
$EDITOR secrets/rclone.conf                          # credenciais S3 do backup
# DNS: registro A do DOMAIN → IP da VPS, com proxy do Cloudflare ATIVADO

# 3) primeiro deploy (tag publicada pelo CI em vX.Y.Z)
./scripts/deployment/deploy.sh v0.1.0

# 4) backups e cron
sudo ./scripts/deployment/backup.sh --install-cron   # diário + teste mensal de restore
./scripts/deployment/backup.sh --verify              # confere remoto + criptografia
```

Checklist pós-instalação: `$HC` verde; `ufw status verbose` só 22/80/443;
`systemctl status blue-sentinel-fw` ativo; `fail2ban-client status sshd`;
e guardar o **escrow da `secrets/backup.age.key`** fora do servidor
([disaster-recovery §3](disaster-recovery.md)).

## 3. Checagem de saúde

```bash
$HC              # relatório completo; exit 0 = OK
$HC --wait 240   # repete até OK/timeout (é o gate usado pelo deploy)
```

Saída esperada: `[ OK ]` em containers, readiness interno, HTTPS público,
portas fechadas e certificado. `[WARN]` não derruba o exit (ex.: faixas do CF
desatualizadas) — mas deve ser resolvida.

## 4. Deploy

Pré-condições: tag `vX.Y.Z` publicada no GHCR (CI `release.yml`) e
`docker login ghcr.io` feito uma vez (PAT com `read:packages`, ou
`GITHUB_TOKEN` do Actions não serve aqui — no servidor, crie o PAT e:

```bash
echo SEU_PAT | docker login ghcr.io -u SEU_USUARIO --password-stdin
```

```bash
./scripts/deployment/deploy.sh v1.2.3          # pull da tag
./scripts/deployment/deploy.sh v1.2.3 --build  # build local (registro indisponível)
```

O que o script faz (ordem importa):

1. Pré-checks: `.env.prod`, secrets, Docker, `DOMAIN`, `IMAGE_TAG`.
2. Grava a tag nova em `.env.prod` e registra o anterior em `.deploy-history`.
3. `docker compose pull` (ou build) — **a stack antiga segue no ar**.
4. Sobe `postgres`/`redis` e espera `healthy`.
5. `docker compose run --rm backend alembic upgrade head` — **falhou aqui,
   nada mudou** (stack continua na tag antiga).
6. `docker compose up -d --remove-orphans` (switch).
7. Gate: `$HC --quiet --wait 300`. Passou → registra `ok` e prune de imagens
   soltas. Falhou → **rollback automático** para a tag anterior + gate de novo.
8. Resultado sempre em `.deploy-history`.

Regra de migrations: **expand-contract**. Nunca faça uma migration que quebra
a versão anterior em produção (a gente pode voltar de app, nunca de schema).
Migrations reversíveis não existem por política — por isso backup antes de
mudança estrutural grande: `./scripts/deployment/backup.sh`.

## 5. Rollback

```bash
./scripts/deployment/rollback.sh           # tag anterior (pelo histórico)
./scripts/deployment/rollback.sh v1.2.0    # tag específica
./scripts/deployment/rollback.sh --list    # histórico de deploys
```

O rollback troca as imagens e roda o mesmo gate. Se o gate falhar, o estado
final é a tag pedida em `.env.prod` — investigar com logs (§6) em vez de
só tentar de novo.

## 6. Logs e diagnóstico

```bash
$DC ps                              # estado + saúde
$DC logs --tail 100 backend         # erros da API
$DC logs --tail 100 caddy           # 403/502 no proxy (JSON)
$DC exec backend curl -s localhost:8000/api/v1/health/ready
$DC exec postgres pg_isready -U sentinel -d blue_sentinel
$DC exec redis redis-cli ping
tail -n 50 logs/backup.log          # cron de backup
```

O Caddy loga JSON: filtrar com `grep '"status":5'` (5xx),
`grep 'remote_ip'` etc.

## 7. Operações corriqueiras

**Restart de um serviço**

```bash
$DC restart backend      # ou caddy / frontend / postgres / redis
```

**Aplicar mudança de `docker-compose.prod.yml`** (sem trocar de tag)

```bash
$DC up -d --remove-orphans && $HC --wait 240
```

**Rotacionar `smtp_password`**: gerar nova senha no provedor →
`printf '%s' 'NOVA' > secrets/smtp_password && chmod 600 secrets/smtp_password`
→ `$DC restart backend` → enviar teste pelo formulário de contato.

**Rotacionar `secret_key`** (invalida JWTs — esperado): gerar novo
(`openssl rand -hex 32`) no `secrets/secret_key` → `$DC restart backend`.

**Rotacionar `agent_api_key` / `agent_hmac_secret`**: idem; avisar quem usa o
agente.

**Atualizar token do Cloudflare** (rotacionou/revogou): novo token com
Zone — DNS — Edit → `printf '%s' ... > secrets/cf_dns_api_token` →
`$DC restart caddy` (confere: `$HC`).

**Atualizar faixas do Cloudflare** (o `$HC` avisou `WARN ... desatualizadas`):

1. Editar a linha `@cf remote_ip ...` do `docker/caddy/Caddyfile` conforme
   https://www.cloudflare.com/ips-v4 e ips-v6.
2. Validar formatar: `caddy validate --config docker/caddy/Caddyfile
   --envfile .env.prod` e `caddy fmt --overwrite docker/caddy/Caddyfile`
   (binário com o plugin: ver `docker/caddy/Dockerfile`).
3. Deploy de uma tag nova (ou `up -d` se só mudou o arquivo montado —
   na prática a mudança entra no próximo build/restart do caddy:
   `$DC up -d --force-recreate caddy`).
4. `sudo ./scripts/setup/harden-server.sh` (reextrai os CIDRs →
   `systemctl restart blue-sentinel-fw`).
5. `$HC`.

**Backup manual / verificação**

```bash
sudo ./scripts/deployment/backup.sh            # agora
./scripts/deployment/backup.sh --verify        # baixa o último do remoto e testa age
```

**Restauração**: ver [disaster-recovery §6](disaster-recovery.md).

**Atualizar sistema/base images**

```bash
sudo apt update && sudo unattended-upgrade -v   # patches de segurança (automático também)
$DC pull postgres redis                        # patches de infra
$DC up -d postgres redis                       # recria (downtime de segundos)
```

**Limpeza**: `docker image prune -f` nunca toca volumes. **Nunca**
`docker system prune -a` com a stack em produção sem necessidade (remove
imagens que o rollback usa).

**Reboot do servidor**: tudo volta sozinho (`restart: unless-stopped` + units
systemd). Após o reboot: `$HC` e `systemctl status blue-sentinel-fw`.

## 8. Incidentes (sintoma → ação)

| Sintoma | Diagnóstico | Ação |
|---------|-------------|------|
| Site fora do ar / timeout | `$HC`; `systemctl status docker blue-sentinel-fw ufw`; DNS aponta certo? | Subir o que estiver parado: `$DC up -d`; se origin OK mas externo cai, ver CF (página status.cloudflare.com) |
| 502/503 do Cloudflare | `$DC logs --tail 100 caddy backend`; `$DC ps` (algum `unhealthy`?) | `restart` no serviço; se backend morre: logs + `$DC exec backend ... health/ready` |
| **403 geral** (inclusive páginas normais) | Origem bloqueada: faixas CF mudaram, ou tráfego não vem do CF (DDoS com IP real? VPN?) | Conferir faixas (`$HC` WARN) e atualizar conforme §7; `systemctl restart blue-sentinel-fw`; testar `curl -H 'CF-Connecting-IP: 1.2.3.4'` no origin só via SSH |
| Certificado expirando/renovação falhou | `$DC logs --tail 50 caddy` (erros ACME); token CF inválido? rate limit do LE? | Token: §7; rate limit: aguardar (renova automática 30 dias antes); `curl -fsS localhost:2019/config/` dentro do container para ver estado |
| Deploy falhou | `.deploy-history` mostra `FAILED` + auto-rollback | Ver logs do passo que falhou (migrations? gate?). Stack está na tag anterior — corrigir, nova tag, deploy |
| Migrations falharam | Saída do `deploy.sh` | Nada mudou. Ajustar migration (expand-contract), commit, tag nova. Nunca rodar `alembic downgrade` em produção |
| Disco ≥ 90% (`[FAIL] disco`) | `df -h`; `docker system df`; `du -sh logs backups` | `docker image prune -f`; limpar backups além da retenção; logs (rotação já limita a 10M×3 por container); `journalctl --vacuum-size=200M` |
| Backup falhou (cron) | `tail logs/backup.log`; `--verify` | Causas comuns: credencial S3, cota, disco local. Corrigir e rodar manual; **não** deixar passar 24h sem backup — se precisar, `.dump` manual + age no escrow |
| Postgres `unhealthy` | `$DC logs --tail 100 postgres`; `df -h` | Memória? ajustar limite. Corrupção/perda de volume → [disaster-recovery §6](disaster-recovery.md) |
| Lentidão / OOM | `docker stats`; `$DC logs backend` | Ajustar `deploy.resources.limits`; checar `RATE_LIMIT`/tráfego; Redis AOF growing? |
| Comprometimento suspeito | — | Rotacionar **todos** os secrets (§7), revogar tokens CF/GitHub/rclone, revisar `$DC logs`, considerar restore de ponto limpo (DR §6.3) |

## 9. Regras de ouro

1. **Nunca** `docker compose down -v` — `-v` apaga os volumes de dados.
2. **Nunca** commitar `.env.prod`, `secrets/` ou dumps; `.gitignore` cobre,
   mas revise `git status` antes de commit.
3. **Nunca** publicar porta nova sem passar pelo Caddy/CF — se aparecer porta
   extra em `ufw status`, é bug (investigar).
4. Migrations sempre **expand-contract**; schema nunca quebra a versão anterior.
5. Deploy de mudança estrutural ⇒ `backup.sh` antes.
6. Tag publicada é imutável: para corrigir, tag nova (nunca re-push de tag).
7. Faixa de CF desatualizada é **incidente potencial de downtime total** —
   trate o `WARN` do healthcheck como pendência.

## 10. Manutenção agendada (checklist mensal)

- [ ] `tail logs/backup.log` — 30 dias sem falha; `backup.sh --verify` verde.
- [ ] `tail logs/restore-test.log` — teste mensal de restore PASSOU.
- [ ] `.deploy-history` revisado; nenhuma tag `FAILED` sem follow-up.
- [ ] `apt`/unattended-upgrades sem pendência crítica; reboot se houve kernel.
- [ ] `$HC` sem `WARN` (faixas CF, disco ≥ 80%).
- [ ] Renovação/token do Cloudflare e PAT do GHCR com validade conhecida.
- [ ] Escrow da chave age acessível (testar decrypt de um backup fora do server).
- [ ] A cada 6 meses: exercício de DR de verdade
      ([disaster-recovery §7](disaster-recovery.md)).

## 11. Alertas do Prometheus (sintoma → ação)

Fluxo e stack completa: [observabilidade](observability.md). Resumo:
Prometheus avalia `docker/prometheus/alert.rules.yml` → Alertmanager →
webhook do backend (`POST /api/v1/alerts/webhook`, token
`ALERT_WEBHOOK_TOKEN`) → dedup (`ALERT_DEDUP_SECONDS`), silêncio
(`ALERT_SILENCES`) e entrega em Discord/e-mail — sempre com link para a
âncora abaixo. Os auto-checks do próprio backend (`AlertMonitor`) usam as
mesmas seções via âncoras em kebab (`#high-error-rate` etc.).

```bash
DC_OBS="docker compose -f docker-compose.yml -f docker-compose.observability.yml --profile observability"
```

### Teste de ponta a ponta (BackendDown < 2 minutos)

```bash
$DC_OBS up -d && $DC_OBS ps
$DC_OBS stop backend
# ~75 s depois (scrape 15s + for 1m): http://localhost:9090/alerts mostra
# BackendDown firing, e a notificação chega no canal configurado
$DC_OBS start backend
# resolução: alerta vira resolved e libera a deduplicação
```

### Backend fora do ar <a id="backend-down"></a>

Sintoma: alerta `BackendDown` (critical); API e `/status` inacessíveis.
Diagnóstico: `$DC_OBS ps`; `$DC_OBS logs --tail 100 backend`; dentro da
rede: `curl -fsS http://backend:8000/api/v1/health/ready`.
Ação: `$DC_OBS up -d backend`; crash/OOM → linha "Lentidão / OOM" da §8;
se só o scrape falha, conferir `METRICS_TOKEN`/`docker/prometheus/metrics_token`.

### Taxa de erro alta <a id="high-error-rate"></a>

Sintoma: `HighErrorRate` (> 5 % de 5xx por 5 min, critical).
Diagnóstico: logs do backend filtrando 5xx (com `request_id`); `$DC_OBS ps`;
deploy/migration recente? Postgres ou Redis `unhealthy`?
Ação: rollback se deploy novo (§5); corrigir a rota em erro; se vier do
proxy, linha "502/503 do Cloudflare" da §8.

### Latência alta <a id="high-latency-p95"></a>

Sintoma: `HighLatencyP95` (p95 > 1 s por 5 min, warning).
Diagnóstico: `docker stats`; Grafana (p95 por rota, http://localhost:3001);
Redis/Postgres lentos? `bs_cache_misses_total` subindo?
Ação: ajustar limites de recursos; investigar caminho quente; se for
degradação deliberada, o `/status` reflete `degradation_level`.

### Disco cheio <a id="disk-high"></a>

Sintoma: `DiskHigh` (≥ 80 %) ou `DiskCritical` (≥ 90 %).
Diagnóstico e ação: mesma linha da tabela da §8 ("Disco ≥ 90%").

### Fila de e-mail parada <a id="email-queue-stalled"></a>

Sintoma: `EmailQueueStalled` (mensagens paradas > 10 min, warning).
Diagnóstico: `bs_queue_depth{queue="email"}` no Grafana; logs de SMTP e
`bs_email_failed_total` / `bs_email_dead_letter_total`.
Ação: corrigir o provedor/credencial (rotação em §7); reprocessar dead-letters.

### Pico de 401/429 <a id="auth-failure-spike"></a> <a id="rate-limit-spike"></a>

Sintoma: `AuthFailureSpike` (> 30 × 401 em 5 min) ou `RateLimitSpike`
(> 60 × 429 em 5 min), ambos warning.
Diagnóstico: logs do backend (rota, `request_id`); em massa de 429, o
rate limit por IP está contendo o alvo?
Ação: deixar o rate limit trabalhar; força-bruta → WAF do Cloudflare /
fail2ban; se o cliente é legítimo, revisar limites nas settings.

### Certificado expirando <a id="cert-expiring-soon"></a>

Sintoma: `CertExpiringSoon` (< 14 dias, warning) ou `CertExpiringCritical`
(< 7 dias, critical).
Diagnóstico: `$DC_OBS logs --tail 50 caddy`; estado ACME no Caddy
(`curl -fsS localhost:2019/config/` de dentro do container).
Ação: linha "Certificado expirando/renovação falhou" da §8; token do
Cloudflare via §7.

### Alertmanager fora do ar

Sintoma: `AlertmanagerDown` (critical) — sem entrega de alertas do Prometheus.
Diagnóstico: `$DC_OBS ps alertmanager`; logs do container.
Ação: `$DC_OBS up -d alertmanager`. Enquanto isso, os auto-checks do
backend (`AlertMonitor`, `ALERT_CHECK_INTERVAL`) seguem alertando pelos
canais dele; alertas do Prometheus ficam parados até o retorno.

### Monitoramento externo

O Prometheus desta stack morre junto com o host: mantenha também um
monitor de uptime **externo** (UptimeRobot, BetterStack, Pingdom, ...)
apontando para `https://<DOMAIN>/api/v1/health/ready` com expectativa
HTTP 200, notificando por canal independente (e-mail/celular). As sondas
blackbox internas cobrem frontend/backend dentro da rede; o monitor
externo cobre falha total da VPS, do Cloudflare ou do DNS.

Manutenção planejada: silencie com `ALERT_SILENCES=DiskHigh,critical`
(em `.env.prod` + restart do backend) ou espere o dedup de 5 min.
