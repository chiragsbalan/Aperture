import { SiteHeader } from '@/components/site-header';
import { fetchMovie } from '@/lib/catalog';
import { parseTmdbIdParam } from '@/lib/content_ids';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

interface MovieSimilarPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Placeholder for the full similar-titles page.
 */
export default async function MovieSimilarPage({
  params,
}: MovieSimilarPageProps) {
  const { id } = await params;
  const tmdbId = parseTmdbIdParam(id);
  if (tmdbId != null) {
    redirect(`/movies/tmdb/${tmdbId}`);
  }
  const result = await fetchMovie(id);
  if (!result.ok && result.status === 404) {
    notFound();
  }

  const title = result.ok ? result.data.title : 'This title';

  return (
    <div className="shell-atmosphere relative min-h-dvh overflow-x-hidden">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main
        id="main-content"
        className="layout-content relative z-[1] pb-24 pt-28 text-left"
      >
        <p className="text-sm text-muted">
          <Link
            href={`/movies/${id}`}
            className="underline-offset-2 hover:underline"
          >
            ← {title}
          </Link>
        </p>
        <h1 className="mt-4 type-page-lg text-foreground">Similar</h1>
        <p className="mt-3 text-sm text-muted">
          Full similar titles for this movie will land here.
        </p>
      </main>
    </div>
  );
}
