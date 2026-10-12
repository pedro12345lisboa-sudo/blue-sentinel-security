# Hardening Baseline — BLUE-SENTINEL (as implemented)

The security baseline of this repository, control by control. Nothing here is
aspirational: every entry names the file that implements it and a command that
proves it. Gaps that are **not** covered by a control live in
[`threat-model.md` §9](./threat-model.md) (residual risks) — read that before
assuming this list is complete.

**How to read an entry**

- **What** — the control and why it exists.
- **Where** — the file (and line/block) that configures it.
- **Verify** — a command you can run now. `$DOMAIN` is your domain placeholder
  (e.g. `your-domain.example`); run host-level commands on the VPS.

**Environment matrix**

| Control | Dev (`docker-compose.yml`) | Prod (`docker-compose.prod.yml`) |
|---|---|---|
| Published ports | `8000`, `3000` (dev convenience) | **only** `80`/`443` on `caddy` |
| Networks | `frontend-net` (routable), `backend-net` (`internal: true`) | `edge`, `backend` (`internal: true`) |
| Secrets | `.env` defaults (`changeme`, `dev-agent-key`) | `./secrets/*` (600) via Docker secrets |
| Rate-limit fail mode | fail-**open** (default) | fail-**closed** (`RATE_LIMIT_FAIL_CLOSED=true`) |
| Container hardening | build + run as non-root image user | + `read_only`, `cap_drop: ALL`, `no-new-privileges`, `pids_limit` |

---

## 1. Network segmentation

**What.** Two Docker networks split the trust zones. The data zone
(`backend`) is `internal: true` — no route to the Internet and no published
ports — so PostgreSQL and Redis are unreachable from outside Docker and from
the Internet (only containers explicitly attached to that network can open a
socket; see the RR-11 note below). The edge zone is the only network with
egress (ACME DNS-01, GitHub API, SMTP). Only Caddy publishes ports; the
acceptance criterion is "5432/6379/8000/3000/2019 are closed".

**Where.**
- `docker-compose.prod.yml:347-356` — `edge` / `backend` (`internal: true`),
  plus `docker-compose.prod.yml:56-58` (only `caddy` publishes `80`/`443`).
- `docker-compose.yml:156-162` — dev `backend-net` (`internal: true`) and
  `frontend-net`.
- Routing: `docker/caddy/Caddyfile:52-71` (`/api/v1/*` → backend, rest →
  frontend); server-side rewrite in `frontend/next.config.js:29-44`.
- Acceptance test: `scripts/deployment/healthcheck.sh:97-108`.

**Known gap (RR-11).** `frontend` is attached to *both* `edge` and `backend`
(`docker-compose.prod.yml:318-320`) because it calls
`http://backend:8000` directly (`:307`) — so a compromised Next.js process
could open a socket to 5432/6379. It holds no database credential and mounts
no secret (`:303-317`), and the containers are read-only/non-root (§2), which
limits the impact; see `threat-model.md` §9 for the suggested follow-up.

**Verify.**

```bash
./scripts/deployment/healthcheck.sh            # fails if any internal port is open
# network flags (prod project name defaults to blue-sentinel):
docker network inspect ${COMPOSE_PROJECT_NAME:-blue-sentinel}_backend \
  -f '{{.Name}} internal={{.Internal}}'        # expect internal=true
# no published ports outside caddy (prod):
docker compose --env-file .env.prod -f docker-compose.prod.yml ps \
  --format '{{.Name}} {{.Ports}}'              # only caddy shows 0.0.0.0:80,443
# which networks each app container joins (documents RR-11):
for c in caddy backend frontend; do
  id=$(docker compose --env-file .env.prod -f docker-compose.prod.yml ps -q $c)
  echo "$c: $(docker inspect "$id" \
    -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}')"
done
# expect caddy=edge | backend=edge backend | frontend=edge backend
```

---

## 2. Non-root, read-only containers

