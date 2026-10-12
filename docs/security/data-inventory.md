# Inventário de Dados — Blue-Sentinel (LGPD)

Fonte de verdade do que o sistema coleta, por quanto tempo e como apagar.
Espelhado na página pública de privacidade
(`frontend/content/{pt,en}/privacy.mdx`) e implementado em
`backend/app/workers/cleanup/old_events_cleanup.py`. Priva técnica de
retenção: [runbook](../architecture/runbook.md); observabilidade:
[observability](../architecture/observability.md).

## 1. Dados sob nossa guarda

| Dado | Onde vive | Finalidade | Retenção | Como apagar |
|------|-----------|------------|----------|-------------|
| Nome, e-mail e texto do formulário de contato | tabela `contact_messages` (Postgres) | responder ao contato | `CONTACT_RETENTION_DAYS` (padrão 90 dias) | worker automático + `DELETE` sob demanda |
| Sessão do laboratório (id sintético, expiração) | tabela `lab_sessions` | isolar experimentos do lab | `LAB_SESSION_RETENTION_DAYS` (padrão 30 dias) | worker automático (expira sozinho no `expires_at`) |
| IP do visitante | **não persiste**: só em memória para rate limit e honeypot | limitar abuso | — (nunca armazenado) | — |
| Logs de requisição (JSON no stdout) | Docker (rotação 10 MB × 3) / Loki se habilitado | diagnóstico e segurança | ~14 dias (rotação); Loki conforme política do volume | rotação automática; `docker compose logs` não retenção longa |
| Métricas agregadas (`bs_*`) | Prometheus (retention 15 d) | alertas e capacidade | 15 dias (`--storage.tsdb.retention.time`) | volume `prometheus_data` |
| Eventos de segurança do próprio site (`/status`) | memória do backend, janela curta | dogfooding do motor de detecção | janela rolante (~minutos); `actor` = hash SHA-256 com sal rotativo 24 h | some ao reiniciar; sem IP ou identificador reversível |
| Backups criptografados (`.dump` + age) | S3 via rclone | disaster recovery | política de `backup.sh` (retenção remota) | rotação automática do bucket + `backup.sh` |

Base legal (Art. 7º, LGPD): **legítimo interesse** para segurança, prevenção
a fraude e operação do site; **execução de contrato/medidas pré-contratuais**
para responder o formulário de contato. Consentimento não é a base — por
isso não há banner.

## 2. Minimização (o que deliberadamente não coletamos)

- Formulário de contato: sem campo de telefone, empresa ou anexo; o backend
  **não grava** `ip_address`/`user_agent` (colunas removidas do modelo).
- Logs: filtro `RedactionFilter` (`app/core/logging.py`) redige senhas,
  tokens, cookies e e-mails antes de serializar; IP nunca entra em claro.
- `/api/v1/status`: eventos de segurança expõem `actor` como hash com sal
  rotativo (`hash_ip`), nunca o IP real.

### Migração legada

Bancos criados antes da remoção das colunas precisam do downgrade manual
(expand-contract já removeu o código):

```sql
ALTER TABLE contact_messages DROP COLUMN IF EXISTS ip_address;
ALTER TABLE contact_messages DROP COLUMN IF EXISTS user_agent;
```

## 3. Cookies — por que não há banner de consentimento

O site usa **um único cookie técnico**: `BLUE_SENTINEL_LOCALE`, gravado
apenas quando o visitante escolhe o idioma no seletor
(`frontend/src/middleware.ts`). Sem analytics, sem pixels de terceiros, sem
publicidade, sem fingerprinting. Cookie estrito de preferência do usuário,
dispensado de consentimento pela LGPD/Art. 5º, XIII da Lei do Internet
Bill of Rights — a decisão está documentada na própria página de
privacidade (`/pt-BR/privacy`).

## 4. Retenção automática e sob demanda

- Worker no lifespan do app roda `run_retention_cleanup()` a cada
  `CLEANUP_INTERVAL_HOURS` (padrão 24 h); métrica
  `bs_cleanup_removed_total{kind}` mostra o que saiu.
- Exclusão sob demanda (titular ou operador): apagar a linha de
  `contact_messages` / `lab_sessions` (SQL direto ou script) e rodar
  `run_retention_cleanup()` para confirmar contagem zero no log.
- Testes: `backend/tests/unit/test_retention_cleanup.py` +
  `tests/integration/test_site_monitoring_status.py` (garantem que
  `/status` não vaza PII).

## 5. Direitos do titular (Art. 18)

Confirmação de tratamento, acesso, correção, anonimização, portabilidade
ou eliminação: pelo formulário de contato do site, com assunto
"LGPD — direitos do titular". Identificamos o pedido pelo e-mail usado no
formulário original; respondemos no mesmo canal, sem exigir documento além
do necessário para confirmar a identidade.

## 6. Terceiros e transferência

| Prestador | Dado | Observação |
|-----------|------|------------|
| Cloudflare | IP do visitante, metadados de requisição | proxy na frente do Caddy; ver [infrastructure §4](../architecture/infrastructure.md) |
| Provedor SMTP | nome, e-mail e texto enviados no alerta/contato | só o que o template do e-mail contém |
| S3 (backups) | dump criptografado com age | sem chave no servidor; escrow offline |

## 7. Revisão

- Prazos: `CONTACT_RETENTION_DAYS`, `LAB_SESSION_RETENTION_DAYS`,
  `CLEANUP_INTERVAL_HOURS` em `.env` (documentados no `.env.example`).
- Ao mudar coleta ou prazo: atualizar esta tabela, o MDX de privacidade
  (`frontend/content/{pt,en}/privacy.mdx`) e os testes de retenção — os
  três andam juntos.
