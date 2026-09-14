import { parseTmdbIdParam } from '@/lib/content_ids';
import { redirect } from 'next/navigation';

interface TvSimilarRedirectProps {
  params: Promise<{ id: string }>;
}

/** Dedicated similar shelf → Activity Similar tab. */
export default async function TvSimilarRedirect({
  params,
}: TvSimilarRedirectProps) {
  const { id } = await params;
  const tmdbId = parseTmdbIdParam(id);
  if (tmdbId != null) {
    redirect(`/tv/tmdb/${tmdbId}`);
  }
  redirect(`/tv/${encodeURIComponent(id)}/activity?tab=similar`);
}
