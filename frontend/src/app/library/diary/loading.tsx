import { PageLoadingShell } from '@/components/page-loading-shell';
import { LibraryBodySkeleton, SkeletonBlock } from '@/components/skeleton';

export default function LibraryDiaryLoading() {
  return (
    <PageLoadingShell>
      <div className="layout-content motion-fade-rise text-left">
        <SkeletonBlock className="h-8 w-28 rounded-sm sm:h-9" />
        <SkeletonBlock className="mt-3 h-3 w-48 rounded-sm" />
        <div className="mt-6 flex gap-4" aria-hidden>
          <SkeletonBlock className="h-4 w-20 rounded-sm" />
          <SkeletonBlock className="h-4 w-20 rounded-sm" />
          <SkeletonBlock className="h-4 w-14 rounded-sm" />
          <SkeletonBlock className="h-4 w-14 rounded-sm" />
        </div>
        <LibraryBodySkeleton variant="diary" />
      </div>
    </PageLoadingShell>
  );
}
