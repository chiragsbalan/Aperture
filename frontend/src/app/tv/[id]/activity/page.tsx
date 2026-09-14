import { TitleActivityPage } from '@/components/title-activity-page';
import { fetchTv } from '@/lib/catalog';
import { parseTmdbIdParam } from '@/lib/content_ids';
import { parseActivityTab } from '@/lib/reviews';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

interface TvActivityPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

/** Title metadata only. Review bodies stay off this document. */
export const revalidate = 300;

export async function generateMetadata({
  params,
}: TvActivityPageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await fetchTv(id);
  if (!result.ok) {
    return { title: 'Activity · Aperture' };
  }
  return {
    title: `${result.data.title} · Activity · Aperture`,
    description: `Activity for ${result.data.title} on Aperture.`,
  };
}

export default async function TvActivityPage({
  params,
  searchParams,
}: TvActivityPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const initialTab = parseActivityTab(query.tab);
  const tmdbId = parseTmdbIdParam(id);
  if (tmdbId != null) {
    redirect(`/tv/tmdb/${tmdbId}`);
  }
  const result = await fetchTv(id);
  if (!result.ok) {
    if (result.status === 404) {
      notFound();
    }
    return (
      <TitleActivityPage
        title="this show"
        kind="tv"
        contentId={id}
        similar={[]}
        initialTab={initialTab}
      />
    );
  }

  return (
    <TitleActivityPage
      title={result.data.title}
      kind="tv"
      contentId={result.data.id}
      similar={result.data.extras.similar ?? []}
      initialTab={initialTab}
    />
  );
}
