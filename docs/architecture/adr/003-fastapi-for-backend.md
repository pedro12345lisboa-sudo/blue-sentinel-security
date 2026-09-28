# ADR 003: FastAPI for Backend API

## Status
Accepted

## Context
The portfolio backend serves:
- Contact form submission (REST, validation, rate limit, async email)
- Interactive detection lab (WebSocket, real-time synthetic events)
- GitHub statistics (cached REST)
- Health/status endpoints (liveness/readiness, system metrics)
- Potential future: agent telemetry ingestion (HMAC auth)

Options considered:
- **FastAPI** (Python, async, Pydantic, OpenAPI)
- **Node.js/Express** or **NestJS** (JS/TS, aligns with frontend)
- **Go/Gin** or **Chi** (performance, single binary)
- **Rust/Axum** (performance, safety, steeper learning curve)

## Decision
Use **FastAPI** (Python 3.12+) with Pydantic v2, SQLAlchemy 2.0 async, and Uvicorn.

## Rationale
| Factor | FastAPI | Node.js/NestJS | Go | Rust |
|--------|---------|----------------|----|------|
| **Async I/O** | Native `async`/`await` | Native | Native (goroutines) | Native |
| **Validation** | Pydantic (best-in-class) | Zod/class-validator | Manual/struct tags | Serde + custom |
| **OpenAPI** | Auto-generated | Decorator-based | Manual/swaggo | Manual/utoipa |
| **Ecosystem (security, ML)** | Excellent (scikit-learn, sigma) | Good | Growing | Emerging |
| **Team familiarity** | High (Python for sec tooling) | High (frontend is TS) | Medium | Low |
| **Detection lab** | Sigma rule engine in Python | Port/rewrite needed | Rewrite needed | Rewrite needed |
| **Hiring signal** | Strong for security roles | Full-stack alignment | Systems signal | Niche signal |

Key differentiator: **Detection engine**. The lab runs Sigma-like rule evaluation. Python has mature Sigma support (`sigma-py`, `sigmatools`). Re-implementing in Go/Node/Rust adds months of work for a portfolio feature.

FastAPI also provides:
- Automatic request/response validation via Pydantic models
- Dependency injection for DB sessions, Redis, auth
- Built-in WebSocket support (`WebSocket` class, `WebSocketDisconnect`)
- OpenAPI docs at `/api/v1/docs` for recruiter visibility

## Consequences
### Positive
- Rapid development for security-focused features
- Single language (Python) for backend + detection engine + C++ agent bindings (pybind11)
- Rich ecosystem for observability (Prometheus client, structlog, OpenTelemetry)
- Recruiters can browse live API docs

### Negative
- Python GIL limits CPU-bound throughput (mitigated: async I/O, worker processes, offload detection to worker)
- Larger container than Go/Rust binary (mitigated: slim base, multi-stage build)
- Not aligned with frontend TypeScript (mitigated: OpenAPI → TypeScript client generation if needed)

## Configuration
```python
# backend/main.py
app = FastAPI(
    title="Blue-Sentinel API",
    version="0.1.0",
    docs_url="/api/v1/docs",
    redoc_url="/api/v1/redoc",
)
```
- `docs_url`/`redoc_url` under versioned prefix
- CORS restricted to `ALLOWED_HOSTS` in production
- Structured JSON logging via `python-json-logger`
- Health checks at `/api/v1/health/live` and `/ready`

## Related
- ADR 001: Content in MDX
- ADR 002: Redis for Cache/Queue