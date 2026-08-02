import {
  CatalogStatusShell,
  CatalogUnavailable,
} from '@/components/catalog-detail';
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
      <CatalogStatusShell>
        <CatalogUnavailable message={result.error} />
      </CatalogStatusShell>
    );
  }

  redirect(`/movies/${result.data.id}`);
}
