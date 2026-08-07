import { SimilarTitlesPage } from '@/components/similar-titles-page';
import { fetchTv } from '@/lib/catalog';
import { parseTmdbIdParam } from '@/lib/content_ids';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

interface TvSimilarPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: TvSimilarPageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await fetchTv(id);
  if (!result.ok) {
    return { title: 'Similar · Aperture' };
  }
  return {
    title: `Similar to ${result.data.title} · Aperture`,
    description: `Titles similar to ${result.data.title} on Aperture.`,
  };
}

export default async function TvSimilarPage({ params }: TvSimilarPageProps) {
  const { id } = await params;
  const tmdbId = parseTmdbIdParam(id);
  if (tmdbId != null) {
    redirect(`/tv/tmdb/${tmdbId}`);
  }
  const result = await fetchTv(id);
  if (!result.ok) {
    if (result.status === 404) {
      notFound();
    }
    return <SimilarTitlesPage sourceTitle="this show" kind="tv" similar={[]} />;
  }

  return (
    <SimilarTitlesPage
      sourceTitle={result.data.title}
      kind="tv"
      similar={result.data.extras.similar}
    />
  );
}
