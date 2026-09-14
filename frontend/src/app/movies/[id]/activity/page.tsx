import { TitleActivityPage } from '@/components/title-activity-page';
import { fetchMovie } from '@/lib/catalog';
import { parseTmdbIdParam } from '@/lib/content_ids';
import { parseActivityTab } from '@/lib/reviews';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

interface MovieActivityPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

/** Title metadata only. Review bodies stay off this document. */
export const revalidate = 300;

export async function generateMetadata({
  params,
}: MovieActivityPageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await fetchMovie(id);
  if (!result.ok) {
    return { title: 'Activity · Aperture' };
  }
  return {
    title: `${result.data.title} · Activity · Aperture`,
    description: `Activity for ${result.data.title} on Aperture.`,
  };
}

export default async function MovieActivityPage({
  params,
  searchParams,
}: MovieActivityPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const initialTab = parseActivityTab(query.tab);
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
      <TitleActivityPage
        title="this movie"
        kind="movie"
        contentId={id}
        similar={[]}
        initialTab={initialTab}
      />
    );
  }

  return (
    <TitleActivityPage
      title={result.data.title}
      kind="movie"
      contentId={result.data.id}
      similar={result.data.extras.similar ?? []}
      initialTab={initialTab}
    />
  );
}
