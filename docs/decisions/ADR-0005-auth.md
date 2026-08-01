# ADR-0005 — Authentication and session model

- **Status:** Accepted
- **Date:** 2026-08-01
- **Related:** Authentication LLD; Users Module LLD; Frontend Architecture; ADR-0003 (BFF transport); PLAN.md P1
- **Implements in:** P1.1–P1.3 (password, hardening, Google); profiles remain Users module (P1.4)

## Context

Browsers must authenticate to FastAPI without exposing long-lived secrets to JavaScript or adopting Supabase Auth (forbidden by ADR-0003). Authentication LLD separates **identity/session** from **user profile**. PLAN locks concrete token lifetimes, hashing, OAuth linking rules, and early rate-limit strategy before Redis exists.

## Decision

### Transport (with ADR-0003)

- Browser talks only to the **same-origin Next.js BFF** on Vercel.
- BFF stores tokens in **`__Host-ap_at`** (access) and **`__Host-ap_rt`** (refresh) cookies.
- FastAPI remains **cookie-agnostic**: Authorization / body / dedicated headers as designed in API routes; BFF does not forward browser `Cookie` to the API (see existing proxy allowlist).
- Do **not** use Supabase Auth, Realtime, or client `service_role` for product login.

### Tokens and passwords

| Concern | Choice |
|---|---|
| Access token | Signed **JWT**, **15 minute** lifetime |
| Refresh token | **Opaque** server-side session (`refresh_sessions`); rotated on use |
| Refresh reuse | **10 second reuse grace** after rotation (tolerate parallel tab refresh); outside grace → treat as theft / revoke family as designed in P1.2 |
| Passwords | **Argon2id** (salted; never plaintext) |

### Identity model

- Auth module owns **identity** + **refresh sessions**; Users module owns profile (username, bio, preferences).
- Credentials and provider links live in **`identity_credentials`** (password hash and/or OAuth subject per provider).
- **Password registration (P1.1):** email + **username** + password in one transaction (identity + credential + `users` row). Username is Users-owned, required at signup, unique, normalized lowercase, `[a-z0-9_]{3,32}`.
- **Password login (P1.1):** a single **identifier** field accepts **email or username** plus password. Resolution: if the identifier contains `@`, treat as email (normalized); otherwise look up `users.username` → identity. Same generic error for unknown identifier vs bad password (enumeration polish in P1.2).
- **OAuth (Google in P1.3): no auto-link** by email. First Google sign-in creates or uses an OAuth identity path per product rules; linking an existing password account requires an **explicit authenticated link** from settings.
- **Google-only first sign-in (P1.3):** create identity + google credential + `users` row in one transaction. Seed **`username`** (and typically `display_name`) from Google given/family name: normalize to the locked username rules (`[a-z0-9_]{3,32}`, e.g. join names with `_`, strip invalid chars, lowercase). On collision with an existing username, append a short unique suffix. No forced post-OAuth questionnaire in P1.3.
- **Later profile work (P1.4+):** users may rename username / edit profile in settings. Genre selection and other “new profile” / taste onboarding steps land with those features when they ship — optional profile enrichment, not a Google-specific incomplete-account gate at first sign-in.
- Future providers (Apple, GitHub, passkeys) extend the same tables without collapsing into Supabase Auth.
- **P1.4** adds username rename / bio / preferences UI (password users already chose username at register; Google users start from the seeded name and can change it).

### Rate limiting before Redis

- From **P1**: abstract **`CacheBackend`** + **DB failed-attempt counters** for login/register abuse controls.
- Production API stays at **Render Free, single instance** until Redis (ADR-0006 / P2.4) enables multi-instance shared counters.
- Enumeration-safe errors on auth endpoints (P1.2).

### P1.2 hardening (as implemented)

