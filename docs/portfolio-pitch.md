# Portfolio Pitch — Guia de entrevista (PT-BR)

Material de preparação para entrevistas. Tudo abaixo é verificável neste
repositório; os caminhos citados são reais. Use os placeholders
(`[SEU NOME]`, `[SEU EMAIL]`, `[SEU LINKEDIN]`, `[SEU GITHUB]`) ao falar de
dados pessoais.

---

## Resumo de 30 segundos

Sou [SEU NOME], profissional de segurança focado em Blue Team e Detection
Engineering. Construí o Blue-Sentinel — um portfólio que roda em produção e
mostra como eu penso, não só o que eu sei. Ele tem uma biblioteca defensiva de
detecção com **20 regras Sigma, 5 YARA e 3 padrões de correlação**, com **50
fixtures e hit-rate de 100% validado em CI**, e uma matriz MITRE ATT&CK gerada
a partir das próprias regras — com as lacunas declaradas com honestidade. Dentro
do portfólio existe um laboratório de detecção interativo em tempo real (WebSocket
com motor Sigma próprio), um agente de telemetria somente leitura em C++20 com
HMAC-SHA256 e testes, e uma API FastAPI com rate limiting em Redis. A produção
roda atrás de Cloudflare + Caddy, com backups criptografados e rollback
automático.

---

## 5 destaques técnicos

### 1. Motor de detecção Sigma/YARA/correlação com validação em CI

- **Prova concreta:** `python scripts/development/validate_rules.py` valida
  schema, UUIDs únicos, tags ATT&CK, fixtures e recompõe o hit-rate do corpus
  completo: **50/50 = 100%** — o CI roda exatamente esse gate. A matriz de
  cobertura em `docs/security/attack-coverage.md` é **gerada** a partir das
  regras (`--write-docs`) e o CI falha se ela ficar desatualizada
  (`--check-docs`): hoje são 24 técnicas em 9 das 14 táticas, com as lacunas
  listadas.
- **Onde está:** `rules/sigma/`, `rules/yara/`, `rules/patterns/`,
  `backend/app/detection/`, `backend/tests/fixtures/detection/`.

### 2. Agente C++20 de telemetria, somente leitura, com 67 casos de teste

- **Prova concreta:** o agente coleta apenas metadados (processos, rede,
  auth), envia por HTTPS com **HMAC-SHA256 por lote + anti-replay de ±300 s em
  comparação constant-time**, fila local limitada (nunca enche o disco do host)
  e recusa qualquer URL que não seja `https://`. A suíte GoogleTest tem 67 casos
  (vetores RFC 4231, janela anti-replay, limite de zip bomb, precedência de
  config) e o build tem presets ASan/UBSan e warnings-como-erro; o badge de CI
  está no README do agente.
- **Onde está:** `agent/README.md`, `agent/src/core/`,
  `agent/src/platform/{windows,linux}/`, `agent/tests/`.

### 3. Rate limiting em Redis com janela deslizante atômica

- **Prova concreta:** `backend/app/middleware/rate_limit.py` implementa janela
  deslizante com ZSET + **um único script Lua** (duas requisições concorrentes
  nunca leem o mesmo `ZCARD`), com política explícita de falha (`open`/
  `closed` — produção sobe com `RATE_LIMIT_FAIL_CLOSED=true`). É aplicado no
  formulário de contato (10/min por IP em `backend/app/api/v1/contact.py`),
  com segunda camada de 5 mensagens/hora por e-mail no banco
  (`backend/app/services/contact_service.py`), e tem testes de segurança
  próprios em `backend/tests/security/test_rate_limit.py`.
- **Decisão registrada:** `docs/architecture/adr/002-redis-for-cache-queue.md`.

### 4. Stack de observabilidade com dois caminhos de alerta independentes

- **Prova concreta:** Prometheus scrapa `/api/v1/metrics` (Bearer
  `METRICS_TOKEN`, famílias `bs_*`), avalia `alert.rules.yml` e entrega via
  Alertmanager ao webhook do backend — que deduplica, silencia e anexa runbook
  (`backend/app/monitoring/alerts.py`). Em paralelo, o `AlertMonitor` avalia os
  mesmos sinais localmente, sem depender do Prometheus. blackbox-exporter faz
  sondas HTTP/TLS e Loki+Promtail guarda os logs JSON.
