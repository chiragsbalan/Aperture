import { LibraryListPage } from '@/components/library-list-page';
import { SiteHeader } from '@/components/site-header';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Favorites · Aperture',
  description: 'Titles you love on Aperture.',
};

export default function FavoritesPage() {
  return (
    <main className="shell-atmosphere relative flex min-h-dvh flex-col items-center px-6 py-24">
      <SiteHeader />
      <LibraryListPage
        kind="favorites"
        title="Favorites"
        emptyMessage="No favorites yet. Add a title to favorites from any movie or TV page."
      />
    </main>
  );
}
