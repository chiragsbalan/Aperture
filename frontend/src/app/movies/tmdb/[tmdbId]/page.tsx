import { CatalogUnavailable } from '@/components/catalog-detail';
import { SiteHeader } from '@/components/site-header';
import { resolveMovieByTmdb } from '@/lib/catalog';
import { notFound, redirect } from 'next/navigation';

interface MovieTmdbResolvePageProps {
  params: Promise<{ tmdbId: string }>;
}

export default async function MovieTmdbResolvePage({
  params,
}: MovieTmdbResolvePageProps) {
  const { tmdbId: raw } = await params;
  const tmdbId = Number(raw);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    notFound();
  }

  const result = await resolveMovieByTmdb(tmdbId);
  if (!result.ok && result.status === 404) {
    notFound();
  }
  if (!result.ok) {
    return (
      <main className="shell-atmosphere relative min-h-dvh overflow-x-hidden">
        <SiteHeader />
        <CatalogUnavailable message={result.error} />
      </main>
    );
  }

  redirect(`/movies/${result.data.id}`);
}
