import { Suspense } from 'react';

import { CustomListsPage } from '@/components/custom-lists-page';
import { SiteHeader } from '@/components/site-header';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Lists · Aperture',
  description: 'Your custom lists on Aperture.',
};

export default function LibraryListsPage() {
  return (
    <div className="layout-shell shell-atmosphere relative flex min-h-dvh flex-col items-center">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative z-[1] w-full">
        <Suspense
          fallback={
            <p className="layout-content mt-10 text-muted" role="status">
              Loading…
            </p>
          }
        >
          <CustomListsPage />
        </Suspense>
      </main>
    </div>
  );
}
