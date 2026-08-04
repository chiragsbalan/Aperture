import { SiteHeader } from '@/components/site-header';
import { fetchTv } from '@/lib/catalog';
import { parseTmdbIdParam } from '@/lib/content_ids';
import { notFound, redirect } from 'next/navigation';

interface TvSimilarPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Placeholder for the full similar-titles page.
 */
export default async function TvSimilarPage({ params }: TvSimilarPageProps) {
  const { id } = await params;
  const tmdbId = parseTmdbIdParam(id);
  if (tmdbId != null) {
    redirect(`/tv/tmdb/${tmdbId}`);
  }
  const result = await fetchTv(id);
  if (!result.ok && result.status === 404) {
    notFound();
  }

  return (
    <div className="shell-atmosphere relative min-h-dvh overflow-x-hidden">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main
        id="main-content"
        className="layout-content layout-shell-pad-top relative z-[1] pb-24 text-left"
      >
        <h1 className="type-page-lg text-foreground">Similar</h1>
        <p className="mt-3 text-sm text-muted">
          Full similar titles for this show will land here.
        </p>
      </main>
    </div>
  );
}
