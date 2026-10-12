# API Error Reference

All error responses carry a stable machine-readable error code (field `code`
in the problem payloads, field `error` in the envelope) that the frontend
translates through `site.errors[code]`. Codes are defined in
`STATUS_CODES` (`backend/main.py:36-48`); message text is never localized in
the API.

## Contents

- [Error families](#error-families)
- [Status → code table](#status--code-table)
- [Validation errors (422)](#validation-errors-422)
- [Authentication and authorization (401 / 403)](#authentication-and-authorization-401--403)
- [Not found (404 / 405)](#not-found-404--405)
- [Bad sort (400)](#bad-sort-400)
- [429 Too Many Requests](#429-too-many-requests)
- [Internal error (500)](#internal-error-500)
- [Codes outside STATUS_CODES](#codes-outside-status_codes)

## Error families

| Family | Producer | `Content-Type` | Body shape |
| --- | --- | --- | --- |
| Problem details (RFC 9457) | `_problem()` + `RequestValidationError` / `StarletteHTTPException` / `Exception` handlers, `backend/main.py:51-190` | `application/problem+json` | `type`, `title`, `status`, `code`, `detail`, `request_id` |
| Problem details (inline) | `_problem()` in `backend/app/api/v1/alerts.py:32-35` | `application/problem+json` | `ErrorResponse` model: `type`, `title`, `status`, `code`, `detail`, `instance`, `request_id` |
| Problem-shaped JSON | inline responses in `backend/app/api/v1/contact.py:57-77` | `application/json` | same `ErrorResponse` fields as above |
| Error envelope | `blue_sentinel_error_handler` for `BlueSentinelError`, `backend/app/core/errors.py:41-51` | `application/json` | `error`, `message`, `request_id` (+ `Retry-After` for `RateLimitError`) |

OpenAPI documents both media types for most error responses
(`problem_response()` in `backend/app/schemas/common.py:44-53`).

Every payload carries `request_id`, which equals the `X-Request-ID` response
header — except for the responses built inline in
`backend/app/api/v1/alerts.py` and `backend/app/api/v1/contact.py`, which
construct `ErrorResponse` without one and therefore embed a freshly generated
id.

## Status → code table

`STATUS_CODES` in `backend/main.py:36-48`:

| HTTP status | `code` | When |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Business-rule validation raised as `BlueSentinelError` (e.g. invalid `sort` on `GET /api/v1/admin/messages`) |
| `401` | `UNAUTHORIZED` | Missing/invalid/expired JWT, bad login |
| `403` | `FORBIDDEN` | Non-superuser on an admin route; wrong/missing `ALERT_WEBHOOK_TOKEN`; disabled account |
| `404` | `NOT_FOUND` | Unknown route; unknown lab rule id |
| `405` | `METHOD_NOT_ALLOWED` | Wrong HTTP method for a known path |
| `408` | `TIMEOUT` | Reserved — no route raises it today |
| `409` | `CONFLICT` | Reserved — no route raises it today |
| `422` | `VALIDATION_ERROR` | Request body/query failed Pydantic validation |
| `429` | `RATE_LIMIT` | Rate limit hit (contact IP limit, contact e-mail limit, lab session limit) |
| `500` | `INTERNAL_ERROR` | Unhandled exception |
| `503` | `SERVICE_UNAVAILABLE` | Reserved — no route raises it today |

Any status outside this table falls back to `HTTP_ERROR`
(`backend/main.py:163`). A router may override the code by raising
`HTTPException` with `detail={"code": ..., "message": ...}`; the `code` is then
taken from the dict and `message` becomes `detail`
(`backend/main.py:159-162`).

The `title` for problem responses is the HTTP reason phrase
(`HTTPStatus(<status>).phrase`), e.g. `Unauthorized`, `Not Found`,
`Internal Server Error`.

## Validation errors (422)

Raised by FastAPI/Pydantic and rewritten by the `RequestValidationError`
handler (`backend/main.py:141-153`). All field errors are flattened into a
single `detail` string: `"<loc>: <msg>"` joined with `"; "`.

`422` response — `Content-Type: application/problem+json`:

```json
{
  "type": "about:blank",
  "title": "Validation Error",
  "status": 422,
  "code": "VALIDATION_ERROR",
  "detail": "body.name: Field required; body.email: value is not a valid email address",
  "request_id": "6f1c0b2d9a74"
}
```

Covered routes declare `422` in OpenAPI: `POST /api/v1/contact`,
`POST /api/v1/auth/login`, `GET /api/v1/admin/messages`,
`POST /api/v1/admin/messages/read`.

## Authentication and authorization (401 / 403)

Missing token (`backend/app/core/deps.py:23-27`):

```json
{
  "type": "about:blank",
  "title": "Unauthorized",
  "status": 401,
  "code": "UNAUTHORIZED",
  "detail": "Authentication token missing",
  "request_id": "b7d1e4a2c903"
}
```

Header: `WWW-Authenticate: Bearer`. The same shape is produced for
`Invalid or expired authentication token` and `User not found or inactive`,
and by `POST /api/v1/auth/login` for `Invalid credentials`.

Disabled account or non-superuser:

```json
{
  "type": "about:blank",
  "title": "Forbidden",
  "status": 403,
  "code": "FORBIDDEN",
  "detail": "Administrator permission required",
  "request_id": "0c9f3ab71d55"
}
```

`POST /api/v1/alerts/webhook` answers with the same problem shape and
`detail: null` when the webhook token is missing or wrong.

## Not found (404 / 405)

Unknown path (`detail` is `null`):

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "code": "NOT_FOUND",
  "detail": null,
  "request_id": "3e5d8f01a4b6"
}
```

Unknown lab rule id — this one is raised as `BlueSentinelError`, so it uses
the envelope family (`backend/app/services/lab_service.py:151-152`,
declared as `envelope_response("Unknown rule id")`):

```json
{
  "error": "NOT_FOUND",
  "message": "bs-rule-id-that-does-not-exist",
  "request_id": "3e5d8f01a4b6"
}
```

`405` uses the problem shape with `code` `METHOD_NOT_ALLOWED` and
`title` `Method Not Allowed`.

## Bad sort (400)

`GET /api/v1/admin/messages?sort=whatever` rejects the column before the
query runs (`UnsafeSortError` → `ValidationError`, `code`
`VALIDATION_ERROR`, `status` `400`). It is reported through the envelope
family:

```json
{
  "error": "VALIDATION_ERROR",
  "message": "sort field 'whatever' is not allowed; use one of: created_at, email, id, subject",
  "request_id": "9a17c6e20b4d"
}
```

An invalid direction returns
`sort direction '<value>' is not allowed; use one of: asc, desc`
(`backend/app/security/sql_injection.py:44-52`).

## 429 Too Many Requests

Three rate limits can fire (exact numbers in
[`README.md`](./README.md#rate-limiting)). All of them answer with a
`Retry-After` header expressed in seconds.

**1. Contact IP / contact e-mail limit** — handled inside the route
(`backend/app/api/v1/contact.py:57-67`), `Content-Type: application/json`:

```json
{
  "type": "about:blank",
  "title": "Too Many Requests",
  "status": 429,
  "code": "RATE_LIMIT",
  "detail": "Rate limit exceeded",
  "instance": null,
  "request_id": "f4c2a8de71b903556a1d4e8f9c7b0a12"
}
```

- IP limit breach: `Retry-After` = seconds left in the 60 s sliding window
  (minimum `1`).
- Per-e-mail limit breach: `Retry-After: 3600`.
- Note: this inline response builds `ErrorResponse` without a `request_id`, so
  the value in the body is generated for that response and may differ from the
  `X-Request-ID` header.

**2. Lab session limit** — propagates to the global `BlueSentinelError`
handler (`backend/app/services/lab_service.py:84`):

```json
{
  "error": "RATE_LIMIT",
  "message": "Rate limit exceeded",
  "request_id": "f4c2a8de71b9"
}
```

with `Content-Type: application/json` and `Retry-After` (seconds remaining in
the 600 s window).

**3. Redis unavailable** — behaviour depends on `RATE_LIMIT_FAIL_CLOSED`
(default `false` ⇒ fail-open: the request is allowed; `true` ⇒ fail-closed:
requests are rejected with `429` and `Retry-After` equal to the full window).

429 responses are also counted per route
(`RATE_LIMITED` metric, `backend/app/middleware/request_context.py:89-90`).

## Internal error (500)

Unhandled exceptions never leak stack traces or SQL
(`backend/main.py:181-190`):

```json
{
  "type": "about:blank",
  "title": "Internal Server Error",
  "status": 500,
  "code": "INTERNAL_ERROR",
  "detail": "An unexpected error occurred.",
  "request_id": "7b0e1c44fa92"
}
```

## Codes outside STATUS_CODES

| `code` | Status | Where |
| --- | --- | --- |
| `INVALID_PAYLOAD` | `400` | `POST /api/v1/alerts/webhook` with an unparseable body |
| `HTTP_ERROR` | any | Fallback when a status has no entry in `STATUS_CODES` |
| `GITHUB_RATE_LIMIT` | `429` | Internal to `GitHubService._fetch_from_api`; `GET /github/stats` catches it and serves empty/stale stats instead of failing |
| `GITHUB_UNREACHABLE` | `502` | Same — converted to a fallback payload before reaching the client |

WebSocket error codes (`BAD_MESSAGE`, `NOT_RUNNING`, `SESSION_EXPIRED`, …) are
part of the lab protocol, not HTTP errors — see
[`websocket.md`](./websocket.md#server-errors).
