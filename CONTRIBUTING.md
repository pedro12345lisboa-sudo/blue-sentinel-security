# Contributing to Blue-Sentinel

Thanks for your interest in improving the project. This is a personal portfolio, but
contributions — bug reports, detection rules, docs and code — are welcome and reviewed like
production code.

## Ground rules

- **Defensive only.** No malware, exploits, attack tooling or live payloads. Detection content
  must match **synthetic** logs (RFC 5737 IPs, fictional hosts). See [README — Ethical use](README.md#ethical-use).
- **No real personal data or secrets.** Placeholders (`[SEU NOME]`…) and `NEXT_PUBLIC_*` env
  vars only. `.env` is git-ignored; never commit values.
- Security issues go to [SECURITY.md](SECURITY.md), not to public issues.

## Development environment

```bash
# Frontend (Node 20+, pnpm)
cd frontend && pnpm install && pnpm dev          # http://localhost:3000

# Backend (Python 3.12+, venv)
cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload              # http://localhost:8000/api/v1/docs

# Everything (Postgres + Redis + services)
cp .env.example .env && docker compose up --build

# C++ agent
cd agent && cmake --preset debug && cmake --build --preset debug && ctest --test-dir build/debug
```

Full test strategy: [docs/testing.md](docs/testing.md).

## Workflow

1. Fork and create a branch: `git checkout -b feat/lab-event-filters`
2. Make the change **with tests** (see below)
3. Run the checks locally (table)
4. Open a PR with a clear description: *what*, *why*, *how verified*
5. CI must be green; a review will check i18n parity and docs impact

### Checks that must pass

| Area | Command |
|---|---|
| Frontend lint / types | `cd frontend && pnpm lint && pnpm type-check` |
| Frontend unit tests | `cd frontend && pnpm test` |
| Frontend e2e (when UI changes) | `cd frontend && pnpm e2e` |
| i18n parity (both languages) | `cd frontend && pnpm check:i18n` |
| Backend tests | `cd backend && pytest -v` |
| Detection rules | `python scripts/development/validate_rules.py` |
| Agent tests (when C++ changes) | `cd agent && ctest --test-dir build/debug --output-on-failure` |

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), lowercase, imperative:

```
feat(lab): filtra eventos por severidade no timeline
fix(backend): fail-closed no rate limit quando o Redis cai
docs(security): corrige matriz ATT&CK do endpoint agent
test(frontend): cobre o builder do feed RSS
```

Scope examples: `frontend`, `backend`, `agent`, `lab`, `security`, `docs`, `ci`, `seo`, `perf`.

## Pull request checklist

- [ ] Tests added or updated, and all local checks above pass
- [ ] New UI strings added to **both** `frontend/messages/pt-BR.json` and `en.json`
      (`pnpm check:i18n` enforces parity)
- [ ] New pages/routes have metadata (title ≤ 60, description ≤ 160, canonical) and appear in
      `frontend/src/app/sitemap.ts`
- [ ] Detection rules follow the catalog format: UUID, ATT&CK tags, false positives, one
      positive **and** one negative fixture (`docs/security/detection-catalog.md`)
- [ ] Docs updated when behavior changes (`docs/`, `README.md`, `SECURITY.md`)
- [ ] No personal data, secrets, or generated junk (`.pyc`, coverage output) in the diff

## Detection rule contributions

Add rules to `rules/sigma/...` or `rules/yara/...` following
[docs/security/detection-catalog.md](docs/security/detection-catalog.md), with fixtures in
`backend/tests/fixtures/detection/{positive,negative}/`. `validate_rules.py` (and CI) rejects
rules with missing UUIDs, ATT&CK tags, fixtures or duplicate hit-rates.

## Code style

- **TypeScript/React**: existing patterns, `cn()` for classes, server components by default,
  client components only when state/browser APIs are required; a11y (labels, alt text,
  keyboard) is mandatory
- **Python**: type hints, Pydantic for boundaries, structured logging (`extra={...}`), no
  secrets in logs
- **C++20**: RAII, no exceptions across the agent boundary, GoogleTest for every new module
- **Docs**: GitHub-flavored markdown, Mermaid diagrams must render on GitHub, EN for technical
  docs unless the file is already PT-BR

## Questions

Open a discussion issue with the `question` label, or use the contact page on the deployed
site. Maintainers answer within a week.
