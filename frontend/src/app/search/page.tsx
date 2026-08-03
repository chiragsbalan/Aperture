import type { Metadata } from 'next';

import { SearchResults } from '@/components/search-results';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  title: 'Search · Aperture',
  description: 'Search movies, TV shows, and people in the Aperture catalog.',
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q : '';

  return (
    <div className="shell-atmosphere relative min-h-screen">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main
        id="main-content"
        className="layout-content relative z-[1] pb-16 pt-28 motion-fade-rise"
      >
        <h1 className="type-page-lg text-foreground">Search</h1>
        <p className="mt-2 text-muted">
          Find movies, TV shows, and people in the catalog.
        </p>
        <div className="mt-8">
          <SearchResults query={q} />
        </div>
      </main>
    </div>
  );
}