**What.** Every service runs as a dedicated non-root user, with a read-only
root filesystem, all Linux capabilities dropped, `no-new-privileges`, a PID
limit, CPU/memory limits and tmpfs mounts for writable paths (`/tmp`,
Postgres sockets, Next ISR cache). Caddy binds 80/443 *without* capabilities
by lowering `net.ipv4.ip_unprivileged_port_start` inside the container.

**Where.**
- Users: `backend/Dockerfile:38` (`USER appuser`), `frontend/Dockerfile:32`
  (`USER nextjs`), `docker/caddy/Dockerfile:23` (`USER caddy:caddy`),
  `docker-compose.prod.yml:107` (`user: postgres`), `:162` (`user: redis`).
- Posture: `docker-compose.prod.yml:72-81` (caddy), `:127-132` (postgres),
  `:183-190` (redis), `:266-274` (backend), `:318-325` (frontend) —
  `read_only: true`, `cap_drop: [ALL]`, `security_opt: no-new-privileges:true`,
  `pids_limit`.
- Resource ceilings: the `deploy.resources` block of each service
  (e.g. backend `2 CPU / 768M`, `docker-compose.prod.yml:284-291`).

**Verify.**

```bash
CID=$(docker compose --env-file .env.prod -f docker-compose.prod.yml ps -q backend)
docker inspect -f 'user={{.Config.User}} ro={{.HostConfig.ReadonlyRootfs}} caps={{json .HostConfig.CapDrop}} opt={{json .HostConfig.SecurityOpt}} pids={{.HostConfig.PidsLimit}}' "$CID"
# expected: user=appuser ro=true caps=["ALL"] opt=["no-new-privileges:true"] pids=300
docker exec "$CID" id -u        # non-zero UID
docker exec "$CID" touch /write-test 2>/dev/null && echo "RW ROOTFS (bad)" || echo "read-only OK"
```

---

## 3. Secrets handling

**What.** Secrets are files under `./secrets/` (directory `700`, files `600`,
**outside Git**), generated by `deploy.sh init` with random values, mounted as
Docker secrets (`/run/secrets/<name>`) and exported to environment variables
by an entrypoint that only fills *empty* variables — it never overwrites an
explicit env value. The CF DNS token and the age/rclone material are entered
manually once.

**Where.**
- Generation + permissions: `scripts/deployment/deploy.sh:40-44` (`gen_secret`,
  `chmod 600`), `:63` (`chmod 700 secrets`), `:64-91` (per-secret files).
- Mounting: `docker-compose.prod.yml:253-258` (backend), `:54-55` (caddy),
  `:370-382` (top-level `secrets:` map).
- Export: `docker/load-secrets.sh:12-28`.
- Postgres reads its own password from the file
  (`POSTGRES_PASSWORD_FILE`, `docker-compose.prod.yml:112`).
- Inventory and rotation: `docs/architecture/infrastructure.md:§6`,
  `docs/architecture/runbook.md` §7.

**Verify.**

```bash
stat -c '%a %n' .env.prod secrets secrets/*     # 600 for files, 700 for the dir
git ls-files secrets .env.prod                  # must print nothing
docker compose --env-file .env.prod -f docker-compose.prod.yml config --quiet && echo "compose OK"
CID=$(docker compose --env-file .env.prod -f docker-compose.prod.yml ps -q backend)
docker inspect -f '{{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}}{{"\n"}}{{end}}' "$CID" | grep /run/secrets
```

---

## 4. Rate limiting and fail mode

**What.** A Redis-backed **sliding-window** limiter (single atomic Lua `EVAL`,
so concurrent requests cannot race the counter) with an explicit policy for
Redis outages: `open` (let traffic through) or `closed` (block). The contact
form has two layers — 10 requests/min per IP and 5/hour per e-mail enforced
in SQL — plus a honeypot that silently discards bot submissions. The lab adds
10 session creations/600 s per IP. Production sets the failure mode to
**closed**.

**Where.**
- Limiter core + failure mode: `backend/app/middleware/rate_limit.py:31-56`
  (Lua), `:69-77` (`FailureMode.from_settings`), `:149-159` (fail behaviour).
- Policy switch: `backend/app/core/config.py:19-21`
  (`RATE_LIMIT_FAIL_CLOSED`), set to `"true"` in
  `docker-compose.prod.yml:240`.
