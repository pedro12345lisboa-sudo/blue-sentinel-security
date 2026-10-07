# Disaster Recovery — Blue-Sentinel

Como os dados são protegidos e como reconstruir o serviço. Procedimentos
operacionais: [runbook](runbook.md). Topologia: [infrastructure](infrastructure.md).

## 1. Objetivos

| Métrica | Alvo | Como é atingido |
|---------|------|-----------------|
| **RPO** (perda máxima de dados) | ≤ 24 h | `pg_dump` diário 03:xx (cron) + semanal aos domingos; envio ao S3 no mesmo minuto |
| **RTO** (tempo até voltar) | ≤ 1 h em servidor novo | Scripts automatizados: clone + install + restore + deploy (§6.3) |
| Testabilidade | mensal automático | Cron dia 1: `restore.sh --test` em PG temporário (§5) |
| Custo de erro | mínimo | Backup **criptografado** (age) + snapshot pré-restauração automático |

## 2. O que é (e o que não é) backupado

**Backupeado — `scripts/deployment/backup.sh`:**

1. **Banco Postgres** (`pg_dump -Fc`): mensagens de contato, sessões do
   laboratório, audit logs, versão de migrations.
   → `backups/blue-sentinel-AAAAMMDD-HHMMSS.dump.age`
2. **Configuração** (`tar` de `.env.prod` + `secrets/`):
   → `backups/blue-sentinel-config-AAAAMMDD-HHMMSS.tar.age`

   Os dois sobem para o mesmo remoto rclone (`RCLONE_REMOTE`, ex.:
   `blue-sentinel-backups:`) e seguem a mesma retenção.

**Não backupeado (e por quê):**

| Item | Motivo |
|------|--------|
| Volume Redis | Fila de e-mail volátil. As mensagens **já recebidas** estão no Postgres; a fila é só o canal de envio. |
| Volume `caddy_data` | Certificados/regeneração automática via ACME. |
| Imagens Docker | Redundantes: `docker pull` (tags imutáveis no GHCR). |
| `logs/` | Diagnóstico, não dado. |
| Código | Git (remoto). |

## 3. Criptografia e escrow (obrigatório)

- Cada backup é criptografado com **age** para os destinatários de
  `secrets/backup-recipients.txt` (chave pública derivada de
  `secrets/backup.age.key`).
- A chave privada **nunca sai do servidor por conta própria**: ela está dentro
  do pacote de configuração também criptografado… o que não resolve a perda
  do servidor. **Escrow externo obrigatório**, guardado fora do servidor e fora
  do mesmo provedor do backup (gerenciador de senhas / cofre / offline):

  - `secrets/backup.age.key`
  - `secrets/rclone.conf` (ou as credenciais S3 equivalentes)
  - indicação do repositório + última tag (`.deploy-history`)

- **Teste do escrow** (a cada 6 meses, em outra máquina): baixar um
  `blue-sentinel-*.dump.age` do remoto e `age -d -i backup.age.key < arquivo >
  /dev/null`. Falhou = escrow inutilizável ⇒ tratar como incidente.
- Rotação da chave age: gerar nova (`age-keygen`), atualizar
  `backup-recipients.txt`, **re-encryptar um backup de teste**, atualizar o
  escrow; chaves antigas continuam válidas para arquivos antigos (mantenha o
  escrow histórico enquanto a retenção apontar para eles).

## 4. Armazenamento e verificação

- Rclone (`secrets/rclone.conf`, remote `RCLONE_REMOTE`) — qualquer S3
  compatível (S3, R2, B2, MinIO…). TLS obrigatório, bucket com versionamento
  recomendado.
- Verificação automática em cada backup: `rclone check --one-way` (cópia
  remota idêntica) e, no `--verify`, descriptografia ponta a ponta + `tar -t`
  no pacote de configuração:

  ```bash
  ./scripts/deployment/backup.sh --verify          # último dump + config
  ./scripts/deployment/backup.sh --verify <arq>    # arquivo específico
  ```

- Retenção (local **e** remota): últimos **7 dias** + **4 domingos**
  (`BACKUP_RETENTION_DAYS` / `BACKUP_RETENTION_WEEKS` no `.env.prod`).

## 5. Teste mensal de restauração

Cron (dia 1, instalado por `backup.sh --install-cron`):

```bash
./scripts/deployment/restore.sh --test --auto
```

Fluxo: escolhe o backup mais recente (local, ou baixa do S3) → testa
descriptografia → `pg_restore --list` → sobe **PostgreSQL temporário**
(`RESTORE_TEST_IMAGE`, sem porta publicada, container efêmero) → restaura →
valida (≥1 tabela, conta linhas de cada tabela, imprime `alembic_version`) →
derruba o container. **Nunca toca o banco real.**

Resultado em `logs/restore-test.log` — linha final deve ser
`TESTE DE RESTAURAÇÃO: PASSOU`. Falhou ⇒ backup inutilizável até corrigir:
não deixe dois ciclos seguidos vermelhos (checklist mensal do runbook).

## 6. Playbooks

### 6.1 Restaurar dados pontuais (sem derrubar o banco)

Para puxar linhas específicas de um backup antigo (ex.: contato apagado por
engano):

```bash
# 1. PG temporário com o dump antigo (mesmo mecanismo do --test)
./scripts/deployment/restore.sh --test ./backups/blue-sentinel-20261001-031700.dump.age
# (o teste imprime tabelas/linhas; o container é apagado no final)

# 2. Para extrair de fato: repetir o fluxo manualmente mantendo o container:
#    - copie o trecho de restore.sh --test ou suba na mão:
#      docker run -d --name pgtmp -e POSTGRES_USER=sentinel -e POSTGRES_PASSWORD=x \
#        -e POSTGRES_DB=blue_sentinel postgres:16-alpine
#    - age -d -i secrets/backup.age.key <arquivo> | docker exec -i pgtmp \
#        pg_restore -U sentinel -d blue_sentinel
#    - SELECT ... no pgtmp; inserir no banco real via psql do compose.
# 3. docker rm -f pgtmp
```

