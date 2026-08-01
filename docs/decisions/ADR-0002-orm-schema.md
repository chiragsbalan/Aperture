# ADR-0002 — ORM and schema foundation

- **Status:** Accepted
- **Date:** 2026-08-01
- **Related:** Database Design PDF (naming, UUID PKs, timestamps, soft-delete); PLAN.md P0.4

## Context

Aperture needs stable persistence conventions before domain tables land (P1 identity, P2 metadata). Without a locked base, each feature risks inventing its own PK strategy, constraint names, and migration style—breaking Alembic collaboration and CI.

## Decision

**SQLAlchemy 2.0 declarative models** share one `Base` with a fixed `MetaData(naming_convention=…)` so indexes and constraints get deterministic names (`pk_`, `ix_`, `uq_`, `ck_`, `fk_`).

**Primary keys are UUIDv7**, generated in the application via `uuid-utils` (exposed as stdlib `uuid.UUID`). Not PostgreSQL `gen_random_uuid()` (v4). Rationale: time-ordered ids improve index locality vs random UUIDs while remaining globally unique and non-enumerable like sequences.

**Column mixins:**

| Mixin | Columns | Usage |
|---|---|---|
| `UuidPrimaryKeyMixin` | `id` | Default for new entities |
| `TimestampMixin` | `created_at`, `updated_at` (timestamptz) | Mutable entities |
| `SoftDeleteMixin` | `deleted_at` (nullable timestamptz) | **Opt-in** only where recovery matters |

Table names are plural snake_case; columns snake_case (Database Design).

**Migrations:** Alembic with the official **async** template and **asyncpg only** (no second sync driver). `env.py` reads `DATABASE_URL` from app settings. CI enforces a single Alembic head. P0.4 ships an empty baseline revision so the head gate is meaningful before domain tables exist.

## Alternatives considered

1. **Integer / bigserial PKs** — rejected; harder for future extraction and enables enumeration.
2. **UUIDv4 (DB or app)** — rejected; random inserts fragment B-tree indexes more than v7.
3. **Soft-delete on every table** — rejected; unnecessary null columns and query filters; opt-in per entity.
4. **Sync Alembic + psycopg alongside asyncpg** — rejected for P0 to avoid two drivers; async recipe is sufficient.
5. **Domain tables in the baseline** — rejected; P0.4 is foundation only (PLAN).

## Consequences

- Domain models compose mixins; they do not redefine PK/timestamp patterns.
- Autogenerate requires importing new models into `migrations/env.py` (or a models registry) as domains land.
- Empty baseline means `upgrade head` / `downgrade` are no-ops against schema objects until P1+.
- Supabase and Compose share the same Alembic history; only the URL changes (P0.6).

## Future evolution

- Add domain tables via normal revisions (P1+).
- If Python gains stdlib `uuid.uuid7()` on our target version, consider dropping `uuid-utils` in a follow-up.
- Soft-delete query helpers (e.g. default “not deleted” scopes) can land with the first entity that needs them.
