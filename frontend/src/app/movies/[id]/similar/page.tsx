import { SiteHeader } from '@/components/site-header';
import { fetchMovie } from '@/lib/catalog';
import Link from 'next/link';
import { notFound } from 'next/navigation';

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
  const result = await fetchMovie(id);
  if (!result.ok && result.status === 404) {
    notFound();
  }

  const title = result.ok ? result.data.title : 'This title';

  return (
    <main className="shell-atmosphere relative min-h-dvh overflow-x-hidden">
      <SiteHeader />
      <div className="mx-auto w-full max-w-3xl px-6 pb-24 pt-28 text-left">
        <p className="text-sm text-muted">
          <Link
            href={`/movies/${id}`}
            className="underline-offset-2 hover:underline"
          >
            ← {title}
          </Link>
        </p>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-foreground">
          Similar
        </h1>
        <p className="mt-3 text-sm text-muted">
          Full similar titles for this movie will land here.
        </p>
      </div>
    </main>
  );
}
