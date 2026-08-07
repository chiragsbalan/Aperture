import { SiteHeader } from '@/components/site-header';
import { TitleShelfView } from '@/components/title-shelf-view';
import type { SimilarTitle } from '@/lib/catalog';
import { shelfItemsFromSimilar } from '@/lib/title-shelf';

/**
 * Full-page Similar shelf (movie / TV). Shell + TitleShelfView.
 */
export function SimilarTitlesPage({
  sourceTitle,
  kind,
  similar,
}: {
  sourceTitle: string;
  kind: 'movie' | 'tv';
  similar: SimilarTitle[];
}) {
  return (
    <div className="layout-shell shell-atmosphere relative flex min-h-dvh flex-col items-center">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative z-[1] w-full pb-24">
        <TitleShelfView
          title="Similar"
          description={`Titles like ${sourceTitle}.`}
          emptyMessage="No similar titles found."
          status="ready"
          items={shelfItemsFromSimilar(similar, kind)}
        />
      </main>
    </div>
  );
}
