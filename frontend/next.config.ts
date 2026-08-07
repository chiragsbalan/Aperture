import path from 'path';
import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

// First-party avatar CDN host (Cloudflare R2 custom domain), hostname only.
// Example: media.example.com — set NEXT_PUBLIC_MEDIA_HOST in Vercel / .env.
const mediaHost = (process.env.NEXT_PUBLIC_MEDIA_HOST ?? '').trim();

const imgSrc = [
  "'self'",
  'data:',
  'blob:',
  'https://image.tmdb.org',
  'https://i.ytimg.com',
  'https://flagcdn.com',
  ...(mediaHost ? [`https://${mediaHost}`] : []),
].join(' ');

const contentSecurityPolicy = [
  "default-src 'self'",
  // next/font and Next.js runtime need these in practice for the shell.
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src ${imgSrc}`,
  "font-src 'self' data:",
  // Browser PUTs go to the R2 S3 API host (presigned); not the custom domain.
  "connect-src 'self' https://*.r2.cloudflarestorage.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const mediaRemotePattern = mediaHost
  ? [
      {
        protocol: 'https' as const,
        hostname: mediaHost,
        pathname: '/avatars/**',
      },
    ]
  : [];

const nextConfig: NextConfig = {
  output: 'standalone',
  // Avoid picking up unrelated lockfiles outside this monorepo.
  outputFileTracingRoot: path.join(__dirname),
  // Title-poster morphs use click-time FLIP (title-poster-flight.ts), not
  // React <ViewTransition>. Do not enable experimental.viewTransition — it
  // makes startTransition navigations (Similar → detail) run a document VT
  // that fights the FLIP as detail text commits.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        pathname: '/t/p/**',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        pathname: '/vi/**',
      },
      ...mediaRemotePattern,
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        ],
      },
    ];
  },
};

export default nextConfig;