- Contact limits: `backend/app/api/v1/contact.py:21-29` (10/min per IP),
  `backend/app/services/contact_service.py:17,57-68` (5/h per e-mail),
  `:49-55` (honeypot).
- Lab limits: `backend/app/services/lab_service.py:33-36,72-85`; WebSocket
  caps `backend/app/api/v1/ws_lab.py:53-62`.
- Edge: Cloudflare rate limiting sits in front (see `docs/architecture/infrastructure.md:§4`).

**Verify.**

```bash
# 11 posts in a row: the 11th must be 429 with Retry-After
for i in $(seq 1 11); do
  curl -s -o /dev/null -w '%{http_code} ' -X POST https://$DOMAIN/api/v1/contact \
    -H 'Content-Type: application/json' \
    -d '{"name":"Limit Probe","email":"probe@example.invalid","subject":"limit check","message":"verifying the sliding window limit today"}'
done; echo

# fail mode actually closed in production
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T backend \
  python -c 'from app.core.config import settings; print("fail_closed =", settings.rate_limit_fail_closed)'

# unit + integration coverage
cd backend && python -m pytest tests/security/test_rate_limit.py tests/integration/test_contact_api.py -q
```

---

## 5. Input validation (Pydantic, Zod, allowlists)

**What.** Three independent layers: the browser validates with **Zod**
(rejects nonsense before it is sent), the API validates with **Pydantic**
(422 `problem+json` on anything malformed, with length bounds so a huge body
never reaches the database), and query-building is constrained by an
**allowlist** (dynamic `ORDER BY` accepts only mapped columns — anything else
raises `UnsafeSortError` before the DB is touched). WebSocket input is
bounded to 4 KB and must be a JSON object; the Caddy body limit is 1 MB.

**Where.**
- Zod: `frontend/src/components/contact/contact-form.tsx:28-37` (schema),
  `:73-78` (client-side honeypot short-circuit).
- Pydantic: `backend/app/schemas/contact.py:6-11` (`min_length`/`max_length`,
  `EmailStr`), error mapping `backend/main.py:141-154`.
- SQL allowlist: `backend/app/services/contact_service.py:21-27,94-104`,
  `backend/app/security/sql_injection.py`.
- WS bounds: `backend/app/api/v1/ws_lab.py:62,337-348`, scenario ids resolved
  from the allowlisted catalogue `:180-184`.
- Body size: `docker/caddy/Caddyfile:30-32` (`request_body max_size 1mb`).

**Verify.**

```bash
# 422 on a short payload
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://$DOMAIN/api/v1/contact \
  -H 'Content-Type: application/json' -d '{"name":"x"}'          # expect 422

# 422 on a giant message (>5000 chars)
python -c "print('{\"name\":\"AB\",\"email\":\"a@b.co\",\"subject\":\"hi\",\"message\":\"' + 'x'*6000 + '\"}')" > /tmp/big.json
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://$DOMAIN/api/v1/contact \
  -H 'Content-Type: application/json' --data @/tmp/big.json       # expect 422

# SQL-safety and never-500 property suites
(cd backend && python -m pytest tests/security/test_sql_safety.py tests/security/test_properties.py -q)

# frontend schema tests
(cd frontend && pnpm test)
```

---

## 6. HTTP security headers (and the CSP status)

**What.** The frontend emits `X-Content-Type-Options: nosniff`,
`Referrer-Policy: origin-when-cross-origin` and `X-DNS-Prefetch-Control: on`
for every page; Caddy adds **HSTS** (`max-age=31536000; includeSubDomains`)
and compresses with gzip/zstd. **There is no Content-Security-Policy yet** —
this is a documented, accepted gap (`threat-model.md` AR-03 / RR-01), not an
oversight to be "discovered" later.

**Where.**
- `frontend/next.config.js:45-65` (`headers()`).
- `docker/caddy/Caddyfile:28,36-38` (HSTS only — the comment explicitly says
  app headers must not be overwritten).
