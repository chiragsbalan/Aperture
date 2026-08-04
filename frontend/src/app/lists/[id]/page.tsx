import { Suspense } from 'react';

import { CustomListDetailPage } from '@/components/custom-list-detail-page';
import { SiteHeader } from '@/components/site-header';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'List · Aperture',
  description: 'A curated list on Aperture.',
};

export default async function PublicListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
          <CustomListDetailPage listId={id} />
        </Suspense>
      </main>
    </div>
  );
}
