# Blue-Sentinel

Personal cybersecurity portfolio showcasing Blue Team / Detection Engineering expertise.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │     │    Backend      │     │   Data Layer    │
│   (Next.js)     │────▶│   (FastAPI)     │────▶│  (PostgreSQL    │
│   Static/ISR    │     │   REST + WS     │     │   + Redis)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, MDX content, GSAP animations
- **Backend**: FastAPI, Pydantic, SQLAlchemy 2.0, asyncpg
- **Database**: PostgreSQL 16 (contact messages, lab sessions, audit)
- **Cache/Queue**: Redis 7 (rate limiting, GitHub stats cache, pub/sub, email queue)
- **Worker**: Python background jobs (email sending, cleanup)
- **Agent Showcase**: C++20 read-only telemetry agent — [agent/README.md](agent/README.md)

  [![agent](https://github.com/pedro12345lisboa-sudo/blue-sentinel-security/actions/workflows/agent.yml/badge.svg)](https://github.com/pedro12345lisboa-sudo/blue-sentinel-security/actions/workflows/agent.yml)

## Quick Start

```bash
# Clone and configure
git clone <repo>
cd blue-sentinel
cp .env.example .env  # Edit with your values

# Start all services
docker compose up --build

# Frontend: http://localhost:3000
# Backend API: http://localhost:8000/api/v1/docs
# Health: http://localhost:8000/api/v1/health/ready
```

## Project Structure

```
blue-sentinel/
├── frontend/           # Next.js application
│   ├── src/
│   │   ├── app/        # App Router pages (/, /about, /projects, /lab, /writeups, /status, /contact, /resume, /security)
│   │   ├── components/ # React components (ui/, sections/, cards/, motion/, three/, common/)
│   │   ├── layouts/    # SiteLayout (header, footer)
│   │   ├── hooks/      # useReducedMotion, useInView, useScrollProgress, useCounter, useGSAP
│   │   ├── services/   # Typed API client (SWR + fetch)
│   │   ├── types/      # TypeScript types
│   │   └── styles/     # CSS tokens, globals
│   ├── content/        # MDX content (projects/, writeups/)
│   ├── public/         # Static assets
│   ├── e2e/            # Playwright tests
│   └── vitest.config.ts
├── agent/              # C++20 telemetry agent (CMake, GoogleTest, CI)
│   ├── include/sentinel/
│   ├── src/core/
│   ├── src/platform/{linux,windows}/
│   ├── tests/
│   └── README.md
├── backend/            # FastAPI application
│   ├── app/
│   │   ├── api/v1/     # API routes (health, contact, lab, github, status)
│   │   ├── core/       # Config, logging
│   │   ├── database/   # SQLAlchemy models, session
│   │   ├── detection/  # Detection engine (Sigma-like)
│   │   ├── workers/    # Background jobs
│   │   └── ...
│   └── requirements.txt
├── docs/
│   ├── architecture/   # ADRs, overview diagrams (Mermaid)
│   └── security/       # Detection catalog & severity model (lab rules)
├── docker-compose.yml
├── docker-compose.override.yml.example
└── .env.example
```

## Features

### Frontend (Portfolio Website)
- **Static-First**: All core pages pre-rendered (SSG/ISR), works without backend
- **SOC Visual Identity**: Dark theme, cyan/blue/green accent colors, grid patterns, glow effects
- **GSAP Animations**: Scroll-triggered reveals, counter animations, text reveals (respects `prefers-reduced-motion`)
- **MDX Content**: Projects and writeups as `.mdx` files with frontmatter, custom components
- **Interactive Lab** (`/lab`): Real-time WebSocket synthetic events + Sigma/YARA/correlation detection with auto-incident timeline
- **System Status** (`/status`): Live metrics (CPU, RAM, disk, network, DB/Redis latency) with Recharts
- **Contact Form**: Zod validation, react-hook-form, rate-limited, async email via worker
- **Accessibility**: WCAG AA, semantic HTML, keyboard navigation, skip links, focus management
- **Responsive**: 360px to 1920px, mobile drawer navigation

### Backend (API)
- **Health Checks**: `/health/live` (liveness) + `/health/ready` (DB + Redis readiness)
- **Contact Form**: Validation, rate limiting, honeypot, async email worker
- **Detection Lab**: WebSocket server, synthetic event generator, Sigma rule engine
- **GitHub Stats**: Cached repository metrics (stars, commits, languages)
- **System Status**: Real-time metrics via psutil

## Detection Rules (Sigma / YARA)

Defensive-only rule library evaluated by the `/lab` engine. Every rule
matches **synthetic** logs; the repository ships no malware, no exploit and
no live payload.

- **20 Sigma rules** in `rules/sigma/{windows,linux,web,cloud}` (kebab-case,
  one file per rule, UUID + ATT&CK tags + explicit false positives)
- **5 YARA rules** in `rules/yara` (text patterns over event fields)
- **3 correlation patterns** in `rules/patterns` (N events in T seconds)
- **50 fixtures** in `backend/tests/fixtures/detection/{positive,negative}`
  (one positive + one negative per rule)

| Doc | What it answers |
|---|---|
| [Detection catalog](docs/security/detection-catalog.md) | What each rule detects, its log source, severity and likely false positive |
| [ATT&CK coverage](docs/security/attack-coverage.md) | Generated tactic × technique matrix **and the known gaps** |
| [Tuning guide](docs/security/tuning-guide.md) | How to cut false positives without disabling detections |
| [Severity model](docs/security/severity.md) | Alert → incident escalation rules |

Validate the whole library (schema, unique UUIDs, ATT&CK tags, fixtures and
fixture hit-rate) — CI runs exactly this:

```bash
python scripts/development/validate_rules.py     # hit-rate: 50/50 (100%)
python scripts/development/validate_rules.py -v  # per-fixture verdicts
```

## Development

```bash
# Frontend
cd frontend && pnpm install && pnpm dev

# Frontend tests
pnpm test           # Vitest unit tests
pnpm test:ui        # Vitest UI
pnpm test:coverage  # Coverage report
pnpm e2e            # Playwright e2e tests
pnpm e2e:ui         # Playwright UI
pnpm lint           # ESLint
pnpm type-check     # TypeScript check

# Backend
cd backend && pip install -r requirements.txt && uvicorn main:app --reload

# Backend tests
pytest -v

# Docker development
docker compose -f docker-compose.yml -f docker-compose.override.yml up
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Hero (3D slot), positioning, skills, featured projects, lab teaser, counters, CTA |
| `/about` | Story, focus areas, experience timeline, certifications, philosophy |
| `/projects` | Filterable project list with tags, featured projects highlighted |
| `/projects/[slug]` | Case study: problem, architecture, decisions, challenges, results, links |
| `/writeups` | Technical articles list with reading time, tags, series |
| `/writeups/[slug]` | Full article with TOC, code blocks, copy buttons, share |
| `/lab` | Real-time WebSocket synthetic events, detection rules panel, stats |
| `/status` | Live system metrics (CPU, RAM, disk, network, DB/Redis latency, API health) |
| `/security` | Threat model, security measures, compliance mapping, responsible disclosure |
| `/contact` | Validated form, rate-limited, async email, honeypot |
| `/resume` | Professional CV with download PDF, experience, education, skills, projects |

## Security

- Separate Docker networks (`frontend-net` public, `backend-net` internal)
- PostgreSQL & Redis never exposed externally
- Containers run as non-root users (UID 1000/1001)
- Secrets via environment variables / Docker secrets only
- Rate limiting on all public endpoints
- Structured JSON logging
- CSP-compatible Next.js headers
- No `dangerouslySetInnerHTML` with external data

## Content Management

Adding a new project:
```bash
# Create MDX file
cat > frontend/content/projects/my-project.mdx << 'EOF'
---
title: 'My Project'
description: 'Short description'
date: '2024-01-15'
tags: ['Tag1', 'Tag2']
highlight: true
icon: 'Shield'
links:
  github: 'https://github.com/...'
  demo: '/lab'
---

# My Project

Content here...
EOF
```

Adding a new writeup:
```bash
cat > frontend/content/writeups/my-article.mdx << 'EOF'
---
title: 'My Article'
description: 'Article summary'
date: '2024-01-15'
tags: ['Security', 'Tutorial']
readingTime: 10
series: 'Series Name'
---

# My Article

Content with custom components...
EOF
```

## License

MIT