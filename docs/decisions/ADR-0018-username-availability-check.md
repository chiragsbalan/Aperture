# ADR-0018 — Protected username live-availability check

- **Status:** Accepted
- **Date:** 2026-09-13
- **Related:** [ADR-0003](ADR-0003-hosting-and-bff.md) (BFF deny-list / threat model); [ADR-0005](ADR-0005-auth.md) (register, rename, BFF secret, trusted client IP); [ADR-0009](ADR-0009-public-profiles.md) (public `/u/{username}`)
- **Implements in:** upcoming signup / settings UX slice (exact Postgres check **and** optional DIY bloom in the **same** slice; not this ADR alone)
- **Does not implement:** soft-deleted username reclaim schema (explicit follow-up below)

## Context

Signup and settings rename need live feedback while typing a username (debounced check before submit). An earlier plan sketched a public unauthenticated `username-available` probe plus optional bloom filter. That conflicts with product intent:

1. **No casually reachable probe.** Browsers must not call an open availability API (or hit the Render origin for the same purpose) without going through the intended gate. “Anyone with curl can enumerate handles” is not acceptable for this feature, even with IP rate limits alone.
2. **One mechanism** for guest register and authenticated settings rename.
3. **Reclaim later** for soft-deleted usernames. Today `uq_users_username` still holds soft-deleted rows, while active lookups filter `deleted_at IS NULL`.

Username existence is already observable elsewhere (register `409`, public profiles). This ADR does not pretend existence is secret forever. It **does** refuse to ship a freely accessible typing-time oracle.

## Alternatives considered

1. **Public unauthenticated `GET …/username-available` + IP RL** — best UX, weakest gate; rejected (binding).
2. **Bloom as primary / sole check** — rejected. False positives hurt signup copy; Postgres remains source of truth. Bloom is only a **negative-fast-path optimization** in front of the same protected exact check (bloom positive → still DB-confirm).
3. **Exact-first now, bloom later as a separate slice** — rejected as the **primary delivery path**. Same-slice ships both so probe volume does not force a follow-up redesign; bloom stays feature-flaggable / optional at runtime.
4. **RedisBloom / Redis Stack module** — rejected. Not portable across Upstash and plain Compose Redis.
5. **No live check (blur / submit-only)** — rejects the product goal of typing-time feedback.
6. **CAPTCHA / proof-of-work on every keystroke** — heavier UX and ops; reserved if BFF-gated RL is abused.
7. **Session-only checks (signed-in required)** — blocks guest signup UX; rejected.

## Decision

Ship a **BFF-attested** username availability surface in **one implementation slice**:

| Layer | Role |
|---|---|
| **Exact Postgres check** | Always authoritative for UX answers that matter; unique constraint remains race SoT |
| **Optional DIY bloom** | Same product surface; negative-fast-path only; bloom positive still DB-confirms |
| **Reclaim policy** | **Out of this slice** — soft-deleted handles stay taken until a later slice |

Bloom is an optimization **behind the same BFF-gated path**, not a second public oracle and not a deferred “maybe later” primary plan.

### (a) Protected live check (this slice)

#### Threat model (availability specifically)

| Path | Allowed? |
|---|---|
| Browser → same-origin BFF route → API with BFF secret + trusted client IP | Yes (intended) |
| Browser → catch-all `/api/proxy/…` toward the check API | **No** (deny-list) |
| Arbitrary client → Render API **without** matching `X-Aperture-BFF-Secret` | **No** (reject like Google `/auth/google`) |
| Caller who steals `AUTH_BFF_SHARED_SECRET` | Can probe; secret stays server-only (Vercel/Render env), never in JS |

This is the **Google OAuth class of gate** (ADR-0005 `_require_bff_secret`), not the open catalog/landing + RL-only model (ADR-0003). Broader “every API route secretly gated” is **out of scope** here; this ADR hardens the new enumeration-friendly surface.

#### API (Render)

- Suggested route: `GET /api/v1/users/username-availability?username=…` (Users module; shared by auth signup and profile rename).
- **Require** non-empty configured `AUTH_BFF_SHARED_SECRET` and matching `X-Aperture-BFF-Secret` (same helper as Google). Missing/wrong secret → `401`/`403`; no availability body.
- Resolve client IP only via BFF-trusted headers (`X-Aperture-Client-IP` when secret matches); ignore inbound `X-Forwarded-For` for RL (existing pattern).
- **Check pipeline** (normalize → format → reserved → optional bloom → DB):
  1. Invalid shape → HTTP **200** with `{ "status": "invalid" }` (same success envelope as available/taken; **not** HTTP 400 and **not** HTTP 100). Lets the shared client helper stay on one body shape for field UX.
  2. Reserved handles (`admin`, `settings`, `u`, …) → `{ "status": "taken" }` (or equivalent “not available”; do not leak reserved vs occupied).
  3. Optional bloom (when enabled): definite **negative** may short-circuit to `{ "status": "available" }`; bloom **positive** must still run the exact DB check (false positives expected at target `p`).
  4. DB: treat a username as **taken if any `users` row holds it**, including soft-deleted, so the live answer matches **`uq_users_username`** until reclaim ships. Do **not** use only `get_user_by_username` (`deleted_at IS NULL`) for this probe.
- **Align register / Google allocate pre-checks** in the same slice: soft-deleted usernames are **taken** for live UX **and** for submit-path pre-checks, so typing feedback and register/Google allocation do not disagree. Reclaim remains a later slice.
- Optional `Authorization: Bearer` (from BFF access cookie): if the candidate equals the caller’s current username, treat as **available** (rename no-op / same-handle).
- **Rate limit:** **120** availability checks per minute per trusted client IP (BFF-forwarded). Dedicated bucket, separate from register-failure counters. Prefer Redis `CacheBackend` when present; otherwise follow existing auth RL patterns. Tunable via env; **120/min** is the locked v1 default.
- Response stays minimal: `{ "status": "available" | "taken" | "invalid" }` on HTTP **200** for all three outcomes (after auth gate). Do not return whether the collision is soft-deleted vs active.

