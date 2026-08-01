# Aperture Documentation

## Purpose

This directory contains all engineering, architecture, and design documentation for Aperture.

These documents evolve alongside the implementation and are the authoritative source for architectural intent, engineering standards, and product direction.

## Reading Order

1. Aperture PRD
2. Aperture Development Roadmap
3. [PLAN.md](../PLAN.md) (shipping slices + locked stack, including hosting)
4. Architecture Decision Records under `decisions/` (override PDFs when they conflict)
5. Architecture Documents
6. Design Documents
7. Engineering Documents

Architecture Decision Records (ADRs) and the Design System evolve during development.

## Conflicts and authority

- **Phase order:** Development Roadmap + [PLAN.md](../PLAN.md) (see [ADR-0001](decisions/ADR-0001-phase-authority.md)).
- **ORM / schema foundation:** [ADR-0002](decisions/ADR-0002-orm-schema.md) — naming convention, UUIDv7, mixins, Alembic async.
- **Early cloud hosting:** [ADR-0003](decisions/ADR-0003-hosting-and-bff.md) — **Vercel** (FE/BFF) + **Render Free** (FastAPI) + **Supabase Free** (Postgres only). This supersedes PDF passages that assume paid always-on Render for API+Postgres or unnamed “managed Postgres” without Supabase.
- **Content identity:** [ADR-0004](decisions/ADR-0004-content-identity.md) — canonical `content_items` + `external_ids` uniqueness; not raw provider ids as FKs.
- **Auth / sessions:** [ADR-0005](decisions/ADR-0005-auth.md) — BFF `__Host-` cookies, 15m JWT, opaque refresh + 10s reuse grace, Argon2id, login via email **or** username, no OAuth auto-link.
- **Redis / search staging:** [ADR-0006](decisions/ADR-0006-redis-search-staging.md) — Redis intro at P2 (Roadmap P11 = harden); PG FTS then OpenSearch+FTS fallback; OpenSearch host is ADR-0007 at P5 exit.
- **Personal library:** [ADR-0008](decisions/ADR-0008-personal-library-lists.md) — system + custom lists, dense reorder, visibility AuthZ, diary/`watch_entries` in `app/library/`; public content refs `movie`/`tv` (alias `tv_show`).
- Architecture/engineering **PDFs** are not rewritten for every decision tweak; ADRs + PLAN carry the current decision until PDFs are revised.

## Structure

```text
docs/
├── Aperture PRD.pdf
├── Aperture Development Roadmap.pdf
├── README.md
├── architecture/
├── design/
├── engineering/
├── decisions/
├── design-system-future/
└── assets/   (optional)
```

## Folder Responsibilities

### Root Documents
**Aperture PRD** — Defines the product vision, goals, audience, branding, and feature overview.

**Development Roadmap** — Defines implementation phases, milestones, and feature rollout.

### architecture
Owns the high-level architecture:
- System Architecture
- Technical Architecture
- Backend Architecture
- Frontend Architecture

### design
Owns the engineering blueprint:
- Domain Model
- Low-Level Design
- Database Design
- API Specification

### engineering
Owns engineering workflows:
- Implementation Playbook
- Testing Strategy
- CI/CD & DevOps Guide

### decisions
Stores Architecture Decision Records explaining **why** important technical decisions were made. **ADRs win over older PDF text** on the same decision.

### design-system-future
Placeholder for Aperture's visual language after UI patterns stabilize (see folder README).

### assets
Stores reusable diagrams, screenshots, branding assets, and other documentation resources.

## Documentation Principles

- Every document has one responsibility.
- Avoid duplicate information.
- Architecture explains structure.
- Design explains implementation concepts.
- Engineering explains development and operations.
- ADRs explain *why* decisions were made.
- Design System explains visual consistency.

## AI Agent Instructions

1. Read the PRD, [PLAN.md](../PLAN.md), and [CONTRIBUTING.md](../CONTRIBUTING.md) before implementing features.
2. Use the Development Roadmap + PLAN to determine the current phase/slice; create `feature/<slice-id>-<slug>` from `main` (see CONTRIBUTING).
3. Check `decisions/` for ADRs that supersede PDF details (hosting **ADR-0003**, content **ADR-0004**, auth **ADR-0005**, Redis/search **ADR-0006**).
4. Update the appropriate architecture/design document when structural changes occur; for provider/hosting/auth/search staging changes, prefer a new or updated ADR over editing PDFs.
5. Create ADRs only after significant engineering decisions (next planned: **ADR-0007** OpenSearch host at P5 exit).
6. Update the Design System only when reusable UI patterns have stabilized.
7. If documentation conflicts with implementation, treat the implementation as the source of truth, update PLAN/ADRs (and docs as needed), and create an ADR if the architectural decision has changed.
