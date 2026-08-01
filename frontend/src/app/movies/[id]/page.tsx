import {
  CatalogUnavailable,
  MovieDetailView,
} from '@/components/catalog-detail';
import { SiteHeader } from '@/components/site-header';
import { fetchMovie } from '@/lib/catalog';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

interface MoviePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: MoviePageProps): Promise<Metadata> {
  const { id } = await params;
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
  const result = await fetchMovie(id);

  if (!result.ok && result.status === 404) {
    notFound();
  }

  return (
    <main className="shell-atmosphere relative flex min-h-dvh flex-col items-center px-6 py-24">
      <SiteHeader />
      {!result.ok ? (
        <CatalogUnavailable message={result.error} />
      ) : (
        <MovieDetailView movie={result.data} />
      )}
    </main>
  );
}
