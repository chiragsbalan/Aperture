import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import type {
  CreditPersonRef,
  MovieDetail,
  PersonDetail,
  SeasonDetail,
  TvDetail,
} from '@/lib/catalog';

function MetaLine({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

function Poster({
  url,
  alt,
  priority = false,
}: {
  url: string | null;
  alt: string;
  priority?: boolean;
}) {
  if (!url) {
    return (
      <div
        aria-hidden
        className="flex aspect-[2/3] w-full max-w-[14rem] items-center justify-center bg-[var(--color-bg-elevated)] text-sm text-muted"
      >
        No image
      </div>
    );
  }
  return (
    <Image
      src={url}
      alt={alt}
      width={280}
      height={420}
      priority={priority}
      className="h-auto w-full max-w-[14rem] object-cover"
      sizes="(max-width: 768px) 40vw, 224px"
    />
  );
}

function CreditList({
  title,
  credits,
}: {
  title: string;
  credits: CreditPersonRef[];
}) {
  if (credits.length === 0) {
    return null;
  }
  return (
    <section className="mt-10 text-left">
      <h2 className="font-display text-lg font-semibold text-foreground">
        {title}
      </h2>
      <ul className="mt-4 space-y-2">
        {credits.map((credit) => (
          <li
            key={`${credit.id}-${credit.character ?? ''}-${credit.job ?? ''}`}
          >
            <Link
              href={`/people/${credit.id}`}
              className="text-foreground underline-offset-2 hover:underline"
            >
              {credit.name}
            </Link>
            {credit.character ? (
              <span className="text-muted"> — {credit.character}</span>
            ) : null}
            {credit.job ? (
              <span className="text-muted"> — {credit.job}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SeasonsBlock({ seasons }: { seasons: SeasonDetail[] }) {
  if (seasons.length === 0) {
    return null;
  }
  return (
    <section className="mt-10 text-left">
      <h2 className="font-display text-lg font-semibold text-foreground">
        Seasons
      </h2>
      <ul className="mt-4 space-y-6">
        {seasons.map((season) => (
          <li key={season.id}>
            <h3 className="font-medium text-foreground">
              {season.name?.trim() || `Season ${season.season_number}`}
            </h3>
            {season.overview ? (
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
                {season.overview}
              </p>
            ) : null}
            {season.episodes.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {season.episodes.map((episode) => (
                  <li key={episode.id}>
                    E{episode.episode_number}
                    {episode.name ? `: ${episode.name}` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function HomeLink() {
  return (
    <p className="text-sm text-muted">
      <Link
        href="/"
        className="text-foreground underline-offset-2 hover:underline"
      >
        Home
      </Link>
    </p>
  );
}

export function CatalogNotFound({ label }: { label: string }) {
  return (
    <div className="motion-fade-rise mt-8 space-y-4 text-center">
      <h1 className="font-display text-2xl font-semibold text-foreground">
        {label} not found
      </h1>
      <p className="text-muted">
        This title isn&apos;t in the catalog, or the link is wrong.
      </p>
      <HomeLink />
    </div>
  );
}

export function CatalogUnavailable({ message }: { message?: string }) {
  return (
    <div className="motion-fade-rise mt-8 space-y-4 text-center">
      <h1 className="font-display text-2xl font-semibold text-foreground">
        Catalog unavailable
      </h1>
      <p className="text-muted">
        {message?.trim() || 'We could not load this title right now.'}
      </p>
      <HomeLink />
    </div>
  );
}

export function CatalogLoading() {
  return (
    <div
      className="motion-fade-in w-full max-w-3xl"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading catalog…</span>
      <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
        <div
          aria-hidden
          className="aspect-[2/3] w-full max-w-[14rem] bg-[var(--color-bg-elevated)]"
        />
        <div className="min-w-0 flex-1 space-y-4">
          <div
            aria-hidden
            className="h-9 w-3/4 max-w-sm bg-[var(--color-bg-elevated)]"
          />
          <div aria-hidden className="h-4 w-24 bg-[var(--color-bg-elevated)]" />
          <div aria-hidden className="mt-6 space-y-2">
            <div className="h-4 w-full bg-[var(--color-bg-elevated)]" />
            <div className="h-4 w-11/12 bg-[var(--color-bg-elevated)]" />
            <div className="h-4 w-4/5 bg-[var(--color-bg-elevated)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function MovieDetailView({ movie }: { movie: MovieDetail }) {
  const year = movie.release_date?.slice(0, 4);
  return (
    <article className="motion-fade-rise w-full max-w-3xl text-left">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
        <Poster url={movie.poster_url} alt={`${movie.title} poster`} priority />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {movie.title}
          </h1>
          <div className="mt-3 space-y-1">
            {year ? <MetaLine>{year}</MetaLine> : null}
            {movie.runtime_minutes != null ? (
              <MetaLine>{movie.runtime_minutes} min</MetaLine>
            ) : null}
            {movie.status ? <MetaLine>{movie.status}</MetaLine> : null}
          </div>
          {movie.overview ? (
            <p className="mt-6 whitespace-pre-wrap text-foreground">
              {movie.overview}
            </p>
          ) : (
            <p className="mt-6 text-sm text-muted">No overview yet.</p>
          )}
        </div>
      </div>
      <CreditList title="Cast" credits={movie.cast} />
      <CreditList title="Crew" credits={movie.crew} />
    </article>
  );
}

export function TvDetailView({ show }: { show: TvDetail }) {
  const years = [
    show.first_air_date?.slice(0, 4),
    show.last_air_date?.slice(0, 4),
  ]
    .filter(Boolean)
    .join('–');
  return (
    <article className="motion-fade-rise w-full max-w-3xl text-left">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
        <Poster url={show.poster_url} alt={`${show.title} poster`} priority />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {show.title}
          </h1>
          <div className="mt-3 space-y-1">
            {years ? <MetaLine>{years}</MetaLine> : null}
            {show.number_of_seasons != null ? (
              <MetaLine>
                {show.number_of_seasons} season
                {show.number_of_seasons === 1 ? '' : 's'}
                {show.number_of_episodes != null
                  ? ` · ${show.number_of_episodes} episodes`
                  : ''}
              </MetaLine>
            ) : null}
            {show.status ? <MetaLine>{show.status}</MetaLine> : null}
          </div>
          {show.overview ? (
            <p className="mt-6 whitespace-pre-wrap text-foreground">
              {show.overview}
            </p>
          ) : (
            <p className="mt-6 text-sm text-muted">No overview yet.</p>
          )}
        </div>
      </div>
      <SeasonsBlock seasons={show.seasons} />
      <CreditList title="Cast" credits={show.cast} />
      <CreditList title="Crew" credits={show.crew} />
    </article>
  );
}

export function PersonDetailView({ person }: { person: PersonDetail }) {
  return (
    <article className="motion-fade-rise w-full max-w-3xl text-left">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
        <Poster url={person.profile_url} alt={person.name} priority />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {person.name}
          </h1>
          <div className="mt-3 space-y-1">
            {person.birthday ? (
              <MetaLine>Born {person.birthday}</MetaLine>
            ) : null}
            {person.deathday ? (
              <MetaLine>Died {person.deathday}</MetaLine>
            ) : null}
            {person.place_of_birth ? (
              <MetaLine>{person.place_of_birth}</MetaLine>
            ) : null}
          </div>
          {person.biography ? (
            <p className="mt-6 whitespace-pre-wrap text-foreground">
              {person.biography}
            </p>
          ) : (
            <p className="mt-6 text-sm text-muted">No biography yet.</p>
          )}
        </div>
      </div>
      {person.credits.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Known for
          </h2>
          <ul className="mt-4 space-y-2">
            {person.credits.map((credit) => {
              const href =
                credit.type === 'movie'
                  ? `/movies/${credit.id}`
                  : `/tv/${credit.id}`;
              return (
                <li
                  key={`${credit.id}-${credit.credit_kind}-${credit.job ?? ''}-${credit.character ?? ''}`}
                >
                  <Link
                    href={href}
                    className="text-foreground underline-offset-2 hover:underline"
                  >
                    {credit.title}
                  </Link>
                  <span className="text-muted">
                    {' '}
                    ({credit.character || credit.job || credit.credit_kind})
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
