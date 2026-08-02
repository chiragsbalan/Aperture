import Link from 'next/link';

import { CatalogPoster } from '@/components/catalog-poster';
import type { TopMovie } from '@/lib/catalog';

/**
 * Signed-in home rail: shuffled sample from TMDb top-rated movies.
 */
export function TopMoviesRail({ movies }: { movies: TopMovie[] }) {
  if (movies.length === 0) {
    return (
      <p className="mt-8 text-sm text-muted" role="status">
        Top movies are unavailable right now. Try again shortly.
      </p>
    );
  }

  return (
    <section
      className="mt-8 w-full text-left sm:mt-10"
      aria-labelledby="top-movies-heading"
    >
      <div className="border-b border-[var(--color-border)] pb-2">
        <h2
          id="top-movies-heading"
          className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
        >
          Top movies
        </h2>
        <p className="mt-1 text-sm text-muted">
          A rotating sample from TMDb&apos;s all-time top rated.
        </p>
      </div>
      <ul className="mt-5 grid grid-cols-2 gap-x-3 gap-y-5 sm:mt-6 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-6 md:grid-cols-4 lg:grid-cols-6">
        {movies.map((movie) => (
          <li key={movie.tmdb_id} className="min-w-0">
            <Link
              href={`/movies/tmdb/${movie.tmdb_id}`}
              aria-label={
                movie.year != null
                  ? `${movie.title} (${movie.year})`
                  : movie.title
              }
              className="block transition hover:opacity-90"
            >
              <CatalogPoster
                url={movie.poster_url}
                alt=""
                sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 140px"
              />
              <p className="mt-2 truncate font-display text-sm font-medium text-foreground">
                {movie.title}
              </p>
              {movie.year != null ? (
                <p className="text-xs text-muted">{movie.year}</p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
