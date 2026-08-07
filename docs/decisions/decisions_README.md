# Architecture Decision Records (ADRs)

## Purpose

This directory preserves important engineering decisions made throughout the development of Aperture.

Unlike architecture documents, which describe *how* the system is built, ADRs explain *why* significant technical decisions were made.

## When to Create an ADR

Create an ADR when:

- Multiple valid solutions exist.
- The decision has long-term architectural impact.
- Future contributors would benefit from understanding the reasoning.

Examples:

- FastAPI over Django
- PostgreSQL over MongoDB
- REST over GraphQL
- Modular Monolith over Microservices
- Redis for caching

## Lifecycle

- One ADR documents one decision.
- ADRs are generally immutable.
- If a decision changes, create a new ADR that supersedes the previous one.

## Naming

```text
ADR-0001-phase-authority.md
ADR-0002-orm-schema.md
ADR-0003-hosting-and-bff.md
ADR-0004-content-identity.md
ADR-0005-auth.md
ADR-0006-redis-search-staging.md
ADR-0008-personal-library-lists.md
ADR-0009-public-profiles.md
ADR-0010-guest-landing-home-shell.md
ADR-0011-title-poster-morph.md
ADR-0012-brand-shell-atmosphere.md
ADR-0014-avatar-r2-cdn.md
```

Zero-padded four-digit ids match PLAN.md. Accepted ADRs:

| ADR | Decision |
|---|---|
| [ADR-0001](ADR-0001-phase-authority.md) | Phase authority (Roadmap over Playbook ordering) |
| [ADR-0002](ADR-0002-orm-schema.md) | ORM / schema foundation (UUIDv7, mixins, Alembic) |
| [ADR-0003](ADR-0003-hosting-and-bff.md) | Early hosting (Vercel + Render Free + Supabase Free) and BFF |
| [ADR-0004](ADR-0004-content-identity.md) | Canonical content identity (`content_items` / `external_ids`) |
| [ADR-0005](ADR-0005-auth.md) | Auth / sessions (BFF cookies, JWT, Argon2id, email-or-username login, OAuth link rules) |
| [ADR-0006](ADR-0006-redis-search-staging.md) | Redis at P2; PG FTS → OpenSearch staging |
| [ADR-0008](ADR-0008-personal-library-lists.md) | Personal library (system + custom lists, newest-first order, diary / ratings / contains) |
| [ADR-0009](ADR-0009-public-profiles.md) | Public profiles (always-public shell, pc.2 Watchlist/Lists, counters in API layer) |
| [ADR-0010](ADR-0010-guest-landing-home-shell.md) | Guest landing on `/` + signed-in home shell (in-place auth, session matrix) |
| [ADR-0011](ADR-0011-title-poster-morph.md) | Title poster shared-element morph (`TitleNavPoster` / FLIP) |
| [ADR-0012](ADR-0012-brand-shell-atmosphere.md) | Purple brand + shell atmosphere (guest mosaic excluded) |
| [ADR-0014](ADR-0014-avatar-r2-cdn.md) | Profile avatars via Cloudflare R2 + custom-domain CDN |

Reserved / not yet written: **ADR-0007** — OpenSearch hosting (due at P5 exit per PLAN). **ADR-0013** may be claimed by lean-catalog work on another branch — do not reuse without checking.
## Template

Every ADR should contain:

- Title
- Status
- Date
- Context
- Decision
- Alternatives Considered
- Consequences
- Future Evolution

## AI Agent Instructions

Before creating an ADR, ask:

- Was an important architectural decision made?
- Were alternatives evaluated?
- Will this matter months from now?

If yes, create a new ADR.

If not, update the appropriate design or engineering documentation instead.

Document reality—not plans.
