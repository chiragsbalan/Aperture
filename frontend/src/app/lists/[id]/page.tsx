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
    <div className="shell-atmosphere relative flex min-h-dvh flex-col items-center py-24">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative z-[1] w-full">
        <CustomListDetailPage listId={id} />
      </main>
    </div>
  );
}
