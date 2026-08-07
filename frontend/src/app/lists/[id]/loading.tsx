import { PageLoadingShell } from '@/components/page-loading-shell';
import { ShelfPageSkeleton } from '@/components/skeleton';

export default function ListDetailLoading() {
  return (
    <PageLoadingShell>
      <ShelfPageSkeleton />
    </PageLoadingShell>
  );
}
