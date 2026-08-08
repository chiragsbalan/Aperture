import { HomeRailsSkeleton } from '@/components/skeleton';
import { SiteHeader } from '@/components/site-header';

/** Signed-in / guest home at ``/`` — rails pulse while RSC shell loads. */
export default function HomeLoading() {
  return (
    <div className="layout-shell shell-atmosphere relative flex min-h-dvh flex-col overflow-x-hidden">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative z-[1] w-full">
        <HomeRailsSkeleton />
      </main>
    </div>
  );
}
