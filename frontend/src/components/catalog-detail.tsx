import Link from 'next/link';
import type { ReactNode } from 'react';

import { CatalogPoster } from '@/components/catalog-poster';
import { LibraryActions } from '@/components/library-actions';
import { MoreLikeThis } from '@/components/more-like-this';
import { SiteHeader } from '@/components/site-header';
import { TitleAtmosphere } from '@/components/title-atmosphere';
import { TitleMetaTabs } from '@/components/title-meta-tabs';
import { TitleOverview } from '@/components/title-overview';
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
    <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-xs text-muted sm:mt-3 sm:gap-x-3 sm:text-sm">
      {children}
    </div>
  );
}

function MetaDot() {
  return (
    <span aria-hidden className="text-muted opacity-50">
      ·
    </span>
  );
}

export function CatalogNotFound({ label }: { label: string }) {
  return (
    <div className="motion-fade-rise mx-auto mt-8 max-w-3xl space-y-4 px-6 text-center">
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
    <div className="motion-fade-rise mx-auto mt-8 max-w-3xl space-y-4 px-6 text-center">
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

/**
 * Shared chrome for title unavailable / not-found paths:
 * skip-link → SiteHeader → single ``<main id="main-content">``.
 */
export function CatalogStatusShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell-atmosphere relative min-h-dvh overflow-x-hidden">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative z-[1]">
        {children}
      </main>
    </div>
  );
}

export function CatalogLoading() {
  return (
    <div
      className="motion-fade-in relative z-[1] mx-auto w-full max-w-5xl px-4 pb-16 pt-24 sm:px-6 sm:pb-24 sm:pt-28"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading catalog…</span>
      <div className="grid grid-cols-[minmax(0,1fr)_6.75rem] gap-x-4 gap-y-5 sm:grid-cols-[minmax(0,1fr)_18rem] sm:gap-x-12 sm:gap-y-0">
        <div
          aria-hidden
          className="col-start-2 row-span-2 row-start-1 aspect-[2/3] w-full bg-[var(--color-bg-elevated)] sm:mt-10"
        />
        <div className="col-start-1 row-span-2 row-start-1 flex min-w-0 flex-col justify-center space-y-3 py-0.5 sm:row-span-1 sm:justify-start sm:space-y-4 sm:py-0">
          <div
            aria-hidden
            className="h-8 w-full max-w-[12rem] bg-[var(--color-bg-elevated)] sm:h-10 sm:max-w-md"
          />
          <div
            aria-hidden
            className="h-3 w-28 bg-[var(--color-bg-elevated)] sm:h-4 sm:w-48"
          />
        </div>
        <div
          aria-hidden
          className="col-span-2 col-start-1 row-start-3 space-y-2 sm:col-span-1 sm:row-start-2 sm:mt-8 sm:max-w-2xl"
        >
          <div className="h-3 w-full bg-[var(--color-bg-elevated)] sm:h-4" />
          <div className="h-3 w-11/12 bg-[var(--color-bg-elevated)] sm:h-4" />
          <div className="h-3 w-4/5 bg-[var(--color-bg-elevated)] sm:h-4" />
        </div>
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
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative">
        <article className="motion-fade-rise mx-auto w-full max-w-5xl px-4 pb-16 pt-24 text-left sm:px-6 sm:pb-24 sm:pt-28">
          {/*
            Text left + poster right on mobile and desktop; mobile uses a
            compact poster, then full-width body below the hero row.
            On mobile, title + meta stay grouped and are vertically centered
            in the hero band beside the poster (above the description).
          */}
          <div className="grid grid-cols-[minmax(0,1fr)_6.75rem] gap-x-4 gap-y-5 sm:grid-cols-[minmax(0,1fr)_18rem] sm:gap-x-12 sm:gap-y-0">
            <div className="col-start-2 row-span-2 row-start-1 w-full sm:mt-12">
              <CatalogPoster
                url={posterUrl}
                alt={posterAlt}
                priority
                sizes="(max-width: 640px) 108px, 288px"
              />
              <div className="mt-4 hidden sm:block">
                <WhereToWatch
                  providers={extras.watch_providers}
                  title={title}
                />
              </div>
            </div>

            <div className="col-start-1 row-span-2 row-start-1 flex min-w-0 flex-col justify-center py-0.5 sm:row-span-1 sm:justify-start sm:py-0">
              {heading}
              {meta}
            </div>

            <div className="col-span-2 col-start-1 row-start-3 min-w-0 sm:col-span-1 sm:row-start-2 sm:mt-1">
              {tagline ? (
                <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted uppercase sm:text-sm sm:tracking-[0.14em]">
                  {tagline}
                </p>
              ) : null}
              {overview ? (
                <TitleOverview
                  text={overview}
                  className={tagline ? 'mt-2.5 sm:mt-4' : ''}
                />
              ) : (
                <p
                  className={`text-xs text-muted sm:text-sm ${
                    tagline ? 'mt-2.5 sm:mt-7' : 'sm:mt-7'
                  }`}
                >
                  No overview yet.
                </p>
              )}
              <hr className="title-actions-rule mt-5 border-0 border-t border-[var(--color-border)] sm:mt-6" />
              <LibraryActions contentType={contentType} contentId={contentId} />
              <TitleMetaTabs
                cast={cast}
                crew={crew}
                extras={extras}
                seasons={seasons}
              />
              <div className="sm:hidden">
                <WhereToWatch
                  providers={extras.watch_providers}
                  title={title}
                />
              </div>
              <MoreLikeThis
                items={extras.similar ?? []}
                kind={contentType === 'tv_show' ? 'tv_show' : 'movie'}
                contentId={contentId}
              />
            </div>
          </div>
        </article>
      </main>
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
        <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-foreground sm:text-4xl sm:leading-none md:text-5xl">
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
        <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-foreground sm:text-4xl sm:leading-none md:text-5xl">
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
    <article className="motion-fade-rise relative z-[1] mx-auto w-full max-w-3xl px-4 pb-16 pt-20 text-left sm:px-6 sm:pb-24 sm:pt-28">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
        <div className="mx-auto w-[7.5rem] shrink-0 sm:mx-0 sm:mt-6 sm:w-full sm:max-w-[14rem]">
          <CatalogPoster
            url={person.profile_url}
            alt={person.name}
            priority
            sizes="(max-width: 640px) 120px, 224px"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[1.4rem] font-semibold leading-tight tracking-tight text-foreground sm:text-3xl sm:leading-none md:text-4xl">
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
