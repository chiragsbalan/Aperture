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
    <main className="shell-atmosphere relative flex min-h-dvh flex-col items-center px-6 py-24">
      <SiteHeader />
      <CustomListDetailPage listId={id} />
    </main>
  );
}
