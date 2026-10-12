# Observabilidade — Blue-Sentinel

Stack opcional de monitoramento: métricas, logs estruturados, alertas com
runbook e painéis. Procedimentos de incidente: [runbook §11](runbook.md).
Topologia de produção: [infrastructure](infrastructure.md). Inventário de
dados (LGPD): [data-inventory](../security/data-inventory.md).

## 1. Visão geral

```text
 backend:8000 /api/v1/metrics (Bearer METRICS_TOKEN)
        │ scrape 15s
        ▼
  Prometheus (9090) ── avalia alert.rules.yml ──► Alertmanager (9093)
        │                                              │ webhook + ALERT_WEBHOOK_TOKEN
        │                                              ▼
        │                                    POST /api/v1/alerts/webhook
        │                                    dedup + silêncio + runbook
        │                                              │
        ▼                                              ▼
  Grafana (3001)                            Discord/Telegram + e-mail
  dashboards/overview.json

  blackbox-exporter: sondas HTTP (frontend, /health/live, /health/ready)
                     e TLS (expiração do certificado)
  Loki + Promtail (perfil "loki"): logs JSON do backend em busca por campo
```

Dois caminhos de alerta, de propósito:

1. **Prometheus → Alertmanager → backend** — cobre backend fora do ar,
   taxa de erro, latência, disco, certificado, fila parada, picos 401/429,
   Alertmanager fora do ar e sonda externa falhando.
2. **`AlertMonitor` do backend** (`app/monitoring/alerts.py`) — os mesmos
   sinais locais (fila, picos, disco, certificado) avaliados a cada
   `ALERT_CHECK_INTERVAL` segundos, sem depender do Prometheus.

## 2. Subir a stack

```bash
# métricas + alertas + painéis
docker compose -f docker-compose.yml -f docker-compose.observability.yml \
  --profile observability up -d

# + logs em Loki
docker compose -f docker-compose.yml -f docker-compose.observability.yml \
  --profile observability --profile loki up -d
```

| Serviço | URL local | Credencial |
|---------|-----------|------------|
| Prometheus | http://localhost:9090 | — |
| Alertmanager | http://localhost:9093 | — |
| Grafana | http://localhost:3001 | `admin` / `GRAFANA_ADMIN_PASSWORD` |
| Loki | http://localhost:3100 | — |

Pré-requisitos no `.env` (ver `.env.example`): `METRICS_TOKEN` (sem ele o
`/api/v1/metrics` fica desativado) e, para entrega de alertas,
`ALERT_WEBHOOK_URL` e/ou `ALERT_EMAIL_TO`. `docker/prometheus/metrics_token`
e `docker/prometheus/alert_webhook_token` são arquivos **locais, fora do
git** — o compose os monta como secrets somente leitura. Troque o alvo
`site.example.com:443` em `prometheus.yml` (job `blackbox-tls`) pelo domínio
real em produção.

Validação das regras sem subir nada:

```bash
docker run --rm -v $PWD/docker/prometheus:/etc/prometheus \
  prom/prometheus promtool check rules /etc/prometheus/alert.rules.yml
```

## 3. Métricas do backend

`GET /api/v1/metrics` (prometheus_client), protegido por
`Authorization: Bearer $METRICS_TOKEN`. Família `bs_*`:

| Métrica | Tipo | Uso |
|---------|------|-----|
| `bs_http_requests_total` | Counter (route, method, status) | taxa de erro 5xx, tráfego |
| `bs_http_request_duration_seconds` | Histograma (route) | p50/p95/p99, alerta de latência |
| `bs_auth_failures_total` / `bs_rate_limited_total` | Counter | picos de 401/429 |
| `bs_cpu_percent` / `bs_memory_percent` / `bs_disk_percent` | Gauge | recursos; `bs_disk_percent` alimenta `DiskHigh`/`DiskCritical` |
| `bs_postgres_up` / `bs_redis_up` | Gauge | dependências |
| `bs_cache_hits_total` / `bs_cache_misses_total` | Counter | eficácia do cache |
| `bs_queue_depth{queue="email"}` | Gauge | `EmailQueueStalled` |
| `bs_email_sent_total` / `bs_email_failed_total` / `bs_email_dead_letter_total` | Counter | fila de e-mail |
| `bs_cleanup_removed_total{kind}` | Counter | retenção LGPD (o que o worker apagou) |

Os mesmos contadores/percentis alimentam `/api/v1/status`
(`site_monitoring`, `latency_percentiles`) consumido pela página pública
`/status` — eventos de segurança ali nunca contêm IP real (hash com sal
rotativo, `hash_ip`).

## 4. Logs estruturados

O backend emite JSON no stdout (`app/core/logging.py`): `level`, `ts`,
`logger`, `message`, `request_id`, `route`, `method`, `status`,
`duration_ms`. Um filtro de redação (`RedactionFilter`) remove
credenciais, cookies e e-mails **antes** de serializar; IP nunca é logado em
claro (minimização LGPD — ver [data-inventory](../security/data-inventory.md)).

Com o perfil `loki`, o Promtail coleta os JSON dos containers e o Loki
indexa por campo (`{container="blue-sentinel-backend"}` + filtro em LogQL,
ex.: `{container="blue-sentinel-backend"} | json | status >= 500`). Sem o
perfil, os logs continuam acessíveis via `docker compose logs -f backend`.