- **Onde está:** `docs/architecture/observability.md`,
  `docker/prometheus/`, `backend/app/monitoring/`.

### 5. Produção atrás de Cloudflare + Caddy, com backups criptografados e rollback

- **Prova concreta:** o origin só responde às faixas de IP do Cloudflare
  (fora delas, 403 no Caddy), PostgreSQL/Redis ficam numa rede Docker
  `internal: true` sem porta pública, todos os containers sobem `read_only`
  com `cap_drop: ALL`. `scripts/deployment/deploy.sh` faz health gate e
  **rollback automático** para a tag anterior; `backup.sh` gera dump +
  criptografia **age** + sync S3 via rclone, com teste mensal de restore em
  PostgreSQL temporário (`restore.sh --test`).
- **Onde está:** `docs/architecture/infrastructure.md`,
  `docs/architecture/disaster-recovery.md`, `scripts/deployment/`.

---

## Perguntas de entrevista

### 1. Por que Redis?

Uma dependência cobre quatro necessidades com latência sub-milissegundo: rate
limiting, cache TTL (stats do GitHub), pub/sub (alertas do lab para os
WebSockets) e fila de e-mail — registrado em
`docs/architecture/adr/002-redis-for-cache-queue.md`. O argumento decisivo para
o rate limiting foi atomicidade: a janela deslizante roda inteira num script
Lua (`backend/app/middleware/rate_limit.py`), então duas requisições
concorrentes não conseguem "atropelar" a contagem como acontece com
`INCR`+`EXPIRE` ingênuo. Comparei com alternativas: PostgreSQL
(LISTEN/NOTIFY sem TTL, pesado em conexões), RabbitMQ (dependência extra sem
ganho nesta escala) e dict em memória (não sobrevive a múltiplos containers).

**Limites honestos:** Redis aqui não é ACID — cache/fila/pubsub são
best-effort por decisão (ADR 002). É uma instância só; se cair, o comportamento
depende do modo de falha: por padrão `open` (deixa passar — disponibilidade >
limite), e produção força `closed`. E rate limit é controle de abuso, **não**
controle de acesso — o próprio docstring do módulo diz isso; não resolve
vetor de ataque volumétrico.

### 2. Como você mitiga SQL Injection?

Três camadas, todas com teste automatizado em
`backend/tests/security/test_sql_safety.py`:

1. **Parametrização/ORM:** filtros entram como binds do SQLAlchemy; o teste
   compila a query e prova que o payload `x' OR '1'='1` **não** aparece no
   texto da SQL (tratado como string comum).
2. **Allowlist de `ORDER BY`:** valores do cliente nunca entram no texto da
   SQL. `backend/app/security/sql_injection.py` só aceita chaves de um
   dicionário de colunas já mapeadas e direção `asc`/`desc`; sort injetado
   (`created_at; DROP TABLE ...`) levanta `UnsafeSortError` **antes** de tocar
   no banco (testado com uma sessão falsa que falha o teste se qualquer query
   executar).
3. **Guard de regressão no código-fonte:** um teste varre `backend/app/` e
   falha o build se alguém escrever `text(f"...")`, `execute(f"...")` ou
   `exec_driver_sql(f"...")` — ou seja, o anti-padrão não consegue voltar
   silenciosamente. Existe até um teste que demonstra o anti-padrão
   funcionando (a query concatenada devolve todas as linhas) para registrar
   *por que* o guard existe.

Além disso, a entrada é validada por Pydantic no servidor (e Zod no cliente)
em `backend/app/api/v1/contact.py`.

**Limites honestos:** o guard de source tree é baseado em regex — pega os
padrões clássicos de f-string, mas não é um analisador de AST e pode ser
contornado por outro estilo de concatenação. E parametrização protege o banco,
não a lógica de aplicação: um endpoint que monta uma query por regra de negócio
errada continua sendo problema de revisão de código, não de SQL.

