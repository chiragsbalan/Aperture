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
| [ADR-0008](ADR-0008-personal-library-lists.md) | Personal library (system + custom lists, dense reorder, diary / `watch_entries`) |

Reserved / not yet written: **ADR-0007** — OpenSearch hosting (due at P5 exit per PLAN).
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
