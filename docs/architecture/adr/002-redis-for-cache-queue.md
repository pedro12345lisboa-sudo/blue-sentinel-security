# ADR 002: Redis for Caching, Rate Limiting, and Pub/Sub

## Status
Accepted

## Context
The backend requires:
- **Rate limiting** on contact form and lab WebSocket connections
- **Caching** GitHub API responses (TTL ~1 hour)
- **Pub/Sub** for real-time lab alerts to WebSocket clients
- **Queue** for background email sending (contact form)

Options considered:
- **Redis** (single instance, in-memory with persistence off)
- **PostgreSQL** (advisory locks, LISTEN/NOTIFY, jsonb)
- **In-memory** (Python dict, `asyncio.Queue`) — not viable for multi-container
- **RabbitMQ** — heavier, separate dependency

## Decision
Use **Redis 7** (Alpine) as the single backing store for cache, rate limiting, pub/sub, and job queue.

## Rationale
| Requirement | Redis Fit | Notes |
|-------------|-----------|-------|
| Rate limiting (sliding window) | Excellent | `INCR` + `EXPIRE` or `redis-cell` module |
| TTL cache (GitHub stats) | Native | `SETEX` / `GET` |
| Pub/Sub (lab alerts) | Native | `PUBLISH`/`SUBSCRIBE`, low latency |
| Job queue (emails) | Good | `LPUSH`/`BRPOP` or Streams (`XADD`/`XREADGROUP`) |
| Multi-container | Required | Shared network, single source of truth |
| Operational simplicity | High | Single binary, minimal config, well-known |

Redis covers all four use cases with one dependency. PostgreSQL LISTEN/NOTIFY lacks TTL and is connection-heavy. RabbitMQ adds operational overhead for a portfolio-scale workload.

## Consequences
### Positive
- Single infrastructure component for multiple concerns
- Sub-millisecond latency for rate limit checks
- Streams provide exactly-once semantics for email queue
- Pub/Sub fan-out to multiple WebSocket connections trivial

### Negative
- Additional moving part (mitigated: health checks, single-container Compose)
- Memory pressure if queue backs up (mitigated: `maxmemory-policy allkeys-lru`, monitoring)
- Not ACID (acceptable: cache/queue/pubsub are best-effort)

## Configuration
```yaml
# docker-compose.yml
redis:
  command: ["redis-server", "--save", "", "--appendonly", "no", "--maxmemory", "256mb", "--maxmemory-policy", "allkeys-lru"]
```
- Persistence disabled (cache/queue data is reconstructible)
- 256 MB limit with LRU eviction protects against OOM
- Runs on internal `backend-net` only; no exposed ports

## Usage Patterns
| Use Case | Key Pattern | TTL / Retention |
|----------|-------------|-----------------|
| Rate limit | `ratelimit:{ip}:{endpoint}` | 60–300s sliding window |
| GitHub cache | `github:stats:{username}` | 3600s |
| Lab pub/sub | `lab:alerts` (channel) | Ephemeral |
| Email queue | `queue:emails` (Stream) | Processed → `XDEL` |

## Related
- ADR 001: Content in MDX
- ADR 003: FastAPI for Backend