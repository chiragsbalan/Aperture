import Link from 'next/link';
import type { ReactNode } from 'react';

import { CatalogPoster } from '@/components/catalog-poster';
import { LibraryActions } from '@/components/library-actions';
import { MoreLikeThis } from '@/components/more-like-this';
import { TitleAtmosphere } from '@/components/title-atmosphere';
import { TitleMetaTabs } from '@/components/title-meta-tabs';
import { WhereToWatch } from '@/components/where-to-watch';
import type {
  CreditPersonRef,
  MovieDetail,
  PersonDetail,
  SeasonDetail,
  TitleExtras,
  TvDetail,
} from '@/lib/catalog';

const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatMonthYear(isoDate: string | null | undefined): string | null {
  if (!isoDate) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    const year = isoDate.slice(0, 4);
    return /^\d{4}$/.test(year) ? year : null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return String(year);
  }
  return MONTH_YEAR_FORMATTER.format(new Date(Date.UTC(year, month - 1, day)));
}

function uniquePeople(credits: CreditPersonRef[]): CreditPersonRef[] {
  const seen = new Set<string>();
  const result: CreditPersonRef[] = [];
  for (const credit of credits) {
    if (seen.has(credit.id)) {
      continue;
    }
    seen.add(credit.id);
    result.push(credit);
  }
  return result;
}

function directorsFromCrew(crew: CreditPersonRef[]): CreditPersonRef[] {
  return uniquePeople(crew.filter((credit) => credit.job === 'Director'));
}

function creatorsFromCrew(crew: CreditPersonRef[]): CreditPersonRef[] {
  return uniquePeople(
    crew.filter(
      (credit) => credit.job === 'Creator' || credit.job === 'Director',
    ),
  );
}

