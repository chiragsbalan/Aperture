import {
  CatalogStatusShell,
  CatalogUnavailable,
  TvDetailView,
} from '@/components/catalog-detail';
import { fetchTv } from '@/lib/catalog';
import { parseTmdbIdParam } from '@/lib/content_ids';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

interface TvPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: TvPageProps): Promise<Metadata> {
  const { id } = await params;
  if (parseTmdbIdParam(id) != null) {
    return { title: 'TV · Aperture' };
  }
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
  const tmdbId = parseTmdbIdParam(id);
  if (tmdbId != null) {
    redirect(`/tv/tmdb/${tmdbId}`);
  }
  const result = await fetchTv(id);

  if (!result.ok && result.status === 404) {
    notFound();
  }

  if (result.ok) {
    return <TvDetailView show={result.data} />;
  }

  return (
    <CatalogStatusShell>
      <CatalogUnavailable message={result.error} />
    </CatalogStatusShell>
  );
}
