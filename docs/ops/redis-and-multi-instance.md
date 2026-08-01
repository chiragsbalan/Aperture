# Redis and multi-instance readiness (P2.4)

## Provider

- **Local:** Docker Compose service `redis` (`redis:7-alpine`), URL `redis://redis:6379/0`.
- **Production:** [Upstash](https://upstash.com) Redis free tier. Set Render env `REDIS_URL` to the **TCP** URL (`rediss://…`), not the REST URL/token.

## Usage matrix

| Concern | Backend | Notes |
|---|---|---|
| Hot metadata detail JSON | Redis `CacheBackend` (`meta:movie\|tv\|person:{id}`, TTL default 600s) | Miss → Postgres |
| Search IP rate limits | Redis atomic `incr` (`search:rl:ip:{sha256(subject)}`) | Subject is the trusted client IP, or `unknown` when IP is missing/empty after strip. On Redis `incr` failure → process-local counter (not open) |
| Auth login/register/refresh rate limits | **Postgres** (P1) | Shared Redis auth RL deferred to **P11** (ADR-0005 / ADR-0006) |
| Auth refresh-grace L1 | **Process memory only** | Durable grace in Postgres; never store tokens in Redis |

**Not stored in Redis:** access/refresh tokens, grace L1 payloads, identity blobs, or other auth secrets.

Postgres remains authoritative. Cache misses and Redis errors must not 500 the site — metadata reads fall back to Postgres.

## Multi-instance checklist

- JWT access tokens are stateless — no sticky sessions required.
- Refresh sessions and reuse-grace durable state remain in Postgres.
- With `REDIS_URL` set, metadata cache and **search** rate-limit state are shared across API instances.
- Auth rate limits remain DB-backed until P11 (correct under multi-instance; higher DB write load).
- Refresh-grace L1 is per process; concurrent reuse across instances relies on durable Postgres grace payloads.
- Render Free may still run a single instance for cost; Redis keeps metadata/search ready to scale.

## Degrade

| Condition | Behavior |
|---|---|
| `REDIS_URL` empty | In-memory `CacheBackend` for metadata + search RL (per process) |
| Redis get/set/delete error | Treat as miss / no-op; serve from Postgres |
| Redis `incr` error (search RL) | Fall back to process-local `incr` (limits still enforced per instance) |
| Redis down entirely | Same as above; auth RL unchanged (Postgres) |
| Redis flap / multi-instance local fallback | Each instance may apply its own local counter while Redis is unavailable, so the **effective** limit can inflate to roughly **N×** the configured max across N instances. Accepted until P11 auth/search RL hardening. |