### 6.2 Banco destruído/corrompido no MESMO servidor

```bash
# 0. Se o estado atual tem valor e o pg está de pé, tente snapshot antes:
sudo ./scripts/deployment/backup.sh            # pode falhar se o pg estiver quebrado — tudo bem

# 1. Restauração destrutiva (pede confirmação = nome do banco):
./scripts/deployment/restore.sh --latest       # ou <arquivo.age> específico
```

O script: grava `backups/pre-restore-*.dump.age` (snapshot do estado atual) →
`DROP SCHEMA public` → `pg_restore --exit-on-error` → sanidade → confere
readiness da app (restart do backend se preciso). Se `pg_restore` falhar, o
snapshot de pré-restauração está lá para voltar ao ponto de partida.

Se o **volume** estiver perdido/corrompido (Postgres nem sobe):

```bash
$DC down                 # NUNCA use -v
docker volume rm blue-sentinel_postgres_data
$DC up -d postgres redis
./scripts/deployment/restore.sh --latest
$DC run --rm --no-deps backend alembic upgrade head
$DC up -d && ./scripts/deployment/healthcheck.sh --wait 240
```

### 6.3 Perda TOTAL do servidor (reconstrução em servidor novo)

Pré-requisitos (escrow!): chave `backup.age.key`, `rclone.conf`, acesso ao
GitHub (PAT com `read:packages`) e ao painel CF (DNS).

```bash
# 1. Prepara o host (mesmos scripts de sempre)
git clone <repo> /opt/blue-sentinel && cd /opt/blue-sentinel
sudo ./scripts/setup/install-docker.sh SEU_USUARIO
sudo ./scripts/setup/harden-server.sh

# 2. Recupera a CONFIGURAÇÃO a partir do escrow + S3
#    (baixar do cofre: secrets/backup.age.key e secrets/rclone.conf para ./secrets/)
mkdir -p secrets && chmod 700 secrets && chmod 600 secrets/*
rclone --config secrets/rclone.conf lsf "blue-sentinel-backups:" | sort | tail   # achar config mais novo
rclone --config secrets/rclone.conf copyto \
  "blue-sentinel-backups:blue-sentinel-config-<TS>.tar.age" /tmp/config.tar.age
age -d -i secrets/backup.age.key /tmp/config.tar.age | tar -x   # restaura .env.prod + secrets
rm /tmp/config.tar.age

# 3. DNS: atualizar o registro A para o NOVO IP (TTL baixo antes da troca)
#    (proxy CF continua ativado)

# 4. Sobe só o banco e restaura os DADOS (imagem/IMAGE_TAG já vêm do .env restaurado)
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d postgres redis
./scripts/deployment/restore.sh --latest            # baixa o dump mais novo do S3
docker compose --env-file .env.prod -f docker-compose.prod.yml \
  run --rm --no-deps backend alembic upgrade head   # schema -> versão do backup

# 5. App completa (tag que estava rodando; puxa imagens do GHCR)
docker login ghcr.io -u SEU_USUARIO                  # PAT read:packages
./scripts/deployment/deploy.sh <tag do .deploy-history restaurado>

# 6. Crons de backup + verificação final
sudo ./scripts/deployment/backup.sh --install-cron
./scripts/deployment/backup.sh --verify
./scripts/deployment/healthcheck.sh --wait 240
# 7. Smoke: formulário de contato (e-mail chega), lab, login — ver runbook §10
```

Tempo esperado: 30–60 min (downloads dominam). Atualizar o escrow se o novo
servidor tiver segredos diferentes.

### 6.4 Perda da chave `backup.age.key`

Se o servidor morreu **e** o escrow se perdeu: os backups existentes são
**irrecuperáveis** (age não tem "esquecer a senha"). Ações:

1. Regenerar a chave (`deploy.sh init` no novo servidor) — protege apenas
   backups futuros.
2. Dados = último estado conhecido: procurar dumps/offsite alternativos
   (ex.: alguém com `.dump` local); caso contrário, reconstruir do zero.
3. Corrigir o processo: escrow em no mínimo **2** locais independentes.

## 7. Exercício de DR (a cada 6 meses)

Checklist cronometrado (idealmente em máquina *diferente* da produção):

- [ ] Escrow acessível; `age -d` de um backup real funciona.
- [ ] Restauração completa num host descartável (§6.3 passos 2–5) — medir o
      RTO real e anotar.
- [ ] Contagem de tabelas/linhas bate com o esperado (≥ produção? menor?).
- [ ] `backup.sh --verify` + último `restore-test.log` verdes.
- [ ] Contatos de emergência/credenciais (PAT CF/GitHub/S3) atualizados.
- [ ] Anotar divergências e corrigir scripts/docs no mesmo ciclo.

## 8. Limitações conhecidas

- **RPO de 24 h** é do cron diário: aumentar a frequência é só duplicar o
  cron (ex.: `0 */6 * * *`) se o RPO apertar — o custo é S3.
- Redis (fila de envio de e-mail) não tem backup: contatos **recebidos**
  estão no Postgres; apenas e-mails ainda não enviados se perdem — reenviar
  manualmente consultando `contact_messages` se necessário.
- O backup é de **todo o schema**, não lógico-por-tabela: restauração é
  por banco inteiro (as seções 6.1/6.2 cuidam do caso pontual).
- Staging: se existir, precisa do **próprio** `ENV_FILE`, remote de backup e
  chave age (nunca compartilhar remoto entre ambientes sem prefixo).
