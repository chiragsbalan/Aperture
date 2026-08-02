import { PosterMosaic } from '@/components/poster-mosaic';
import { SiteHeader } from '@/components/site-header';
import { fetchLandingPosterUrls } from '@/lib/catalog';

/**
 * Shared shell for the public landing / login / signup routes.
 * Keeps the poster mosaic mounted across client navigations between them.
 */
export default async function GuestShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const posters = await fetchLandingPosterUrls();

  return (
    <div className="shell-atmosphere relative flex min-h-dvh flex-col overflow-hidden">
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