function PersonLinks({ people }: { people: CreditPersonRef[] }) {
  return (
    <>
      {people.map((person, index) => (
        <span key={person.id}>
          {index > 0 ? (
            <span className="text-muted">
              {index === people.length - 1 ? ' & ' : ', '}
            </span>
          ) : null}
          <Link
            href={`/people/${person.id}`}
            className="text-foreground underline decoration-[var(--color-border)] underline-offset-4 transition hover:decoration-accent"
          >
            {person.name}
          </Link>
        </span>
      ))}
    </>
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

function TitleMetaRow({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted">
      {children}
    </div>
  );
}

function MetaDot() {
  return (
    <span aria-hidden className="text-muted/50">
      ·
    </span>
  );
}

export function CatalogNotFound({ label }: { label: string }) {
  return (
    <div className="motion-fade-rise relative z-[1] mx-auto mt-8 max-w-3xl space-y-4 px-6 text-center">
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
    <div className="motion-fade-rise relative z-[1] mx-auto mt-8 max-w-3xl space-y-4 px-6 text-center">
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
      className="motion-fade-in relative z-[1] mx-auto w-full max-w-5xl px-6 pb-24 pt-28"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading catalog…</span>
      <div className="flex flex-col gap-10 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          <div
            aria-hidden
            className="h-10 w-3/4 max-w-md bg-[var(--color-bg-elevated)]"
          />
          <div aria-hidden className="h-4 w-48 bg-[var(--color-bg-elevated)]" />
          <div aria-hidden className="mt-8 space-y-2">
            <div className="h-4 w-full bg-[var(--color-bg-elevated)]" />
            <div className="h-4 w-11/12 bg-[var(--color-bg-elevated)]" />
            <div className="h-4 w-4/5 bg-[var(--color-bg-elevated)]" />
          </div>
        </div>
        <div
          aria-hidden
          className="aspect-[2/3] w-full max-w-[15rem] shrink-0 self-center bg-[var(--color-bg-elevated)] sm:mt-10 sm:self-start"
        />
      </div>
    </div>
  );
}

function TitleDetailShell({
  backdropUrl,
  posterUrl,
  posterAlt,
  title,
  heading,
  meta,
  overview,
  tagline,
  contentId,
  contentType,
  cast,
  crew,
  extras,
  seasons,
}: {
  backdropUrl: string | null;
  posterUrl: string | null;
  posterAlt: string;
  title: string;
  heading: ReactNode;
  meta: ReactNode;
  overview: string | null;
  tagline: string | null;
  contentId: string;
  contentType: string;
  cast: CreditPersonRef[];
  crew: CreditPersonRef[];
  extras: TitleExtras;
  seasons?: SeasonDetail[];
}) {
  return (
    <TitleAtmosphere backdropUrl={backdropUrl}>
      <article className="motion-fade-rise mx-auto w-full max-w-5xl px-6 pb-24 pt-28 text-left">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:gap-12">
          <div className="min-w-0 flex-1">
            {heading}
            {meta}
            <LibraryActions contentType={contentType} contentId={contentId} />
            {tagline ? (
              <p className="mt-6 text-sm font-semibold tracking-[0.14em] text-muted uppercase">
                {tagline}
              </p>
            ) : null}
            {overview ? (
              <p className="mt-4 max-w-2xl whitespace-pre-wrap text-[1.05rem] leading-relaxed text-foreground/90">
                {overview}
              </p>
            ) : (
              <p className="mt-7 text-sm text-muted">No overview yet.</p>
            )}
            <TitleMetaTabs
              cast={cast}
              crew={crew}
              extras={extras}
              seasons={seasons}
            />
            <MoreLikeThis
              items={extras.similar ?? []}
              kind={contentType === 'tv_show' ? 'tv_show' : 'movie'}
              contentId={contentId}
            />
          </div>
          <div className="mx-auto w-full max-w-[18rem] shrink-0 sm:mx-0 sm:mt-12 sm:w-[18rem]">
            <CatalogPoster url={posterUrl} alt={posterAlt} priority />
            <WhereToWatch providers={extras.watch_providers} title={title} />
          </div>
        </div>
      </article>
    </TitleAtmosphere>
  );
}

export function MovieDetailView({ movie }: { movie: MovieDetail }) {
  const releaseLabel = formatMonthYear(movie.release_date);
  const directors = directorsFromCrew(movie.crew);

  return (
    <TitleDetailShell
      backdropUrl={movie.backdrop_url}
      posterUrl={movie.poster_url}
      posterAlt={`${movie.title} poster`}
      title={movie.title}
      contentId={movie.id}
      contentType={movie.type}
      cast={movie.cast}
      crew={movie.crew}
      extras={movie.extras}
      tagline={movie.extras.tagline}
      heading={
        <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {movie.title}
        </h1>
      }
      meta={
        <TitleMetaRow>
          {releaseLabel ? <span>{releaseLabel}</span> : null}
          {releaseLabel && movie.runtime_minutes != null ? <MetaDot /> : null}
          {movie.runtime_minutes != null ? (
            <span>{movie.runtime_minutes} min</span>
          ) : null}
          {directors.length > 0 ? (
            <>
              {(releaseLabel || movie.runtime_minutes != null) && <MetaDot />}
              <span>
                Directed by <PersonLinks people={directors} />
              </span>
            </>
          ) : null}
        </TitleMetaRow>
      }
      overview={movie.overview}
    />
  );
}

export function TvDetailView({ show }: { show: TvDetail }) {
  const firstAir = formatMonthYear(show.first_air_date);
  const lastAir = formatMonthYear(show.last_air_date);
  const airLabel =
    firstAir && lastAir && firstAir !== lastAir
      ? `${firstAir} – ${lastAir}`
      : firstAir || lastAir;
  const creators = creatorsFromCrew(show.crew);

  return (
    <TitleDetailShell
      backdropUrl={show.backdrop_url}
      posterUrl={show.poster_url}
      posterAlt={`${show.title} poster`}
      title={show.title}
      contentId={show.id}
      contentType={show.type}
      cast={show.cast}
      crew={show.crew}
      extras={show.extras}
      seasons={show.seasons}
      tagline={show.extras.tagline}
      heading={
        <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {show.title}
        </h1>
      }
      meta={
        <TitleMetaRow>
          {airLabel ? <span>{airLabel}</span> : null}
          {airLabel && show.number_of_seasons != null ? <MetaDot /> : null}
          {show.number_of_seasons != null ? (
            <span>
              {show.number_of_seasons} season
              {show.number_of_seasons === 1 ? '' : 's'}
              {show.number_of_episodes != null
                ? ` · ${show.number_of_episodes} episodes`
                : ''}
            </span>
          ) : null}
          {creators.length > 0 ? (
            <>
              {(airLabel || show.number_of_seasons != null) && <MetaDot />}
              <span>
                {creators.every((person) => person.job === 'Creator')
                  ? 'Created by '
                  : 'Directed by '}
                <PersonLinks people={creators} />
              </span>
            </>
          ) : null}
        </TitleMetaRow>
      }
      overview={show.overview}
    />
  );
}

export function PersonDetailView({ person }: { person: PersonDetail }) {
  return (
    <article className="motion-fade-rise relative z-[1] mx-auto w-full max-w-3xl px-6 pb-24 pt-28 text-left">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
        <div className="mx-auto w-full max-w-[14rem] shrink-0 sm:mx-0 sm:mt-6">
          <CatalogPoster url={person.profile_url} alt={person.name} priority />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {person.name}
          </h1>
          <div className="mt-3 space-y-1 text-sm text-muted">
            {person.birthday ? <p>Born {person.birthday}</p> : null}
            {person.deathday ? <p>Died {person.deathday}</p> : null}
            {person.place_of_birth ? <p>{person.place_of_birth}</p> : null}
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
