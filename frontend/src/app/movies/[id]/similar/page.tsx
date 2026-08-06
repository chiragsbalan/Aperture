import { SimilarTitlesPage } from '@/components/similar-titles-page';
import { fetchMovie } from '@/lib/catalog';
import { parseTmdbIdParam } from '@/lib/content_ids';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

interface MovieSimilarPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: MovieSimilarPageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await fetchMovie(id);
  if (!result.ok) {
    return { title: 'Similar · Aperture' };
  }
  return {
    title: `Similar to ${result.data.title} · Aperture`,
    description: `Titles similar to ${result.data.title} on Aperture.`,
  };
}

export default async function MovieSimilarPage({
  params,
}: MovieSimilarPageProps) {
  const { id } = await params;
  const tmdbId = parseTmdbIdParam(id);
  if (tmdbId != null) {
    redirect(`/movies/tmdb/${tmdbId}`);
  }
  const result = await fetchMovie(id);
  if (!result.ok) {
    if (result.status === 404) {
      notFound();
    }
    return (
      <SimilarTitlesPage sourceTitle="this movie" kind="movie" similar={[]} />
    );
  }

  return (
    <SimilarTitlesPage
      sourceTitle={result.data.title}
      kind="movie"
      similar={result.data.extras.similar}
    />
  );
}
