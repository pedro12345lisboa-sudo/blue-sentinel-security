# API Authentication and Authorization

How credentials are issued and checked by the Blue-Sentinel backend
(`backend/app/api/v1/auth.py`, `backend/app/core/deps.py`,
`backend/app/api/v1/admin.py`, `backend/app/api/v1/alerts.py`,
`backend/app/api/v1/ws_lab.py`).

## Contents

- [Model overview](#model-overview)
- [Obtaining a token](#obtaining-a-token)
- [Using the token](#using-the-token)
- [Protected routes](#protected-routes)
- [Public routes](#public-routes)
- [Lab WebSocket ticket](#lab-websocket-ticket)
- [Alertmanager webhook](#alertmanager-webhook)
- [Agent HMAC credentials](#agent-hmac-credentials)
- [Dev placeholders](#dev-placeholders)

## Model overview

| Aspect | Value | Source |
| --- | --- | --- |
| Scheme | JWT Bearer (`Authorization: Bearer <token>`) | `HTTPBearer(auto_error=False)` in `backend/app/core/deps.py:8` |
| Algorithm | `HS256` | `ALGORITHM = "HS256"`, `backend/app/api/v1/auth.py:22` |
| Signing key | `SECRET_KEY` (`Settings.secret_key`) | `backend/app/core/config.py:29` |
| Lifetime | 1 hour (`TOKEN_TTL_HOURS = 1`) | `backend/app/api/v1/auth.py:23` |
| Claims | `sub` = user id (string), `exp`, `iat` | `create_access_token()` |
| Password hashing | bcrypt via passlib (`CryptContext(schemes=["bcrypt"])`) | `backend/app/api/v1/auth.py:21` |
| Refresh / logout | **None** — stateless tokens, no refresh token, no revocation endpoint | — |

Because validation is stateless, rotating `SECRET_KEY` invalidates every
outstanding token; there is no server-side session store or token denylist.

## Obtaining a token

```http
POST /api/v1/auth/login
Content-Type: application/json
```

```json
{
  "username": "admin",
  "password": "secretpass123"
}
```

`LoginRequest` constraints: `username` 3–128 chars, `password` ≥ 8 chars
(`422` otherwise).

Success — `200 OK`:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

`expires_in` is `TOKEN_TTL_HOURS * 3600` = `3600`.

Behaviour (`backend/app/api/v1/auth.py:44-67`):

- Unknown user **or** bcrypt mismatch → `401`, code `UNAUTHORIZED`,
  detail `Invalid credentials`.
- Existing user with `is_active = false` → `403`, code `FORBIDDEN`,
  detail `Account disabled`.
- On success `last_login` is updated and the row committed.

## Using the token

```http
GET /api/v1/admin/messages
Authorization: Bearer <access_token>
```

`get_current_user` (`backend/app/core/deps.py:17-51`) runs on every protected
request:

1. No `Authorization` header → `401`, code `UNAUTHORIZED`, detail
   `Authentication token missing`, header `WWW-Authenticate: Bearer`.
2. `decode_token()` fails (bad signature, expired, missing/invalid `sub`) →
   `401`, detail `Invalid or expired authentication token`, header
   `WWW-Authenticate: Bearer`.
3. User id not found, or `is_active == false` → `401`, detail
   `User not found or inactive`.
4. Otherwise the dependency returns `{"id", "username", "is_superuser"}`.

`HTTPBearer(auto_error=False)` is used, so a missing header is handled by the
explicit `401` above rather than by the framework.

## Protected routes

| Route | Guard | Extra failures |
| --- | --- | --- |
| `GET /api/v1/admin/messages` | `require_admin` (Bearer + `is_superuser`) | `400` invalid `sort`/`direction`, `422` bad query bounds |
| `POST /api/v1/admin/messages/read` | `require_admin` (Bearer + `is_superuser`) | `422` empty/oversized `message_ids` |

`require_admin` (`backend/app/core/deps.py:54-62`) raises
`403 FORBIDDEN` with detail `Administrator permission required` when the
authenticated user's `is_superuser` flag is false. Both routes are declared in
OpenAPI with the `HTTPBearer` security scheme.

Every other HTTP route in `main.py` is public (subject to rate limits, the
contact honeypot, or a shared token — see below).

## Public routes

| Route | Additional gate |
| --- | --- |
| `POST /api/v1/contact` | Redis IP limit 10/60 s, per-e-mail limit 5/h, `honeypot` field must be empty |
| `GET /api/v1/github/stats` | — |
| `POST /api/v1/lab/sessions` | in-memory IP limit 10/600 s |
| `GET /api/v1/lab/scenarios`, `GET /api/v1/lab/rules`, `GET /api/v1/lab/rules/{rule_id}` | — |
| `GET /api/v1/status`, `GET /api/v1/health/live`, `GET /api/v1/health/ready` | — |
| `POST /api/v1/auth/login` | — |
| `GET /` | — |
| `GET /api/v1/ws/lab/{session_id}` | short-lived ticket (below) |
| `POST /api/v1/alerts/webhook` | shared `ALERT_WEBHOOK_TOKEN` (below) |

## Lab WebSocket ticket

The lab WebSocket does not accept JWTs. It authenticates with a
short-lived ticket created by `POST /api/v1/lab/sessions`:

- `ticket` format `tk-<16 hex chars>`, `session_id` format `sess-<12 hex chars>`.
- TTL: `SESSION_TTL_MINUTES = 30` minutes (`backend/app/services/lab_service.py:33`).
- Presented as a query parameter: `/api/v1/ws/lab/{session_id}?ticket=<ticket>`.
- The ticket is looked up in `lab_sessions` (`session_token`, `status = active`,
  `expires_at` in the future) and is reusable until it expires; it is not
  consumed on connect.
- Unknown, inactive or expired tickets are rejected before the socket is
  accepted (close code `1008`).

Full protocol: [`websocket.md`](./websocket.md).

## Alertmanager webhook

`POST /api/v1/alerts/webhook` is authenticated with a shared secret, not a JWT
(`backend/app/api/v1/alerts.py:39-58`):

- Token read from `Authorization: Bearer <token>` or `X-Alert-Token: <token>`.
- Compared with `secrets.compare_digest` against `ALERT_WEBHOOK_TOKEN`.
- If `ALERT_WEBHOOK_TOKEN` is **unset or wrong**, the endpoint is closed and
  returns `403` (`application/problem+json`, code `FORBIDDEN`).
- Invalid JSON body → `400`, code `INVALID_PAYLOAD`.

Successful delivery returns
`{"accepted": <int>, "forwarded": <int>}`.

## Agent HMAC credentials

The compose file passes two agent-related secrets to the backend and worker
containers (`docker-compose.yml:68-69`, `109-110`):

| Variable | Purpose in this repository |
| --- | --- |
| `AGENT_API_KEY` | Declared in `Settings` (`backend/app/core/config.py:24`); **no route in `backend/app/api/v1/*` reads it**. |
| `AGENT_HMAC_SECRET` | Declared in `Settings` (`backend/app/core/config.py:25`); **no route in `backend/app/api/v1/*` verifies it today**. |

The consuming side of the shared secret is the C++ agent
(`agent/`), which signs every batch as
`HMAC-SHA256(SECRET, "<timestamp>.<body>")` and sends it in
`X-Sentinel-Timestamp` / `X-Sentinel-Signature` (see `agent/README.md`;
the key comes from the agent's own `SENTINEL_SECRET` or config file). No
ingestion endpoint under `/api/v1` currently validates those headers, so the
secret is provisioned but not yet exercised by the HTTP API.

Related monitoring token: `METRICS_TOKEN` guards
`backend/app/api/v1/metrics.py` (`Authorization: Bearer` or `X-Metrics-Token`,
constant-time compare, empty token ⇒ endpoint disabled with `403`), but that
router is not included in `main.py`, so `/api/v1/metrics` is not served.

## Dev placeholders

All credentials shipped in `.env.example` are **development placeholders** and
must never be reused outside local development:

| Variable | `.env.example` value |
| --- | --- |
| `SECRET_KEY` (JWT signing) | `this-is-a-dev-secret-key-must-change-min-32-chars` |
| `AGENT_API_KEY` | `dev-agent-key-must-change-in-production` |
| `AGENT_HMAC_SECRET` | `this-is-a-dev-secret-must-change-prod-min-32-chars` |
| `POSTGRES_PASSWORD` | `changeme_default_must_overwrite` |
| `ALERT_WEBHOOK_TOKEN` | empty (endpoint disabled) |
| `METRICS_TOKEN` | empty (endpoint disabled) |
| `DEBUG` | `True` (CORS wildcard) |

`.env.prod.example` states that real secrets live under `./secrets/*`
(mode `600`, Docker secrets) and are never committed. The repository's default
`Settings` values are the same dev placeholders, so an unconfigured deployment
inherits them.
