import { PageLoadingShell } from '@/components/page-loading-shell';
import { ShelfPageSkeleton } from '@/components/skeleton';

export default function SimilarMoviesLoading() {
  return (
    <PageLoadingShell>
      <ShelfPageSkeleton showDescription={false} />
    </PageLoadingShell>
  );
}
