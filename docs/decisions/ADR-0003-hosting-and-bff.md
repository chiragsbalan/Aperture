# ADR-0003 — Early hosting (Vercel + Render Free + Supabase Free) and BFF

- **Status:** Accepted
- **Date:** 2026-08-01
- **Supersedes:** Informal PLAN defaults that assumed paid always-on Render for both API and Postgres with managed backups from P0; hosting sketches in Technical Architecture (Part 3) PDF that describe Vercel FE + generic “container + managed Postgres” without naming Supabase

## Context

Aperture needs a public URL from P0 while keeping early development cost at **$0**. Paid Render (always-on API + managed Postgres with backups) meets the original production bar but adds roughly ~$13/month. Free Render API sleep (~15 minutes idle, ~1 minute wake) is acceptable for the early public skeleton. Supabase Free provides hosted PostgreSQL without the 30-day expiry of Render Free Postgres.

Browser auth remains same-origin Next.js BFF with `__Host-` cookies (backend cookie-agnostic); that part of the hosting/BFF decision is unchanged.

## Decision

**Early production hosting (from P0.6 until explicitly upgraded):**

| Layer | Provider | Tier / notes |
|---|---|---|
| Frontend + BFF | **Vercel** | Hobby/free acceptable; preview deploys per PR |
| FastAPI API | **Render** web service | **Free** instance; cold start after idle is accepted |
| PostgreSQL | **Supabase** | **Free** project; use as **Postgres only** (connection string + SSL/pooler). Do **not** adopt Supabase Auth, Realtime, or client `service_role` usage for Aperture product auth |

**Local development** remains Docker Compose: FE + BE + Postgres + Redis (from P2.4; see ADR-0006). Compose is the day-to-day source of truth; cloud is for the public URL.

**Auth/BFF transport:** same-origin Next.js BFF; cookies `__Host-ap_at` / `__Host-ap_rt`; FastAPI cookie-agnostic. Token lifetimes, hashing, and OAuth link rules are in [ADR-0005](ADR-0005-auth.md).

**Migrations:** run against Supabase (`DATABASE_URL`; prefer pooler/session settings documented in `.env.example`). Account for Free API sleep and possible Free project pause when automating migrate-on-deploy.

**Supabase TLS (asyncpg):** remote hosts enable TLS with Postgres **`sslmode=require` semantics** — encrypt, do not verify the CA chain (`app/core/db_ssl.py`). Full verify (`ssl=True` / verify-full) fails against the Supabase pooler chain (`CERTIFICATE_VERIFY_FAILED: self-signed certificate in certificate chain`) and breaks Render migrate-on-start. Prefer the **session pooler** URI (port **5432**), not the transaction pooler (6543), for Alembic DDL. Do not rely on `?ssl=require` query params with `postgresql+asyncpg`.

## Alternatives considered

1. **Paid Render API + Paid Render Postgres** — always-on + managed backups; rejected for early phases to keep cost at $0.
2. **Render Free API + Render Free Postgres** — DB expires ~30 days and has no backups; Supabase Free preferred for durable-enough free DB.
3. **EC2 + local/laptop Postgres** — higher ops burden; laptop DB unsuitable for public URL.
4. **Cloudflare Pages instead of Vercel** — viable FE alternative later; not chosen for P0 (Vercel stays default for Next.js).
5. **Supabase Auth instead of custom BFF auth** — rejected; conflicts with locked auth/BFF design (P1).

## Consequences

- Public app may incur **~1 minute** API cold start after ~15 minutes idle.
- Supabase Free may **pause** after ~1 week of low database activity; restore from dashboard (optional keep-alive ping later).
- **No managed DB backups** on free tier — accepted risk until a paid DB upgrade; prefer careful migrations and optional manual `pg_dump`.
- Cross-cloud latency (Render ↔ Supabase) is acceptable for early traffic.
- Architecture PDFs that say “managed Postgres” without naming Supabase remain conceptually valid; **this ADR is authoritative for provider choice** until superseded.
- Upgrade path: paid Supabase or Render Postgres (backups / no pause) first when real user data matters; always-on Render API when cold starts become unacceptable; AWS/Terraform remains P12.

## Future evolution

- `.env.example` documents Supabase session-pooler `DATABASE_URL` shape and Vercel `API_URL` (P0.6).
- Render migrate-on-deploy uses the same `DATABASE_URL` (session pooler) via `backend/docker/start.sh`; API Settings also require `JWT_SECRET` (and production `AUTH_BFF_SHARED_SECRET` once Google/BFF IP trust is enabled — see [ADR-0005](ADR-0005-auth.md)).
- When upgrading off free tiers, supersede this ADR (or add ADR-0003a) with the new provider mix.
- Redis intro timing and search staging are in [ADR-0006](ADR-0006-redis-search-staging.md); Redis cloud provider/tier chosen at P2.4 implementation.
- Optional later: pin Supabase CA and move to verify-full if the pooler chain becomes reliably verifiable in the API image.
