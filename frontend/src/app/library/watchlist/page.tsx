import { LibraryListPage } from '@/components/library-list-page';
import { SiteHeader } from '@/components/site-header';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Watchlist · Aperture',
  description: 'Titles you plan to watch on Aperture.',
};

export default function WatchlistPage() {
  return (
    <div className="layout-shell shell-atmosphere relative flex min-h-dvh flex-col items-center">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative z-[1] w-full">
        <LibraryListPage
          kind="watchlist"
          title="Watchlist"
          emptyMessage="Nothing saved yet. Add titles from any movie or TV page."
        />
      </main>
    </div>
  );
}
