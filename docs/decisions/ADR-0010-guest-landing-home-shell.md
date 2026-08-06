# ADR-0010 — Guest landing on `/` and signed-in home shell

- **Status:** Accepted
- **Date:** 2026-08-06
- **Related:** [ADR-0003](ADR-0003-hosting-and-bff.md) (BFF deny-list, landing/rail RL); [ADR-0004](ADR-0004-content-identity.md) (home discovery rails); [ADR-0005](ADR-0005-auth.md) (in-place auth BFF routes); [ADR-0012](ADR-0012-brand-shell-atmosphere.md) (shell atmosphere — guest excluded); `pc.2` public library / discovery
- **Implements in:** Guest browse landing (`feature/guest-browse-home` / PR #34)
- **Amended:** 2026-08-06 — guest mosaic only (no shell atmosphere); hero uses stable `svh` so mosaic does not resize with mobile browser chrome

## Context

After pc.2 shipped cold TMDb discovery rails for signed-in home, the logged-out experience still needed a product decision: a separate browse route, a thin marketing page, or a Letterboxd-style story on `/` that converts guests without sending them to a different “house” surface. Auth entry also had to stay on the same-origin BFF (`/api/auth/*`) while keeping the catch-all proxy deny-list for catalog/landing scrapes.

## Decision

### Surfaces

| Who | `/` |
|---|---|
| **Guest** | Full landing: poster mosaic hero, stepped brand/tagline, **Get started** → in-place login/signup panels (no URL change), capability grid, then the same three discovery rails as signed-in home |
| **Signed-in** | Rails-only home (no marketing hero) |
| **`/home`** | Permanent redirect to `/` (legacy alias) |

### Chrome

- **Guest header:** brand + search only (no Sign in / Create account in the header; auth starts from Get started / in-place panels).
- **Logout** (settings and account panel) returns to **`/`** (guest landing), not `/login`.
- Dedicated `/login` and `/signup` routes remain for deep links / OAuth error landings; in-place panels on `/` use the same `AuthForm` + `/api/auth/*` BFF routes.
- **Guest visual shell:** poster mosaic + veil on charcoal page background only. Guest `/` and `(guest-shell)` **do not** use randomized purple/blue `.shell-atmosphere` lobes (see [ADR-0012](ADR-0012-brand-shell-atmosphere.md) for where atmosphere applies).
- **Guest hero height:** `min-h-svh` (small viewport height) so the mosaic box stays stable when mobile browser chrome shows/hides. Do **not** use `min-h-dvh` for the mosaic hero — dynamic viewport growth on scroll reflows the mosaic and looks like elongation.

### Session shell matrix (RSC)

`frontend/src/lib/home-shell.ts` (+ RSC probe in `home-shell.server.ts`) decides guest vs signed-in shell. Pure helpers are client-safe; `next/headers` stays in the `.server` module so guest UI can import rail headings without breaking the client bundle.

| Cookies / `/auth/me` outcome | Shell |
|---|---|
| No cookies | Guest |
| Refresh only (any / before fetch) | Signed-in (RSC optimism; SiteHeader recovers via `/api/auth/me`) |
| Access + `/me` ok | Signed-in |
| Access + 401 / 429 / 5xx / network / config | Signed-in **iff** refresh present; otherwise guest |

**Prefetch invariant:** home rails may prefetch in parallel with the session probe only when a **refresh** cookie is present (`shouldPrefetchHomeRails`). Access-only must not start rail fetches (probe may demote to guest; guest path fetches rails itself).

### Catalog / BFF (cross-ref)

- Rails + landing mosaic: RSC → FastAPI only; catch-all proxy denies `/api/v1/catalog/*` and `/api/v1/landing/*` (ADR-0003).
- Cold TMDb cards still open via dedicated `POST /api/catalog/resolve` (ADR-0004).
- Public rail `limit` clamp **24** / default fetch **12** stay manually coupled FE↔BE (ADR-0004).

## Alternatives considered

1. **Separate guest browse at `/home` (or similar) with marketing elsewhere** — rejected; product chose a single Letterboxd-style entry on `/` and retired the house-icon browse metaphor.
2. **Navigate to `/login` / `/signup` for Get started** — rejected for the primary CTA; in-place panels keep scroll context and avoid a full route swap (dedicated auth routes remain for deep links).
3. **Sign in / Create account in the guest header** — deferred; header stays brand + search; conversion is hero-led.
4. **Secret-gate public catalog/landing behind the BFF shared secret** — rejected; routes stay public with per-IP RL; deny-list only blocks the open same-origin proxy (ADR-0003 accepted risk).
5. **Optimistic signed-in shell on any auth cookie when `/me` returns 429** — rejected for **access-only**; refresh keeps optimism so expired access + valid refresh does not flash the marketing hero.

## Consequences

- Guest `/` is the conversion surface; signed-in `/` stays discovery-only.
- Home shell and rail prefetch rules are table-tested; regressions show up as guest↔signed-in flicker or wasted RL charges.
- Guest mosaic must not grow mid-scroll on mobile; regressions show as sudden tile-row growth when the URL bar collapses.
- OAuth error URLs, `?auth=` deep links, middleware soft-gates for library/settings, and mosaic pause controls remain product follow-ups (not locked here).
- ADR-0003 / ADR-0004 / ADR-0005 amendments for deny-list, rails, and in-place auth remain authoritative for those layers; **this ADR is authoritative for guest vs signed-in `/` product shell**.

## Future evolution

- Optional `?auth=login|signup` URL sync for shareable panels.
- Signed-in visits to `/login`/`/signup` may redirect to `/`.
- Batched `GET /catalog/home-rails` (ADR-0004) if four public GETs per guest load become costly under NAT.
- Restore or redesign mosaic pause / reduced-motion affordances if a11y review requires it.
