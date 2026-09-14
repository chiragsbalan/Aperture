import { parseTmdbIdParam } from '@/lib/content_ids';
import { redirect } from 'next/navigation';

interface MovieSimilarRedirectProps {
  params: Promise<{ id: string }>;
}

/** Dedicated similar shelf → Activity Similar tab. */
export default async function MovieSimilarRedirect({
  params,
}: MovieSimilarRedirectProps) {
  const { id } = await params;
  const tmdbId = parseTmdbIdParam(id);
  if (tmdbId != null) {
    redirect(`/movies/tmdb/${tmdbId}`);
  }
  redirect(`/movies/${encodeURIComponent(id)}/activity?tab=similar`);
}
