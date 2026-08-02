import { CatalogUnavailable } from '@/components/catalog-detail';
import { SiteHeader } from '@/components/site-header';
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
      <main className="shell-atmosphere relative min-h-dvh overflow-x-hidden">
        <SiteHeader />
        <CatalogUnavailable message={result.error} />
      </main>
    );
  }

  redirect(`/tv/${result.data.id}`);
}
