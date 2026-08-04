import { LibraryListPage } from '@/components/library-list-page';
import { SiteHeader } from '@/components/site-header';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Favorites · Aperture',
  description: 'Titles you love on Aperture.',
};

export default function FavoritesPage() {
  return (
    <div className="layout-shell shell-atmosphere relative flex min-h-dvh flex-col items-center">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative z-[1] w-full">
        <LibraryListPage
          kind="favorites"
          title="Favorites"
          emptyMessage="No favorites yet. Add a title to favorites from any movie or TV page."
        />
      </main>
    </div>
  );
}
