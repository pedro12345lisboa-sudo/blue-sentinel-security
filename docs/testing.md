# Testing

How every layer of BLUE-SENTINEL is verified, how to run it locally, which
gates CI enforces, and what to do when a test is flaky.

## Quick reference

| Layer | Command | Gate |
|---|---|---|
| Frontend lint + types | `cd frontend && pnpm lint && pnpm type-check` | exit 0 |
| i18n key parity | `cd frontend && pnpm check:i18n` | exit 0 |
| Frontend unit | `cd frontend && pnpm test` | exit 0 |
| Frontend coverage | `cd frontend && pnpm test:coverage` | ≥ 70 % (all four metrics) |
| Frontend e2e + a11y | `cd frontend && pnpm test:e2e` | exit 0, zero serious/critical axe violations |
| Backend | `cd backend && .venv/Scripts/python -m pytest` (Linux/macOS: `python -m pytest`) | ≥ 85 % coverage, exit 0 |
| Rule library + hit-rate | `python scripts/development/validate_rules.py` | hit-rate 100 %, exit 0 |
| Load (k6) | `k6 run scripts/development/load/{contact,lab}.js` | p95 < 300 ms, erro < 1 % |
| Agent (C++) | `cd agent && cmake --preset linux-debug && ctest --preset linux-debug` | exit 0 (CI) |
| Everything | `.github/workflows/ci.yml` (push/PR) | all of the above |

## Prerequisites

- **Node 24 + pnpm 12** — `corepack enable` then `pnpm install --frozen-lockfile`
  inside `frontend/`.
- **Python 3.14** — `cd backend && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt`.
- **Playwright browsers** — `cd frontend && pnpm exec playwright install --with-deps chromium`.
- **CMake ≥ 3.20 + Ninja** — only for the C++ agent; the repo does not ship
  these binaries, so the agent layer runs in CI (`agent.yml`) on most
  developer machines.

---

## 1. Frontend unit tests (Vitest)

```bash
cd frontend
pnpm test              # fast run (15 files / 109 tests)
pnpm test:watch        # watch mode
pnpm test:coverage     # v8 coverage + thresholds
pnpm exec vitest run tests/unit/api-fetch.test.ts   # single file
```

Config lives in `frontend/vitest.config.ts` (jsdom, `@testing-library/react`,
setup in `frontend/vitest.setup.ts`).

### Coverage scope and gate

Coverage is measured over the **logic layer** only:

```
src/i18n/**, src/lib/**, src/services/**, src/hooks/**, src/components/contact/**
```

Current numbers: **88.0 % statements/lines, 86.1 % branches, 79.8 % functions**,
with all four thresholds set to `70` in `vitest.config.ts`.

Rationale: page and visual components (status view, lab dashboards, MDX
renderers, legacy pages) are exercised by the E2E suite, where the assertion is
behaviour + accessibility in a real browser — running them under jsdom would
mostly assert mock plumbing. Faking coverage by stubbing them would produce a
green number that says nothing, so the gate is scoped to the code whose
branches actually matter (content loaders, i18n negotiation, API client,
hooks, contact form). Widening `include` is a deliberate decision: change it in
`vitest.config.ts` together with the tests that justify it.

Reports: `frontend/coverage/` (text + HTML + JSON summary).

---

## 2. Frontend E2E and accessibility (Playwright)

```bash
cd frontend
pnpm test:e2e                                     # both projects
pnpm exec playwright test tests/e2e/navigation.spec.ts --project=chromium
pnpm exec playwright test tests/a11y --reporter=list
pnpm exec playwright show-report                  # HTML report after CI runs
```

`playwright.config.ts` details:

- **Projects**: `chromium` (Desktop Chrome) and `mobile-chromium` (Pixel 5) —
  every spec runs twice, so desktop and mobile navigation are both covered.
- **webServer**: Playwright boots `pnpm dev` on `http://localhost:3000`
  (`reuseExistingServer` locally, fresh server in CI).
- **Retries**: `2` in CI, `0` locally; `trace: on-first-retry`,
  `screenshot: only-on-failure`.
- **Workers**: 2 in CI / 4 locally — the dev server compiles routes on
  demand, and more workers make the first navigation exceed the 60 s timeout.
- **Browser**: Chromium when installed, Edge (`channel: 'msedge'`) otherwise;
  `PLAYWRIGHT_CHANNEL` overrides.

### Hydration helper (why links are not clicked blindly)

`frontend/tests/e2e/helpers.ts` exports `gotoStable`, `goBackStable`,
`clickNav`, `switchLocale`, `openMenuIfMobile` and `waitForHydration`.

Clicking a `next/link` **before React mounts** aborts the router push in dev:
the RSC request returns 200 but the URL never changes. `gotoStable()` waits for
the hydration marker (`html[data-hydrated="true"]`, rendered by
`src/components/hydration-marker.tsx`) and for `networkidle` before any
interaction. New specs must start navigation with `gotoStable`, never with a
bare `page.goto` followed by a click.

Selector rules that keep specs stable:

