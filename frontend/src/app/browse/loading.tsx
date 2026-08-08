import { PageLoadingShell } from '@/components/page-loading-shell';
import { ShelfPageSkeleton } from '@/components/skeleton';

export default function BrowseLoading() {
  return (
    <PageLoadingShell>
      <ShelfPageSkeleton />
    </PageLoadingShell>
  );
}
