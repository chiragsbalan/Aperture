import { PageLoadingShell } from '@/components/page-loading-shell';
import { FormSkeleton, SkeletonBlock } from '@/components/skeleton';

export default function SettingsLoading() {
  return (
    <PageLoadingShell centered>
      <div className="layout-content">
        <SkeletonBlock className="h-8 w-36 rounded-sm sm:h-9" />
        <SkeletonBlock className="mt-3 h-3 w-64 max-w-full rounded-sm" />
        <FormSkeleton />
      </div>
    </PageLoadingShell>
  );
}