### 3. Quais são os limites da proteção contra DDoS neste projeto?

O que o projeto **faz**: Cloudflare na frente (proxy com IP do origin escondido,
cache, WAF), Caddy que só responde às faixas de IP do Cloudflare — tráfego
direto ao origin recebe 403 (`docs/architecture/infrastructure.md` §1–3),
UFW + regra `docker-user` com DROP, e rate limiting por IP na aplicação
(10/min no contato, limite de sessões do lab por IP em
`backend/app/services/lab_service.py`), com `RATE_LIMIT_FAIL_CLOSED=true` em
produção. O runbook até trata o cenário "tráfego não vem do CF" em
`docs/architecture/runbook.md` §8.

**Limites honestos — o que eu *não* protejo:** mitigação volumétrica (L3/L4)
não é meu código, é o Cloudflare (Anycast, scrubbing); este projeto não tem
como absorver Gbps. O origin é uma VPS só, atrás de um único provedor: se o
atacante descobrir o IP e gerar pressão de banda antes do UFW, a VPS pode cair
por saturação de enlace mesmo com as portas fechadas. Em L7, o rate limit por
IP é um contador — ataques distribuídos de baixa taxa (slowloris, floods que
parecem tráfego legítimo) passam por ele; não há bot management nem regras WAF
customizadas versionadas neste repo (o WAF é configuração de plataforma). E o
limiter depende do Redis: em modo `open` (padrão fora de produção), a
indisponibilidade do Redis desliga a proteção. Resumindo: controlo abuso na
borda da aplicação; DDoS de verdade é problema de arquitetura de rede +
provedor, e eu digo isso em vez de prometer o contrário.

### 4. Por que um agente em C++?

O agente precisa falar com interfaces de sistema que exigem controle fino:
Toolhelp32, `wevtapi`, `GetExtendedTcpTable` no Windows e `/proc`, tail de
`auth.log` com detecção de rotação no Linux (`agent/README.md`). C++20 dá
footprint previsível num endpoint coletor, controle explícito de memória (a
fila é limitada por quantidade e bytes, descartando o lote mais antigo) e
acesso direto às APIs sem runtime pesado. O build também é parte do argumento:
warnings-como-erro, stack protector, `_FORTIFY_SOURCE=2`, RELRO/NOW, PIE,
ASLR/DEP, presets ASan/UBSan e 67 casos GoogleTest com vetores criptográficos
de referência (RFC 4231) — a parte de segurança (HMAC + anti-replay em
comparação constant-time, HTTPS-only sem flag para desligar verificação de
certificado) é testada, não só implementada. É um complemento deliberado ao
backend em Python: mostro que sei operar nas duas camadas.

**Limites honestos (v0.1):** sem coleta em nível de kernel (nenhum eBPF,
auditd ou assinatura ETW — ficou de propósito para funcionar sem privilégios
elevados), sem avaliação local de regras Sigma/YARA (o agente envia fatos, o
lab faz a detecção), o estado incremental vive em memória (um restart
re-reporta a tabela de processos inteira uma vez) e só sockets TCP são
enumerados. No Windows Security log sem elevação, o coletor de eventos
degrada com warning em vez de falhar.

---

## Próximos passos

- Fechar as lacunas declaradas em `docs/security/attack-coverage.md`
  (Discovery, Exfiltration, Impact) com novos cenários e regras, sempre
  atualizando a matriz gerada.
- Camada de baseline/UEBA leve (perfis por host/usuário) para reduzir a
  dependência de allowlists e thresholds fixos.
- Agente v0.2: coleta via eBPF/auditd no Linux, estado incremental persistido
  entre reinícios e avaliação local de regras.
- Endurecer a borda: regras WAF do Cloudflare versionadas, fail-closed
  padronizado em todos os ambientes e teste de carga do rate limiter.
- Validar o engine próprio contra pySigma oficial como verificação extra no
  `validate_rules.py`, sem abrir mão do runtime offline.
- Automação de screenshots/GIFs com Playwright em CI para regressão visual,
  seguindo `docs/screenshots/README.md`.
