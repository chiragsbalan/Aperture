import { LibraryListPage } from '@/components/library-list-page';
import { SiteHeader } from '@/components/site-header';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Watchlist · Aperture',
  description: 'Titles you plan to watch on Aperture.',
};

export default function WatchlistPage() {
  return (
    <main className="shell-atmosphere relative flex min-h-dvh flex-col items-center px-6 py-24">
      <SiteHeader />
      <LibraryListPage
        kind="watchlist"
        title="Watchlist"
        emptyMessage="Nothing saved yet. Add titles from any movie or TV page."
      />
    </main>
  );
}
