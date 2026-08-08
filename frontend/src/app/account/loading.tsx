import { PageLoadingShell } from '@/components/page-loading-shell';
import { FormSkeleton, SkeletonBlock } from '@/components/skeleton';

export default function AccountLoading() {
  return (
    <PageLoadingShell centered>
      <div className="layout-content">
        <SkeletonBlock className="h-8 w-32 rounded-sm sm:h-9" />
        <SkeletonBlock className="mt-3 h-3 w-72 max-w-full rounded-sm" />
        <FormSkeleton rows={3} />
      </div>
    </PageLoadingShell>
  );
}
