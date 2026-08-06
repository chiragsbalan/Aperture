import { SiteHeader } from '@/components/site-header';
import { TitleShelfView } from '@/components/title-shelf-view';
import type { TopMovie } from '@/lib/catalog';
import { shelfItemsFromTopMovies } from '@/lib/title-shelf';

/**
 * Full-page home-rail shelf (Now in theatres / Top movies / Top TV).
 */
export function BrowseShelfPage({
  title,
  description,
  emptyMessage,
  items,
  kind,
}: {
  title: string;
  description: string;
  emptyMessage: string;
  items: TopMovie[];
  kind: 'movie' | 'tv';
}) {
  return (
    <div className="layout-shell shell-atmosphere relative flex min-h-dvh flex-col items-center">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative z-[1] w-full pb-24">
        <TitleShelfView
          title={title}
          description={description}
          emptyMessage={emptyMessage}
          status="ready"
          items={shelfItemsFromTopMovies(items, kind)}
        />
      </main>
    </div>
  );
}
