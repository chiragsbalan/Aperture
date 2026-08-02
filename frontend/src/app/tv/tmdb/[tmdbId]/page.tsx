import {
  CatalogStatusShell,
  CatalogUnavailable,
} from '@/components/catalog-detail';
import { resolveTvByTmdb } from '@/lib/catalog';
import { notFound, redirect } from 'next/navigation';

interface TvTmdbResolvePageProps {
  params: Promise<{ tmdbId: string }>;
}

export default async function TvTmdbResolvePage({
  params,
}: TvTmdbResolvePageProps) {
  const { tmdbId: raw } = await params;
  const tmdbId = Number(raw);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    notFound();
  }

  const result = await resolveTvByTmdb(tmdbId);
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

  redirect(`/tv/${result.data.id}`);
}
