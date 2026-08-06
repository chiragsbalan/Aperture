import { PosterMosaic } from '@/components/poster-mosaic';
import { SiteHeader } from '@/components/site-header';
import { fetchLandingPosterUrls } from '@/lib/catalog';

/**
 * Shared shell for login / signup (and any other guest auth routes).
 * Keeps the poster mosaic mounted across client navigations between them.
 * Signed-out `/` uses the same mosaic pattern in `app/page.tsx`.
 */
export default async function GuestShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const posters = await fetchLandingPosterUrls();

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-[var(--color-bg)]">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <PosterMosaic posters={posters} />
      <SiteHeader />
      <main
        id="main-content"
        className="relative z-[1] flex flex-1 flex-col items-center justify-center px-5 py-12 sm:px-6 sm:py-24"
      >
        {children}
      </main>
    </div>
  );
}
