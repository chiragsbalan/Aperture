import { BrowseShelfContent } from '@/components/browse-shelf-content';
import { SiteHeader } from '@/components/site-header';
import type { TopMovie } from '@/lib/catalog';

/**
 * Full-page home-rail shelf (Now in theatres / Top movies / Top TV).
 */
export function BrowseShelfPage({
  title,
  description,
  emptyMessage,
  items,
  kind,
  guestLimited = false,
}: {
  title: string;
  description: string;
  emptyMessage: string;
  items: TopMovie[];
  kind: 'movie' | 'tv';
  /**
   * Top movies / Top TV only: guests get the public window + login CTA.
   * Signed-in shelves paginate client-side with Load more (up to 500).
   */
  guestLimited?: boolean;
}) {
  return (
    <div className="layout-shell shell-atmosphere relative flex min-h-dvh flex-col items-center">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative z-[1] w-full pb-24">
        <BrowseShelfContent
          title={title}
          description={description}
          emptyMessage={emptyMessage}
          items={items}
          kind={kind}
          guestLimited={guestLimited}
        />
      </main>
    </div>
  );
}
