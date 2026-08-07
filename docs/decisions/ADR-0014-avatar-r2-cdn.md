# ADR-0014 — Profile avatars via Cloudflare R2 + CDN

- **Status:** Accepted
- **Date:** 2026-08-07
- **Related:** [ADR-0009](ADR-0009-public-profiles.md) (profile shell / deferred upload); [ADR-0003](ADR-0003-hosting-and-bff.md) (Vercel BFF + Render API); [ADR-0005](ADR-0005-auth.md) (session AuthZ)
- **Supersedes (partial):** ADR-0009 “HTTPS URL string only” / initials-only display for avatars

## Context

Profiles already store optional `users.avatar_url`, but upload/CDN was deferred. Arbitrary external URLs are a CSP and abuse hazard. We need first-party object storage with edge delivery, without pushing large multipart bodies through Render Free or the Next.js BFF.

## Decision

**Cloudflare R2** for blob storage + **R2 custom domain** (Cloudflare CDN) for public reads.

| Concern | Choice |
|---|---|
| Write path | Browser **presigned PUT** to `https://{account_id}.r2.cloudflarestorage.com` (S3 API). Custom domains do **not** support presigned URLs. |
| Read path | Public HTTPS on `R2_PUBLIC_BASE_URL` / `NEXT_PUBLIC_MEDIA_HOST` (e.g. `https://media.example.com/avatars/...`) |
| AuthZ | FastAPI mints upload slots and confirms via `HeadObject`; keys scoped `avatars/{user_id}/{uuid}.{ext}` |
| API | `POST /users/me/avatar/upload-url`, `POST /users/me/avatar/confirm`, `DELETE /users/me/avatar` |
| DB | Continue storing the final CDN URL in `users.avatar_url` |
| Types / size | `image/jpeg` \| `image/png` \| `image/webp`, default max **2MB** (client resize + server HeadObject check) |
| PATCH `/users/me` | When R2 is configured, `avatar_url` may only be cleared or set to our media base — not arbitrary third-party URLs |

Upload flow:

1. Authenticated client requests an upload slot with `content_type` + `byte_size`.
2. API returns `{ upload_url, public_url, key, expires_in }`.
3. Client PUTs bytes directly to R2 (CORS on the bucket).
4. Client calls confirm; API `HeadObject`s, validates type/size, sets `avatar_url`, deletes previous first-party object best-effort.

When R2 env vars are unset, upload endpoints return **503** (local/dev without Cloudflare).

## Alternatives considered

1. **Proxy multipart through FastAPI / BFF** — simpler AuthZ, worse for Render cold starts and body limits; rejected for the happy path.
2. **Vercel Blob** — fine for Next-only apps; API is Python on Render, and CDN would not be Cloudflare-native.
3. **Cloudflare Images** — managed variants; heavier product surface for v1 avatars. Revisit if we need `/cdn-cgi/image` transforms at scale.
4. **Keep arbitrary HTTPS avatar URLs** — rejected once first-party storage exists (CSP allowlist + open redirect/hotlink abuse).

## Consequences

- Requires a Cloudflare account, R2 bucket, API token, bucket CORS, and (for production) a custom domain on the zone.
- Frontend CSP must allow `img-src` for `NEXT_PUBLIC_MEDIA_HOST` and `connect-src` for `https://*.r2.cloudflarestorage.com`.
- Orphan objects (uploaded but never confirmed) need a bucket lifecycle rule (e.g. abort incomplete / prefix TTL) — ops follow-up.
- Optional later: edge Image Resizing on the media hostname for `sm`/`lg` variants without storing multiple keys.

## Ops

See [docs/ops/cloudflare-r2-avatars.md](../ops/cloudflare-r2-avatars.md).
