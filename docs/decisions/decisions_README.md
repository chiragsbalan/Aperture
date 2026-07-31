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
ADR-001-fastapi.md
ADR-002-postgresql.md
ADR-003-rest.md
```

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