- the hamburger button is `header button[aria-controls="mobile-menu"]` — its
  `aria-label` is localized, so matching on `"Abrir menu"` breaks in English;
- description assertions need `{ exact: true }` when a toast title is a prefix;
- prefer roles/labels over CSS; scope lookups with `page.getByRole` instead of
  `aside`/`div` containers.

### Accessibility policy

`tests/a11y/a11y.spec.ts` runs axe-core (`wcag2a, wcag2aa, wcag21a, wcag21aa`)
on **12 routes × 2 projects = 24 checks** and fails on any violation with
`impact` of `serious` or `critical`. Moderate/minor findings are allowed and
should be triaged in the backlog, not silently ignored.

---

## 3. Backend (pytest)

```bash
cd backend
.venv/Scripts/python -m pytest                        # full suite + coverage gate
.venv/Scripts/python -m pytest tests/security         # security layer only
.venv/Scripts/python -m pytest -m "not live"          # skip external services
.venv/Scripts/python -m pytest tests/integration/test_auth_admin.py -k superuser
.venv/Scripts/python -m pytest --cov-report=html      # open htmlcov/index.html
```

- `pytest.ini` sets `--cov=app --cov-fail-under=85`, `asyncio_mode = auto` and
  `--strict-markers`.
- Markers: `live` (needs `TEST_DATABASE_URL`/`TEST_REDIS_URL`), `slow`.
- Tests are split into `tests/unit`, `tests/integration`, `tests/contract`
  (Schemathesis against the OpenAPI schema), `tests/security`.
- Fixtures/factories: `tests/conftest.py` (fresh DB + fakeredis per test,
  `client`, `admin_user`, `auth_headers`) and `tests/factories/`
  (`create_admin_user`, `contact_payload`, `auth_headers`, `create_lab_session`).
- Data rules: fixtures use `example.com` and RFC 5737 documentation IPs only.

Current: **326 passed, 91.4 % coverage** (gate 85 %).

---

## 4. Detection rules: validation and hit-rate

```bash
python scripts/development/validate_rules.py            # validate + hit-rate
python scripts/development/validate_rules.py -v         # per-fixture verdicts
python scripts/development/validate_rules.py --check-docs  # fail if matrix stale
python scripts/development/validate_rules.py --write-docs  # regenerate matrix
```

The script reuses the lab's own loaders (so syntax/ReDoS checks are the code
the engine really runs), enforces the library contract (20 Sigma + 5 YARA + 3
correlation patterns, UUID/`lab_id` parity, ATT&CK tags inside the engine
catalog) and replays every fixture through normalise → Sigma → YARA.

Current: **hit-rate 50/50 = 100 %**; anything lower fails CI. Per-fixture
detail and the ATT&CK matrix live in
[`docs/security/attack-coverage.md`](security/attack-coverage.md).

---

## 5. Agent (C++20)

```bash
cd agent
cmake --preset linux-debug && cmake --build --preset linux-debug -j && ctest --preset linux-debug
```

Suites: `test_signer`, `test_crypto`, `test_http`, `test_config`,
`test_batcher`, `test_backoff`, `test_delivery_queue`, `test_report`,
`test_gzip`, `test_platform_smoke`. CI (`.github/workflows/agent.yml`) runs
GCC + ASan/UBSan + MSVC/vcpkg.

---

## 6. Security coverage matrix

| Threat | Where it is tested | Asserts |
|---|---|---|
| Rate limit (429) | `backend/tests/security/test_rate_limit.py` | sliding-window limiter blocks at the limit, per-identity budget, concurrency, fail-open/fail-closed, `RateLimitError` → 429 `RATE_LIMIT` + `Retry-After`; `backend/tests/integration/test_contact_api.py` → HTTP 429 for IP (10/min) and email (5/h) |
| SQL injection | `backend/tests/security/test_sql_safety.py` | parameterised queries only, source-tree guard rejecting f-string SQL in `app/`, ORDER BY allowlist (`UnsafeSortError`), validation before DB |
| Injection robustness | `backend/tests/security/test_properties.py` | Hypothesis: `POST /contact` never returns 500 (only 202/422/429) |
| Invalid JWT | `backend/tests/security/test_auth_rbac.py` | expired, wrong key, corrupted signature, `alg: none`, non-numeric `sub`, garbage token → **401** `UNAUTHORIZED` `problem+json` + `WWW-Authenticate`; unit-level `decode_token` returns `None` |
| RBAC | `backend/tests/security/test_auth_rbac.py` | authenticated non-superuser → **403** `FORBIDDEN` on every admin route; missing token stays 401 (never 403); inactive user → 401; superuser keeps access |
| Login abuse | `backend/tests/integration/test_auth_admin.py` | wrong password/unknown user 401, disabled account 403, payload validation 422 |
| Signature replay | `agent/tests/test_signer.cpp` (CI, `agent.yml`) | HMAC-SHA256 over `timestamp.body`, 64-hex signature, anti-replay window rejects expired **and** future timestamps, body tampering, forged hex, non-numeric/negative timestamps, constant-time compare (`agent/README.md`) |

