# Aperture frontend

Next.js App Router shell (P0.5): design tokens, a11y baseline, and same-origin BFF proxy.

## Local

Prefer Compose from the repo root (`make up`). Or:

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

## BFF proxy

Browser and same-origin clients call:

```text
/api/proxy/<fastapi-path>
```

Examples: `/api/proxy/health/ready`, `/api/proxy/version`.

The Route Handler forwards to FastAPI using server-only `API_URL` (falls back to `NEXT_PUBLIC_API_URL`). Browser cookies are not forwarded; the API stays cookie-agnostic.

Reserved auth cookie names (not set until P1): `__Host-ap_at`, `__Host-ap_rt` — see `src/lib/auth-cookies.ts`.

## Design tokens

CSS variables live in `src/styles/tokens.css`. Dark theme is default (`data-theme="dark"` on `<html>`); light tokens are defined for a future toggle.

## Accessibility

```bash
pnpm build
pnpm exec playwright install chromium
pnpm a11y
```

Scans the shell route with axe (WCAG 2 A/AA). Also runs in Frontend CI after build.