## 5. Alertas: regras, dedup e silêncio

Regras: `docker/prometheus/alert.rules.yml` — cada uma com `severity`
(`warning`/`critical`) e `runbook_url` apontando para as âncoras da
[runbook §11](runbook.md). Contrato coberto por
`backend/tests/unit/monitoring/test_alert_rules.py` (não remover alertas
nem o `for` do `BackendDown`: o critério "alerta em < 2 min" depende disso).

| Alerta | Gatilho | `for` | Severidade |
|--------|---------|-------|------------|
| `BackendDown` | `up{job="backend"} == 0` | 1m | critical |
| `HighErrorRate` | 5xx > 5 % em 5 min | 5m | critical |
| `HighLatencyP95` | p95 > 1 s | 5m | warning |
| `DiskHigh` / `DiskCritical` | `bs_disk_percent` > 80 / 90 | 5m | warning / critical |
| `EmailQueueStalled` | fila > 0 por 10 min | 10m | warning |
| `AuthFailureSpike` | > 30 × 401 em 5 min | 2m | warning |
| `RateLimitSpike` | > 60 × 429 em 5 min | 2m | warning |
| `CertExpiringSoon` / `Critical` | cert < 14 / 7 dias | 10m | warning / critical |
| `AlertmanagerDown` | `up{job="alertmanager"} == 0` | 5m | critical |
| `BlackboxProbeFailed` | `probe_success == 0` | 3m | warning |

O Alertmanager agrupa por `alertname`+`severity`, inibe `warning` quando
existe o `critical` equivalente e entrega via webhook no backend
(`alertmanager.yml`, `send_resolved: true`). Para o alerta de "backend
fora do ar" chegar **mesmo com a API caída**, copie o exemplo de
`email_configs` no cabeçalho de `alertmanager.yml` para um
`alertmanager.email.yml` e troque o `--config.file` no compose.

No backend (`AlertNotifier`):

- **Dedup**: o mesmo `name` não é reenviado dentro de
  `ALERT_DEDUP_SECONDS` (padrão 300 s); resolução limpa a janela.
- **Silêncio**: `ALERT_SILENCES=DiskHigh,critical` suprime por nome ou
  severidade (manutenção planejada).
- **Entrega**: webhook (payload com `content` para Discord e `text` para
  bridges de Telegram) e/ou e-mail SMTP; sem canal configurado, o alerta
  vira `WARNING` no log estruturado — nunca levanta exceção.

## 6. Testando os alertas (procedimento)

1. **BackendDown < 2 minutos** (critério de aceitação): subir a stack,
   `$DC_OBS stop backend` e observar `http://localhost:9090/alerts` —
   firing em ~75 s (scrape 15 s + `for: 1m`) e notificação no canal.
   Detalhe e resolução: [runbook §11](runbook.md).
2. **Disco**: `docker exec blue-sentinel-prometheus ...` não afeta o host;
   para forçar sem sujar o host, rode o backend localmente com
   `DISK_ALERT_THRESHOLD=1` nas env e veja `DiskHigh` no `AlertMonitor`.
3. **Certificado**: `CERT_CHECK_HOST=example.com` + janela
   `CERT_WARN_DAYS` grande dispara `CertExpiringSoon` sem esperar 14 dias.
4. **Webhook**: `curl -X POST http://localhost:8000/api/v1/alerts/webhook
   -H "Authorization: Bearer $ALERT_WEBHOOK_TOKEN" -d '{"alerts":[]}'` —
   200 com payload vazio; sem token, 401/403.
5. **Regras**: `promtool check rules` (§2) — deve passar em CI e local.

## 7. Monitoramento externo (não opcional)

Tudo acima morre junto com a VPS. Mantenha um monitor de uptime externo
(UptimeRobot, BetterStack, Pingdom, ...) apontando para
`https://<DOMAIN>/api/v1/health/ready` com expectativa HTTP 200 e
notificação por canal independente (e-mail/celular). Isso cobre falha
total de host, Cloudflare e DNS — o caso que o `BackendDown` interno nunca
vê.

## 8. Segurança da stack

- `/api/v1/metrics` e `POST /api/v1/alerts/webhook` exigem Bearer token;
  sem `ALERT_WEBHOOK_TOKEN` o webhook fica fechado.
- Prometheus/Grafana/Alertmanager publicam portas só em localhost e não
  entram no Caddy: em produção, restrinja com UFW/firewall como as demais
  portas ([infrastructure §2](infrastructure.md)).
- Grafana: `GF_USERS_ALLOW_SIGN_UP=false`; troque a senha admin via
  `GRAFANA_ADMIN_PASSWORD`.
- Alertas e logs não carregam PII: labels são métricas/rotas; eventos do
  `/status` usam `actor` com hash de sal rotativo (24 h).

## 9. Referências

- [Runbook §11](runbook.md) — sintoma → ação de cada alerta.
- [Infraestrutura](infrastructure.md) — topologia e portas.
- [Data inventory](../security/data-inventory.md) — retenção e LGPD.
- `backend/app/monitoring/{metrics,alerts,security_events}.py` —
  implementação; `docker-compose.observability.yml` — definição dos
  serviços; `docker/grafana/dashboards/overview.json` — painel pronto.