> The backend currently exposes **no** HMAC-authenticated ingestion route —
> `settings.agent_hmac_secret` is reserved configuration — so replay protection
> is owned by the agent's `Signer::verify`. If an ingest endpoint is added, a
> matching server-side replay test must land in the same PR.

---

## 7. Load tests (k6)

```bash
# backend rodando localmente (docker compose up ou uvicorn main:app)
k6 run scripts/development/load/contact.js                      # POST /contact
k6 run scripts/development/load/lab.js                          # leituras + sessões do lab
k6 run -e BASE_URL=https://api.exemplo.com scripts/development/load/lab.js
k6 run -e TARGET_RATE=5 -e DURATION=1m scripts/development/load/lab.js   # smoke
```

| Script | Cenário | Envelope |
|---|---|---|
| `contact.js` | `contact_steady`, 0,15 req/s por 2 min | p95 < 300 ms, erro < 1 %, todos os acessos são 202 |
| `lab.js` | `lab_reads` (ramping até 20 req/s) + `lab_session` (0,05 req/s) | p95 < 300 ms por endpoint, erro < 1 % |

Both scripts carry the shared thresholds from `load/lib.js`
(`http_req_duration p(95) < 300 ms`, `http_req_failed < 1 %`) plus a `checks`
gate so a single 422/429/5xx fails the run.

Rate limits are part of the contract, not noise: `POST /contact` allows
10/min per IP and 5/h per e-mail (each iteration generates a unique
`@example.com` address), `POST /lab/sessions` allows 10/600 s per IP. The
arrival rates are deliberately chosen to stay inside those budgets — a 429 in
the report means the test itself left the agreed envelope.

k6 is **not** a CI gate (it needs a running stack and is environment
sensitive); run it on demand before releases and paste the thresholds output
into the PR. The scripts are syntax-checked with `node --check`.

---

## 8. CI

`.github/workflows/ci.yml` runs on push to `main`, on every PR and on manual
dispatch:

1. **frontend** — `pnpm lint`, `pnpm type-check`, `pnpm check:i18n`,
   `pnpm test:coverage` (≥ 70 %), Playwright install, `pnpm test:e2e`;
   the Playwright HTML report and traces are uploaded as artifacts when the
   job fails.
2. **backend** — `pytest` (≥ 85 %) and `validate_rules.py` (hit-rate 100 %).

Both jobs append a summary block to the PR (coverage table, pytest totals,
hit-rate) via `$GITHUB_STEP_SUMMARY`. `.github/workflows/agent.yml` covers the
C++ layer with path filtering.

---

## 9. Flake and quarantine policy

A test is **flaky** when it passes on re-run without any code change.

1. **Local triage** — reproduce 10× with
   `pnpm exec playwright test <spec> --repeat-each=10 --workers=2`.
   Network/navigation races must be fixed with the helpers in
   `tests/e2e/helpers.ts` (`gotoStable`, `waitForHydration`), never with
   `page.waitForTimeout`.
2. **Retries are a signal, not a fix** — CI allows 2 retries with
   `trace: on-first-retry`. A test that only passes on a retry must be fixed
   within the same week; read the trace from the uploaded artifact.
3. **Quarantine** — a spec may be temporarily `test.skip`ped only with a
   comment `// QUARANTINE: <reason> — <issue link>` and an owner. Maximum
   lifetime: **7 days**; after that the flaky test is either fixed or the
   behaviour it covers is rewritten as a unit test.
4. **Never weaken assertions** to make a run green, and never delete an
   a11y/404/security test instead of fixing the product.
5. **Rerun policy** — a red run is re-run locally once to separate product
   regressions from environment noise (busy port 3000, stale `.next` cache,
   missing browser). Persistent failures are real and block the PR.

---

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| `page.click` on a link does nothing / URL never changes | spec clicked before hydration — use `gotoStable` from `tests/e2e/helpers.ts` |
| `strict mode violation` in a toast assertion | add `{ exact: true }` or scope with `page.getByRole` |
| Playwright cannot find the hamburger | use `header button[aria-controls="mobile-menu"]` (localized `aria-label`) |
| Port 3000 already in use | stop the dev server (`Ctrl+C` / kill the `next dev` process) or let Playwright reuse it (it does locally) |
| `Cannot read properties of undefined (reading 'matches')` under `--coverage` | `window.matchMedia` must stay a plain function in `vitest.setup.ts` — `vi.clearAllMocks()` resets `vi.fn()` mocks |
| `Select-String`/`Get-Content` silently returns nothing | PowerShell treats `[]` as a wildcard — use `-LiteralPath` or the grep tool |
| Coverage threshold fails after adding an untested `src/**` file | add it to `tests/unit/` or exclude it from `vitest.config.ts` **with a reason** |
| Backend coverage gate fails on a partial run | `pytest.ini` applies `--cov-fail-under=85` to every run; use `-o addopts="-q --strict-markers"` when iterating on a single file |
