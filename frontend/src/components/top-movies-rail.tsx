import { CatalogPoster } from '@/components/catalog-poster';
import { TmdbResolveLink } from '@/components/tmdb-resolve-link';
import type { TopMovie } from '@/lib/catalog';

/**
 * Signed-in home rail: shuffled sample from TMDb top-rated movies.
 * Always owns the page h1 (empty and populated).
 */
export function TopMoviesRail({ movies }: { movies: TopMovie[] }) {
  return (
    <section className="w-full text-left" aria-labelledby="top-movies-heading">
      <div className="border-b border-[var(--color-border)] pb-2">
        <h1
          id="top-movies-heading"
          className="type-rail text-foreground"
        >
          Top movies
        </h1>
        {movies.length === 0 ? null : (
          <p className="mt-1 text-sm text-muted">
            A rotating sample from TMDb&apos;s all-time top rated.
          </p>
        )}
      </div>
      {movies.length === 0 ? (
        <p className="mt-5 text-sm text-muted sm:mt-6" role="status">
          Top movies are unavailable right now. Try again shortly.
        </p>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-x-3 gap-y-5 sm:mt-6 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-6 md:grid-cols-4 lg:grid-cols-6">
          {movies.map((movie) => (
            <li key={movie.tmdb_id} className="min-w-0">
              <TmdbResolveLink
                href={`/movies/tmdb/${movie.tmdb_id}`}
                tmdbId={movie.tmdb_id}
                kind="movie"
                ariaLabel={
                  movie.year != null
                    ? `${movie.title} (${movie.year})`
                    : movie.title
                }
                className="block min-w-0 overflow-hidden transition hover:opacity-90"
              >
                <CatalogPoster
                  url={movie.poster_url}
                  alt=""
                  sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 140px"
                />
                <p className="mt-2 block w-full truncate font-display text-sm font-medium text-foreground">
                  {movie.title}
                </p>
                {movie.year != null ? (
                  <p className="truncate text-xs text-muted">{movie.year}</p>
                ) : null}
              </TmdbResolveLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
