# Cloudflare R2 setup — profile avatars

Aperture stores profile photos in **Cloudflare R2** and serves them from a **custom domain** (CDN). Follow this once you create a Cloudflare account.

## 1. Create a Cloudflare account

1. Sign up at [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
2. Verify your email.
3. (Production) Add your app domain to Cloudflare DNS, or use an R2.dev subdomain for early testing.

**Cost note:** R2 has a forever free tier (storage + Class A/B ops). Egress to the internet via the R2 custom domain is $0.

## 2. Create an R2 bucket

1. Dashboard → **R2 Object Storage** → **Create bucket**.
2. Name: `aperture-avatars` (or similar).
3. Leave default storage class.

## 3. API token (S3 credentials)

1. R2 → **Manage R2 API Tokens** → **Create API token**.
2. Permissions: **Object Read & Write** on the `aperture-avatars` bucket only.
3. Copy:
   - **Access Key ID** → `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `R2_SECRET_ACCESS_KEY`
4. Account ID is on the R2 overview page → `R2_ACCOUNT_ID`.

## 4. Public access (CDN)

**Option A — custom domain (recommended for production)**

1. On the bucket → **Settings** → **Custom Domains** → connect `media.yourdomain.com`.
2. Cloudflare will create the DNS record when the zone is on Cloudflare.
3. Set:
   - `R2_PUBLIC_BASE_URL=https://media.yourdomain.com`
   - `NEXT_PUBLIC_MEDIA_HOST=media.yourdomain.com` (Vercel + local frontend)

**Option B — r2.dev public URL (quick test)**

1. Bucket → **Settings** → **Public access** → allow `*.r2.dev`.
2. Use the provided `https://pub-….r2.dev` URL as `R2_PUBLIC_BASE_URL`.
3. Set `NEXT_PUBLIC_MEDIA_HOST` to that hostname (no `https://`).

## 5. Bucket CORS (required for browser PUT)

Bucket → **Settings** → **CORS policy**:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://YOUR_PRODUCTION_DOMAIN"
    ],
    "AllowedMethods": ["PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Cache-Control", "Content-Length"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Presigned uploads hit `https://{ACCOUNT_ID}.r2.cloudflarestorage.com`, not the custom domain.
The browser PUT must send the signed `Content-Type`, `Content-Length`, and `Cache-Control` headers.

## 6. App environment

**Backend (Render / `.env`):**

```bash
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=aperture-avatars
R2_PUBLIC_BASE_URL=https://media.yourdomain.com
# optional:
# R2_UPLOAD_URL_TTL_SECONDS=120
# AVATAR_MAX_BYTES=2097152
```

**Frontend (Vercel / `.env`):**

```bash
NEXT_PUBLIC_MEDIA_HOST=media.yourdomain.com
```

Restart the API and rebuild/redeploy the frontend after changing `NEXT_PUBLIC_*` (baked into CSP at build time).

## 7. Verify

1. Sign in → **Settings** → **Upload photo**.
2. Network: `POST …/avatar/upload-url` → `PUT` to `*.r2.cloudflarestorage.com` → `POST …/avatar/confirm`.
3. Profile shows the image; object appears under `avatars/{user_id}/…` in the bucket.

## 8. Optional lifecycle

Add a rule to expire unfinished uploads under `avatars/` older than 1–7 days if you see orphan objects from abandoned confirms.

## Local without R2

Leave R2 vars empty. Upload endpoints return **503** with a clear message; the rest of the app works; avatars stay initials-only.
