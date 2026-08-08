import { PageLoadingShell } from '@/components/page-loading-shell';
import { ShelfPageSkeleton } from '@/components/skeleton';

export default function SimilarTvLoading() {
  return (
    <PageLoadingShell>
      <ShelfPageSkeleton showDescription={false} />
    </PageLoadingShell>
  );
}
