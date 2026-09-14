import { PageLoadingShell } from '@/components/page-loading-shell';
import { ActivityPageSkeleton } from '@/components/skeleton';

export default function MovieFansLoading() {
  return (
    <PageLoadingShell>
      <ActivityPageSkeleton />
    </PageLoadingShell>
  );
}
