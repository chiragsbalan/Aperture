import { GuestLanding } from '@/components/guest-landing';
import { HomeCatalogRails } from '@/components/home-catalog-rails';
import { SiteHeader } from '@/components/site-header';
import type { TopMovie } from '@/lib/catalog';

interface HomeRails {
  inTheatres: TopMovie[];
  movies: TopMovie[];
  shows: TopMovie[];
}

/** Signed-in ``/`` (rewritten). Not the public cached document. */
export function SignedInHomeShell({ inTheatres, movies, shows }: HomeRails) {
  return (
    <div className="layout-shell shell-atmosphere relative flex min-h-dvh flex-col items-center">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative z-[1] w-full">
        <HomeCatalogRails
          inTheatres={inTheatres}
          movies={movies}
          shows={shows}
        />
      </main>
    </div>
  );
}

/** Anonymous landing. Cached. Mosaic stays on charcoal. */
export function GuestHomeShell({
  posters,
  inTheatres,
  movies,
  shows,
}: HomeRails & { posters: string[] }) {
  return (
    // Theme, not a charcoal plate. Poster morph fades ``main`` to 0 and
    // reveals this wrapper; a solid ``--color-bg`` here reads as a black flash.
    <div className="shell-atmosphere relative flex min-h-svh flex-col">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative flex flex-1 flex-col">
        <GuestLanding
          posters={posters}
          inTheatres={inTheatres}
          movies={movies}
          shows={shows}
        />
      </main>
    </div>
  );
}
