import { PageLoadingShell } from '@/components/page-loading-shell';
import { SearchResultsSkeleton, SkeletonBlock } from '@/components/skeleton';

export default function SearchLoading() {
  return (
    <PageLoadingShell>
      <div className="layout-content layout-shell-pad-top pb-16">
        <SkeletonBlock className="h-8 w-36 rounded-sm sm:h-9" />
        <SkeletonBlock className="mt-3 h-3 w-72 max-w-full rounded-sm" />
        <div className="mt-8">
          <SearchResultsSkeleton />
        </div>
      </div>
    </PageLoadingShell>
  );
}
