import { PageLoadingShell } from '@/components/page-loading-shell';
import { ProfileHeaderSkeleton } from '@/components/skeleton';

export default function ProfileLoading() {
  return (
    <PageLoadingShell>
      <div className="layout-content w-full">
        <ProfileHeaderSkeleton />
      </div>
    </PageLoadingShell>
  );
}