- **Refresh reuse:** 10s grace after rotation returns the same successor token pair. L1 in-memory `CacheBackend` is read-through; durable `refresh_grace_payloads` is written in the same DB transaction as rotation (survives process restart within grace). Within grace + payload miss → 401 with **no** family revoke and **no** successor re-rotate. Reuse outside grace **revokes that refresh family only** (not all sessions for the identity). Logout without a successor is a plain 401 (no family revoke).
- **Login enumeration:** same `"Invalid credentials"` body for unknown identifier vs bad password; Argon2 verify always runs (dummy hash when no credential).
- **Register:** may return 409 with distinct email/username conflict messages for UX; compensated by rate limits.
- **Trusted client IP:** BFF sets `X-Aperture-Client-IP` + `X-Aperture-BFF-Secret` from the browser's forwarded IP and server env `AUTH_BFF_SHARED_SECRET`. API trusts the IP header only when the configured secret is non-empty and matches; otherwise uses the socket peer. Inbound `X-Forwarded-For` is ignored for rate limiting.
- **Rate limits (defaults):** 10 login failures / 15m (identifier hash + IP hash; cleared on successful login), 5 register failures / 15m (email hash + IP hash), 30 **failed** refresh outcomes / 15m per IP (not every call), 20 Google OAuth API attempts / 15m per IP (P1.3). Tunable via env (`AUTH_*`). Counters live in `auth_failed_attempts` with atomic `INSERT … ON CONFLICT` upserts.

### P1.3 Google OAuth (as implemented)

- **No email auto-link:** if Google `email` already belongs to an identity (e.g. password-only), `POST /api/v1/auth/google` with `intent=sign_in` returns **409** telling the user to log in then **Link Google** from Account. Linking requires an authenticated `intent=link` call.
- **First Google-only user:** one transaction creates identity + `google` credential + `users` row. Username is seeded from given/family name (`username_from_display_names`: lowercase, strip to `[a-z0-9_]`, join with `_`, clamp 3–32; fallback `user`). Collisions append a short unique `_` suffix. `display_name` is set to `"Given Family"` when available.
- **BFF owns Google:** browser hits `GET /api/auth/google/start?intent=sign_in|link` (PKCE + state in httpOnly cookies). Callback exchanges the code (confidential client), **verifies `id_token` via Google JWKS** (`aud`/`iss`/`email_verified`), and posts claims to the API with `X-Aperture-BFF-Secret` + `X-Aperture-Client-IP`. Link also forwards `Authorization: Bearer` from the access cookie. API rejects `/google` unless the configured shared secret is non-empty and matches. In production, `AUTH_BFF_SHARED_SECRET` must be ≥32 chars and non-placeholder (same class of check as `JWT_SECRET`).
- **Mock mode:** `AUTH_GOOGLE_MOCK=true` for local Compose/CI — **forbidden when `VERCEL_ENV=production`** (hard fail; Compose `next start` may still have `NODE_ENV=production`). Mock start redirects to the local callback; `exchangeCode` returns a deterministic mock profile. Integration tests hit the API directly with the BFF secret.
- **`/me` providers:** response includes `providers: ('password' | 'google')[]` from `identity_credentials`. Unlink is deferred; Account UI shows providers and a Link Google control.

### Authorization

- Authentication establishes identity; **AuthZ stays in the service layer** (not “trust the BFF”).
- Sensitive account changes may require re-auth as features land.

## Alternatives considered

1. **Supabase Auth / Auth.js session cookies to Postgres only** — rejected; conflicts with cookie-agnostic API, modular auth ownership, and ADR-0003.
2. **Server-side sessions only (no JWT access)** — viable but rejected for locked PLAN; short JWT keeps API stateless for access checks while refresh stays revocable.
3. **Long-lived access tokens in `localStorage`** — rejected; XSS exposure; prefer `__Host-` cookies via BFF.
4. **Email-based automatic account linking on Google** — rejected; account-takeover risk when email proof differs across providers.
5. **Redis-required rate limits from day one** — rejected; P1 must ship on one Render instance with DB-backed counters.

## Consequences

- P1.1 ships register (email + username + password) / login (email **or** username + password) / logout / refresh on the public URL using the BFF cookie names already reserved in `frontend/src/lib/auth-cookies.ts`.
- Refresh rotation tests must cover the 10s grace window and reuse-outside-grace behavior.
- Google OAuth needs app credentials (user-supplied) and explicit link UX in settings.
- Multi-instance deploy waits on Redis (ADR-0006); until then sticky single-instance rate limits are acceptable.
- Authentication LLD remains the module narrative; **this ADR is authoritative for lifetimes, Argon2id, no auto-link, and CacheBackend-before-Redis**.

## Future evolution

- MFA, passkeys, device metadata, and login history extend Auth without moving profile fields into Auth.
- When Redis lands, rate-limit counters move to the shared `CacheBackend` Redis implementation; DB counters may remain as durable audit/backup.
- Password reset / email verification await an email provider decision (out of scope here).
- Genre/taste and richer profile onboarding ship with their own slices; Google users edit username/profile there like everyone else (after P1.3 name seeding).
