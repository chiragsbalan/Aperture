import { CatalogUnavailable, TvDetailView } from '@/components/catalog-detail';
import { SiteHeader } from '@/components/site-header';
import { fetchTv } from '@/lib/catalog';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

interface TvPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: TvPageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await fetchTv(id);
  if (!result.ok) {
    return { title: 'TV · Aperture' };
  }
  return {
    title: `${result.data.title} · Aperture`,
    description:
      result.data.overview?.slice(0, 160) ||
      `${result.data.title} on Aperture.`,
  };
}

export default async function TvPage({ params }: TvPageProps) {
  const { id } = await params;
  const result = await fetchTv(id);

  if (!result.ok && result.status === 404) {
    notFound();
  }

  return (
    <main className="shell-atmosphere relative min-h-dvh overflow-x-hidden">
      <SiteHeader />
      {!result.ok ? (
        <CatalogUnavailable message={result.error} />
      ) : (
        <TvDetailView show={result.data} />
      )}
    </main>
  );
}
