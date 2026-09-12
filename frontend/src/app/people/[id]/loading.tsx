import { SiteHeader } from '@/components/site-header';
import { PersonDetailSkeleton } from '@/components/skeleton';

export default function PersonLoading() {
  return (
    <div className="shell-atmosphere relative min-h-dvh overflow-x-hidden">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative z-[1]">
        <PersonDetailSkeleton />
      </main>
    </div>
  );
}
