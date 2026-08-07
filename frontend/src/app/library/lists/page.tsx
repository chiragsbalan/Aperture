import { Suspense } from 'react';

import { CustomListsPage } from '@/components/custom-lists-page';
import { ListRowsSkeleton, SkeletonBlock } from '@/components/skeleton';
import { SiteHeader } from '@/components/site-header';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Lists · Aperture',
  description: 'Your custom lists on Aperture.',
};

function ListsSuspenseFallback() {
  return (
    <div
      className="layout-content motion-fade-rise text-left"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Loading…</span>
      <SkeletonBlock className="h-8 w-32 rounded-sm sm:h-9" />
      <SkeletonBlock className="mt-3 h-3 w-48 rounded-sm" />
      <ListRowsSkeleton className="mt-10" />
    </div>
  );
}

export default function LibraryListsPage() {
  return (
    <div className="layout-shell shell-atmosphere relative flex min-h-dvh flex-col items-center">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative z-[1] w-full">
        <Suspense fallback={<ListsSuspenseFallback />}>
          <CustomListsPage />
        </Suspense>
      </main>
    </div>
  );
}