**Source of truth until reclaim:** Postgres `uq_users_username` on insert/rename remains authoritative for races. The live check is advisory UX; register/rename keep pre-check + IntegrityError → conflict handling.

#### DIY bloom (same slice; feature-flaggable)

- **Implementation:** Redis `BITFIELD` / bit-array bloom in **app code**. No RedisBloom / Redis Stack module (Upstash- and Compose-Redis compatible).
- **Sizing (v1 defaults):** expected cardinality `n = 10_000` usernames (including soft-deleted until reclaim); target false-positive rate `p = 0.01` (1%). Derive `m` / `k` from those defaults at implement time; document env knobs if exposed.
- **Semantics:** bloom negative → may answer available without a DB round-trip; bloom positive → **always** confirm with exact Postgres. Never treat bloom as sole SoT.
- **Feature flag:** bloom may be disabled (exact-only path still ships and remains correct). Same BFF-gated product surface either way.
- **Rebuild:** **both** — rebuild on API boot if the filter is missing/unready, **and** periodic cron rebuild so drift (missed invalidations, deploy gaps) does not accumulate.

#### BFF (Vercel / Next)

- Dedicated same-origin route, e.g. `GET /api/auth/username-availability` (alongside `/api/auth/register`), **not** the catch-all proxy.
- Forward upstream with `injectTrustedClientIpHeaders` / `X-Aperture-BFF-Secret` + `X-Aperture-Client-IP`.
- When an access cookie is present, forward `Authorization: Bearer` so settings rename can claim “own username.”
- Add the upstream path to `isDeniedProxyPath` so browsers cannot reach it via `/api/proxy/…`.
- Prefer same-origin only (reject obvious cross-site `Origin` when present). Cookies are `__Host-` / same-site; availability is a GET without cookies required for guests.

#### UI (both surfaces)

- **Signup** (`AuthForm` / guest signup): debounced (~300–500ms) calls to the BFF route; states checking / available / taken / invalid.
- **Settings username rename:** **same BFF route and client helper**, same copy language.
- Product copy examples (no em dashes): `Checking username.` / `Username is available.` / `Username is taken.` / `Username is unavailable.`
- Map register / PATCH conflict responses onto the username field the same way.

### (b) Soft-deleted username reclaim (follow-up, not now)

**Product direction:** soft-deleted usernames should become reclaimable later.

**Today (must change in a later slice):**

| Layer | Behavior |
|---|---|
| Constraint | `uq_users_username` is a full unique on `users.username` (soft-deleted rows still occupy the name) |
| Active lookup | `get_user_by_username` filters `deleted_at IS NULL` |
| Live check (a) | Intentionally counts soft-deleted as taken so UX matches the unique index |
| Register / Google allocate / rename pre-checks (a) | Same slice: soft-deleted = taken so live UX and submit agree |
| Register / rename races | Unique constraint remains final SoT |

**Follow-up work (sketch only; no migration in this ADR):**

1. Replace or amend uniqueness with a **partial unique index** on `username` where `deleted_at IS NULL` (or equivalent reclaim/tombstone policy with TTL).
2. Align register, rename, Google username allocation, and the live check (and bloom membership) with that policy (active-only taken, or reclaim window rules).
3. Decide product edge cases: immediate reclaim vs cool-off; public `/u/{username}` 404 vs redirect; SEO/abuse.
4. Ship migration + app/tests together (local Postgres first; prod via normal migrate-on-start).

Until that lands, **do not** advertise soft-deleted names as free in the live check or submit pre-checks.

## Consequences

- Live availability is **BFF-secret-gated**, deny-listed on the open proxy, rate-limited at **120/min** per trusted client IP, and shared by signup and settings.
- Direct Render probing without the shared secret fails closed for this route.
- One slice ships **exact check + optional DIY bloom** (BITFIELD; `n=10_000`, `p=0.01` v1 defaults; boot + cron rebuild; flaggable).
- Invalid usernames use HTTP **200** + `{ "status": "invalid" }` (same envelope as available/taken).
- Soft-deleted handles remain taken for live UX, register/Google pre-checks, and uniqueness until an explicit reclaim ADR/slice.
- Enumeration still exists via public profiles and register conflicts; this ADR only removes the unprotected typing-time oracle.
- Implementers must not add a public probe “for convenience” or treat bloom as sole source of truth.

## Follow-ups / open work

1. **TODO (tracked): optimize bloom filter `n` and `p` later.** After the slice ships, revisit sizing from **real username cardinality** and **false-positive / DB-hit metrics** (how often bloom positive still hits Postgres, observed FP rate vs target). Adjust `n` / `p` (and derived `m` / `k`) deliberately; do not leave v1 `n = 10_000` / `p = 0.01` as forever defaults without evidence. **This is an explicit post-ship follow-up for implementers.**
2. Soft-deleted username **reclaim** policy as its own slice (and ADR amend or sibling if schema policy needs a durable record). See §(b).
3. Optional short Redis TTL cache of normalized username → status, invalidated on register / rename / soft-delete; still behind the same BFF gate (orthogonal to bloom).
4. If product later requires secret-gating more public read APIs, amend ADR-0003 separately; do not overload this ADR.

## Open questions (non-blocking for accepting this ADR)

1. Reclaim cool-off duration and whether deleted handles appear on public profile URLs during any window (decided in the reclaim slice).
2. Exact product wording when reserved vs taken (whether both map to the same “taken / unavailable” copy).
