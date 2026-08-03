import {
  CatalogStatusShell,
  CatalogUnavailable,
  MovieDetailView,
} from '@/components/catalog-detail';
import { fetchMovie } from '@/lib/catalog';
import { parseTmdbIdParam } from '@/lib/content_ids';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

interface MoviePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: MoviePageProps): Promise<Metadata> {
  const { id } = await params;
  if (parseTmdbIdParam(id) != null) {
    return { title: 'Movie · Aperture' };
  }
  const result = await fetchMovie(id);
  if (!result.ok) {
    return { title: 'Movie · Aperture' };
  }
  return {
    title: `${result.data.title} · Aperture`,
    description:
      result.data.overview?.slice(0, 160) ||
      `${result.data.title} on Aperture.`,
  };
}

export default async function MoviePage({ params }: MoviePageProps) {
  const { id } = await params;
  const tmdbId = parseTmdbIdParam(id);
  if (tmdbId != null) {
    redirect(`/movies/tmdb/${tmdbId}`);
  }
  const result = await fetchMovie(id);

  if (!result.ok && result.status === 404) {
    notFound();
  }

  if (result.ok) {
    return <MovieDetailView movie={result.data} />;
  }

  return (
    <CatalogStatusShell>
      <CatalogUnavailable message={result.error} />
    </CatalogStatusShell>
  );
}