- Status of CSP: `frontend/messages/en.json:988` ("CSP and HSTS are not
  enabled yet" — HSTS is added at the Caddy layer).

**Verify.**

```bash
curl -sI https://$DOMAIN/ | grep -Ei 'strict-transport-security|x-content-type-options|referrer-policy'
# CSP: currently absent — this command prints nothing (RR-01 tracks adding it)
curl -sI https://$DOMAIN/ | grep -ci content-security-policy
```

---

## 7. TLS at the edge: Cloudflare + Caddy

**What.** Cloudflare proxies the domain (origin IP hidden, WAF, cache,
`Full (strict)`), and Caddy terminates real Let's Encrypt certificates using
**ACME DNS-01** with the `caddy-dns/cloudflare` plugin (no HTTP-01 challenge
needs to be relayed). Only Cloudflare IP ranges are accepted at the origin —
at two independent layers (Caddy matcher and the host firewall) — and the
client IP header is **overwritten** with `CF-Connecting-IP` so it cannot be
spoofed downstream. TLS 1.2/1.3 only; direct origin access returns 403.

**Where.**
- `docker/caddy/Caddyfile:21-26` (DNS-01 + protocol versions),
  `:49` (`@cf remote_ip` ranges — single source of truth),
  `:54-76` (routing, `header_up X-Forwarded-For {CF-Connecting-IP}`, 403 for
  direct access), `:30-38` (1 MB body, HSTS).
- Build of the proxy image: `docker/caddy/Dockerfile:8,23`
  (`xcaddy build --with github.com/caddy-dns/cloudflare`, `USER caddy`).
- Server-side trust of the proxy header:
  `docker-compose.prod.yml:227-228` (`--proxy-headers --forwarded-allow-ips=*`).
- CF ranges consumed by the firewall too: `scripts/setup/harden-server.sh:67-81`.
- Cert expiry gate: `scripts/deployment/healthcheck.sh:110-120`.
- Debug variant (DNS-only, **no** CF filter): `docker/caddy/Caddyfile.direct`.

**Verify.**

```bash
echo | openssl s_client -connect $DOMAIN:443 -servername $DOMAIN 2>/dev/null \
  | grep -E 'Protocol|Cipher '                     # TLSv1.2/1.3 only
./scripts/deployment/healthcheck.sh                # cert > 14 days + CF ranges fresh

# direct origin (from a non-Cloudflare IP) must be 403
curl -s -o /dev/null -w '%{http_code}\n' -H "Host: $DOMAIN" http://<origin-ip>/
# expected: 403  "Direct origin access is disabled (Cloudflare only)."

# CF ranges in the Caddyfile match Cloudflare's published lists
diff <(grep -E '^@cf remote_ip ' docker/caddy/Caddyfile | tr ' ' '\n' | grep -E '^[0-9]+\.' | sort) \
     <(curl -fsS https://www.cloudflare.com/ips-v4 | sort) && echo "ranges OK"
```

---

## 8. Host hardening: UFW, DOCKER-USER, sysctl, fail2ban, auto-updates

**What.** One idempotent, re-runnable script (`sudo ./scripts/setup/harden-server.sh`)
configures: UFW default-deny incoming with SSH **rate-limited** and 80/443
allowed; a systemd unit that installs iptables/ip6tables chains
(`BLUE-CF-V4/v6`) in `DOCKER-USER` so **only Cloudflare ranges** can reach
80/443 (Docker publishes bypass UFW, which is why this layer exists); kernel
sysctls (reverse-path filters, no redirects, SYN cookies, `kptr_restrict`,
`dmesg_restrict`, `yama.ptrace_scope`, protected symlinks/hardlinks); fail2ban
`sshd` jail (1 h ban, 5 retries/10 min); and daily unattended-upgrades. It
deliberately does **not** edit `sshd_config` (lockout safety).

**Where.** `scripts/setup/harden-server.sh`
— UFW `:47-57`, CF range extraction `:67-82`, firewall script + systemd unit
`:84-160`, sysctl `/etc/sysctl.d/99-blue-sentinel.conf` `:163-180`, fail2ban
`:184-196`, unattended-upgrades `:199-206`, exit checklist `:208-212`.

**Verify.**

```bash
ufw status verbose                        # default deny in; 22/tcp (limit), 80, 443
systemctl is-active blue-sentinel-fw fail2ban unattended-upgrades
sudo iptables -L BLUE-CF-V4 -n | head -20 # ACCEPT per CF range, then DROP
fail2ban-client status sshd
sysctl net.ipv4.conf.all.rp_filter net.ipv4.tcp_syncookies kernel.kptr_restrict \
       kernel.dmesg_restrict kernel.yama.ptrace_scope
cat /etc/sysctl.d/99-blue-sentinel.conf
```

---

## 9. Backup encryption (age) + off-site copy (rclone)

**What.** The daily cron dumps Postgres (`pg_dump -Fc`) plus a tar of
`.env.prod` + `secrets/`, encrypts **both** with `age` to the recipients in
`secrets/backup-recipients.txt`, writes them locally and uploads them to any
S3-compatible remote via rclone, verifies the remote copy (`rclone check`),
and applies retention (7 days + 4 Sundays, local and remote). The private key
never leaves the server by itself — external escrow is mandatory. A monthly
cron restores the newest backup into a throwaway PostgreSQL container to prove
it decrypts and restores.

**Where.**
- `scripts/deployment/backup.sh` (dump → age → rclone → retention; `--verify`
  `:59-90`; `--install-cron`; `chmod 600` on encrypted artifacts `:143,157`).
- `scripts/deployment/restore.sh --test --auto` (monthly test, never touches
  the real database).
- Key/escrow policy: `docs/architecture/disaster-recovery.md:§3-5`.
- Retention knobs: `.env.prod.example:74-75`
  (`BACKUP_RETENTION_DAYS=7`, `BACKUP_RETENTION_WEEKS=4`).

**Verify.**

```bash
./scripts/deployment/backup.sh --verify                 # decrypts the newest remote dump + config tar
ls -l backups/*.age | tail                             # recent artifacts exist locally
age -d -i secrets/backup.age.key backups/$(ls -t backups | grep dump.age | head -1) > /dev/null && echo "decrypt OK"
tail -20 logs/restore-test.log                          # last line must be: TESTE DE RESTAURAÇÃO: PASSOU
```

---

## 10. Retention and LGPD cleanup

**What.** Deletion is automated and on demand: a background loop in the app
lifespan runs `run_retention_cleanup()` every `CLEANUP_INTERVAL_HOURS`
(default 24 h), removing contact messages older than `CONTACT_RETENTION_DAYS`
(90) and lab sessions older than `LAB_SESSION_RETENTION_DAYS` (30). The
metric `bs_cleanup_removed_total{kind}` shows what was removed. Collection
itself is minimised: `contact_messages` has **no** IP/user-agent columns, and
only one technical cookie exists (`BLUE_SENTINEL_LOCALE`, written by the
language selector).

**Where.**
- Loop: `backend/main.py:78-93,102-103`; worker
  `backend/app/workers/cleanup/old_events_cleanup.py` (metric increments at
  `:66,83`).
- Settings: `backend/app/core/config.py:63-65,119-120`; `.env.example:86-91`.
- Model without IP: `backend/app/models/contact_message.py:10-29`.
- Cookie: `frontend/src/i18n/config.ts:64`, `frontend/src/middleware.ts:34-42`.
- Inventory of what is kept: [`data-inventory.md`](./data-inventory.md).

**Verify.**

```bash
(cd backend && python -m pytest tests/unit/test_retention_cleanup.py -q)
# live counter (needs the metrics endpoint mounted — see §12 / RR-04)
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T backend \
  curl -s -H "Authorization: Bearer $METRICS_TOKEN" localhost:8000/api/v1/metrics \
  | grep -E '^bs_cleanup_removed_total\{kind="(contact_messages|lab_sessions)"\}'
# settings actually loaded
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T backend \
  python -c 'from app.core.config import settings as s; print(s.contact_retention_days, s.lab_session_retention_days, s.cleanup_interval_hours)'
```

---

## 11. Log redaction

**What.** Every log line is JSON and passes through a `RedactionFilter`
**before** serialisation, so even a legacy `logger.info("... %s", email)` is
safe: e-mails are masked (`j***@example.com`), JWTs/Bearer tokens and
`password=…`/`token=…` assignments become `[REDACTED]`, and keys such as
`*_ip`, `*_email`, `user_agent`, `cookie`, `api_key` are dropped or masked.
Request logs record method, route, status and duration — never the query
string (it can carry tokens) and never the client IP; the IP appears only as
a SHA-256 hash with a 24-hour rotating salt (`hash_ip`).

**Where.**
- `backend/app/core/logging.py:47-75` (key lists), `:95-103` (text masking),
  `:147-161` (`RedactionFilter`), `:202-217` (`setup_logging` installs it on
  the handler *and* the root logger).
- Request log content: `backend/app/middleware/request_context.py:55,100-108`
  (path only, no query string) and `:31` (safe incoming `X-Request-ID`).
- Actor hashing: `backend/app/monitoring/security_events.py:65-77`.

**Verify.**

```bash
(cd backend && python -m pytest tests/security/test_log_redaction.py -q)

# live log stream must contain no full e-mail address
docker compose --env-file .env.prod -f docker-compose.prod.yml logs --tail 500 backend 2>/dev/null \
  | grep -Eoc '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' || echo "no full e-mail in logs"
```

---

## 12. Webhook, metrics and agent authentication

**What.** Three distinct mechanisms, often confused:

1. **Alertmanager → backend webhook** (`POST /api/v1/alerts/webhook`): shared
   `ALERT_WEBHOOK_TOKEN` compared with `secrets.compare_digest` (constant
   time). If the token is unset the endpoint is **closed** (403), never open.
2. **Prometheus → `/api/v1/metrics`**: `METRICS_TOKEN` via
   `Authorization: Bearer` or `X-Metrics-Token`, constant-time compare; empty
   token ⇒ endpoint disabled (403). *Note:* the router exists
   (`backend/app/api/v1/metrics.py`) but is **not currently mounted** in
   `backend/main.py` (residual risk RR-04 — the failure mode is safe: 404).
3. **C++ agent → ingest**: HMAC-SHA256 over `timestamp.body` with
   `X-Sentinel-Timestamp` / `X-Sentinel-Signature`, verified inside a ±300 s
   anti-replay window with a constant-time compare; the key comes from
   `SENTINEL_SECRET` (never embedded in the binary). **No backend ingest
   route exists yet** — `AGENT_HMAC_SECRET` is reserved configuration
   (accepted risk AR-04).

**Where.** `backend/app/api/v1/alerts.py:39-58`; `backend/app/api/v1/metrics.py:26-48`;
`backend/app/core/config.py:74,92`; token files
`docker/prometheus/metrics_token`, `docker/prometheus/alert_webhook_token`
(both local, out of Git) and `docker/prometheus/prometheus.yml:34-36`;
agent side `agent/src/core/signer.cpp`, `agent/README.md:30-32`.

**Verify.**

```bash
# webhook closed without a token
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://$DOMAIN/api/v1/alerts/webhook \
  -H 'Content-Type: application/json' -d '{}'                 # expect 403

# webhook accepts the real token
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://$DOMAIN/api/v1/alerts/webhook \
  -H "Authorization: Bearer $ALERT_WEBHOOK_TOKEN" \
  -H 'Content-Type: application/json' -d '{}'                 # expect 200/400, never 403

# metrics (currently 404 until RR-04 is fixed; 403 with a wrong token once mounted)
curl -s -o /dev/null -w '%{http_code}\n' https://$DOMAIN/api/v1/metrics

# agent signature suite
cd agent && ctest --preset linux-debug -R signer --output-on-failure
```

---

## 13. JWT admin authentication and RBAC

**What.** Admin access is API-only (no frontend route). `POST /api/v1/auth/login`
verifies a **bcrypt** hash; on success it issues an **HS256** JWT signed with
`SECRET_KEY`, valid for **1 hour**, containing only `sub`/`iat`/`exp`. Every
admin router declares `Depends(require_admin)`: missing/invalid/expired token
→ 401 with `WWW-Authenticate`, authenticated non-superuser → 403, disabled
account → 403 at login (and 401 at token resolution). `decode_token()` swallows
every decode error (including `alg: none` and non-numeric `sub`) and returns
`None`.

**Where.** `backend/app/api/v1/auth.py:21-32,44-67,70-75`;
`backend/app/core/deps.py:17-62`; router-level dependencies
`backend/app/api/v1/admin.py:23,65`; secret from
`docker-compose.prod.yml:255` (`secret_key`).

**Verify.**

```bash
cd backend && python -m pytest tests/security/test_auth_rbac.py tests/integration/test_auth_admin.py -q

# unauthenticated admin call
curl -s -o /dev/null -w '%{http_code}\n' https://$DOMAIN/api/v1/admin/messages   # expect 401
# bogus token
curl -s -o /dev/null -w '%{http_code}\n' https://$DOMAIN/api/v1/admin/messages \
  -H 'Authorization: Bearer not-a-jwt'                                           # expect 401
# login is validated
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://$DOMAIN/api/v1/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"admin","password":"wrong"}' # expect 401
```

---

## 14. Detection content and CI gates (integrity of `rules/`)

**What.** The detection library is mounted **read-only** into the API
(`/rules:ro`), rule ids and MITRE tags are validated at load time, and CI
regenerates/checks the ATT&CK coverage matrix so a weakened rule cannot be
merged silently: positive fixtures must keep firing (100 % hit-rate), negative
fixtures must stay quiet. Release builds only run after pytest ≥ 85 % coverage
and the rule validator pass.

**Where.** `docker-compose.prod.yml:260` (mount), `docker-compose.yml:72`,
`.github/workflows/ci.yml:97-103` (pytest + `validate_rules.py`),
`.github/workflows/release.yml:22-43` (gates before push),
`docs/security/attack-coverage.md:8-19` (generated block + CI check).

**Verify.**

```bash
python scripts/development/validate_rules.py --check-docs   # non-zero exit if the matrix is stale
python scripts/development/validate_rules.py -v             # fixture hit-rate must stay 100%
cd backend && python -m pytest tests/unit/detection -q
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T backend \
  grep ' /rules ' /proc/mounts                  # the mount options must contain "ro"
```

---

## 15. One-shot verification checklist

Run top to bottom on the VPS after any deploy:

```bash
set -e
stat -c '%a %n' .env.prod secrets secrets/*                 # §3  600/700, never in Git
./scripts/deployment/healthcheck.sh                         # §1  ports closed, cert, CF ranges
systemctl is-active blue-sentinel-fw fail2ban               # §8  host firewall live
ufw status verbose | head -5                                # §8  deny incoming
CID=$(docker compose --env-file .env.prod -f docker-compose.prod.yml ps -q backend)
docker inspect -f '{{.Config.User}} {{.HostConfig.ReadonlyRootfs}} {{json .HostConfig.CapDrop}}' "$CID"   # §2
curl -sI https://$DOMAIN/ | grep -Ei 'strict-transport-security|x-content-type-options'                   # §6
echo | openssl s_client -connect $DOMAIN:443 -servername $DOMAIN 2>/dev/null | grep Protocol             # §7
cd backend && python -m pytest tests/security -q           # §4 §5 §11 §13
cd .. && python scripts/development/validate_rules.py --check-docs   # §14
./scripts/deployment/backup.sh --verify                    # §9
tail -1 logs/restore-test.log                              # §9  "TESTE DE RESTAURAÇÃO: PASSOU"
```

## Related reading

- Threats, accepted and residual risks: [`threat-model.md`](./threat-model.md)
- What data is held and for how long: [`data-inventory.md`](./data-inventory.md)
- Security test matrix: [`docs/testing.md`](../testing.md)
- Day-to-day operations: [`runbook.md`](../architecture/runbook.md)
- Topology, ports and secrets: [`infrastructure.md`](../architecture/infrastructure.md)
