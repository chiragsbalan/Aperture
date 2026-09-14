import { SiteHeader } from '@/components/site-header';
import { TitleActivityTabs } from '@/components/title-activity-tabs';
import type { SimilarTitle } from '@/lib/catalog';
import type { LibraryContentType } from '@/lib/library';
import type { ActivityTab } from '@/lib/reviews';

/**
 * Full-page title activity view (Reviews / Ratings / Lists / Similar).
 */
export function TitleActivityPage({
  title,
  kind,
  contentId,
  similar,
  initialTab,
}: {
  title: string;
  kind: LibraryContentType;
  contentId: string;
  similar: SimilarTitle[];
  initialTab: ActivityTab;
}) {
  return (
    <div className="shell-atmosphere relative flex min-h-dvh flex-col overflow-x-hidden">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative z-[1] w-full">
        <div className="layout-content layout-shell-pad-top pb-16 text-left sm:pb-24">
          <h1 className="type-page-lg text-foreground">{title}</h1>
          <p className="mt-2 text-sm text-muted">Activity</p>
          <TitleActivityTabs
            kind={kind}
            contentId={contentId}
            similar={similar}
            initialTab={initialTab}
          />
        </div>
      </main>
    </div>
  );
}
