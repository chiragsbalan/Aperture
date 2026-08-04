import Link from 'next/link';
import type { ReactNode } from 'react';

import { CatalogPoster } from '@/components/catalog-poster';
import { LibraryActions } from '@/components/library-actions';
import { MoreLikeThis } from '@/components/more-like-this';
import { RecordTitlePosterHero } from '@/components/record-title-poster-hero';
import { SharedTitlePoster } from '@/components/shared-title-poster';
import { TitlePosterFlightTarget } from '@/components/title-poster-flight-target';
import { SiteHeader } from '@/components/site-header';
import { TitleAtmosphere } from '@/components/title-atmosphere';
import { TitleMetaTabs } from '@/components/title-meta-tabs';
import { TitleOverview } from '@/components/title-overview';
import { TitlePosterLink } from '@/components/title-poster-link';
import { TitleSeasons } from '@/components/title-seasons';
import { WhereToWatch } from '@/components/where-to-watch';
import type {
  CreditPersonRef,
  MovieDetail,
  PersonDetail,
  SeasonDetail,
  TitleExtras,
  TvDetail,
} from '@/lib/catalog';
import { POSTER_GRID_SIZES } from '@/lib/poster';

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
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const result: CreditPersonRef[] = [];
  for (const credit of credits) {
    const nameKey = credit.name.trim().toLowerCase();
    if (seenIds.has(credit.id) || (nameKey && seenNames.has(nameKey))) {
      continue;
    }
    seenIds.add(credit.id);
    if (nameKey) {
      seenNames.add(nameKey);
    }
    result.push(credit);
  }
  return result;
}

function directorsFromCrew(crew: CreditPersonRef[]): CreditPersonRef[] {
  return uniquePeople(crew.filter((credit) => credit.job === 'Director'));
}

function creatorsFromCrew(crew: CreditPersonRef[]): CreditPersonRef[] {
  return uniquePeople(crew.filter((credit) => credit.job === 'Creator'));
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

export function CatalogNotFound({ label }: { label: string }) {
  return (
    <div className="layout-content layout-shell-pad-top motion-fade-rise space-y-4 text-center">
      <h1 className="font-display [font-size:var(--text-page)] font-semibold text-foreground">
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
    <div className="layout-content layout-shell-pad-top motion-fade-rise space-y-4 text-center">
      <h1 className="font-display [font-size:var(--text-page)] font-semibold text-foreground">
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
      className="layout-content layout-shell-pad-top motion-fade-in relative z-[1] pb-16 sm:pb-24"
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
  status,
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
  contentType: 'movie' | 'tv_show';
  status: string | null;
  cast: CreditPersonRef[];
  crew: CreditPersonRef[];
  extras: TitleExtras;
  seasons?: SeasonDetail[];
}) {
  const seasonList = seasons ?? [];
  return (
    <TitleAtmosphere backdropUrl={backdropUrl}>
      <RecordTitlePosterHero
        contentId={contentId}
        posterUrl={posterUrl}
        alt={posterAlt}
      />
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative">
        <article className="layout-content layout-shell-pad-top pb-16 text-left sm:pb-24">
          {/*
            Text left + poster right on mobile and desktop; mobile uses a
            compact poster, then full-width body below the hero row.
            On mobile, title + meta stay grouped and are vertically centered
            in the hero band beside the poster (above the description).

            Entrance motion stays on copy only — never on the poster column —
            so a list→detail morph does not get a second translateY nudge when
            the loaded page replaces the loading shell.
          */}
          <div className="grid grid-cols-[minmax(0,1fr)_6.75rem] gap-x-4 gap-y-5 sm:grid-cols-[minmax(0,1fr)_18rem] sm:gap-x-12 sm:gap-y-0">
            <div className="col-start-2 row-span-2 row-start-1 w-full sm:mt-12">
              <TitlePosterFlightTarget contentId={contentId}>
                <SharedTitlePoster
                  key={contentId}
                  contentId={contentId}
                  url={posterUrl}
                  alt={posterAlt}
                  priority
                  sizes="(max-width: 640px) 108px, 288px"
                />
              </TitlePosterFlightTarget>
              <div className="mt-4 hidden sm:block motion-fade-rise">
                <WhereToWatch
                  providers={extras.watch_providers}
                  title={title}
                />
              </div>
            </div>

            <div className="motion-fade-rise col-start-1 row-span-2 row-start-1 flex min-w-0 flex-col justify-center py-0.5 sm:row-span-1 sm:justify-start sm:py-0">
              {heading}
              {meta}
            </div>

            <div className="motion-fade-rise col-span-2 col-start-1 row-start-3 min-w-0 sm:col-span-1 sm:row-start-2 sm:mt-1">
              {tagline ? (
                <p className="type-eyebrow text-muted">{tagline}</p>
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
                contentType={contentType}
                status={status}
              />
              {contentType === 'tv_show' ? (
                <TitleSeasons seasons={seasonList} />
              ) : null}
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
      contentType="movie"
      status={movie.status}
      cast={movie.cast}
      crew={movie.crew}
      extras={movie.extras}
      tagline={movie.extras.tagline}
      heading={<h1 className="type-title text-foreground">{movie.title}</h1>}
      meta={
        <TitleMetaRow>
          {releaseLabel ? <span>{releaseLabel}</span> : null}
          {movie.runtime_minutes != null ? (
            <span>{movie.runtime_minutes} min</span>
          ) : null}
          {directors.length > 0 ? (
            <span>
              Directed by <PersonLinks people={directors} />
            </span>
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
  const episodeRuntime = show.extras.episode_runtime_minutes;
  const statusLabel = show.status?.trim() || null;
  const hasCounts = show.number_of_seasons != null;

  return (
    <TitleDetailShell
      backdropUrl={show.backdrop_url}
      posterUrl={show.poster_url}
      posterAlt={`${show.title} poster`}
      title={show.title}
      contentId={show.id}
      contentType="tv_show"
      status={show.status}
      cast={show.cast}
      crew={show.crew}
      extras={show.extras}
      seasons={show.seasons}
      tagline={show.extras.tagline}
      heading={<h1 className="type-title text-foreground">{show.title}</h1>}
      meta={
        <TitleMetaRow>
          {airLabel ? <span>{airLabel}</span> : null}
          {hasCounts ? (
            <span>
              {show.number_of_seasons} season
              {show.number_of_seasons === 1 ? '' : 's'}
              {show.number_of_episodes != null
                ? ` · ${show.number_of_episodes} episodes`
                : ''}
            </span>
          ) : null}
          {statusLabel ? <span>{statusLabel}</span> : null}
          {episodeRuntime != null ? <span>~{episodeRuntime} min</span> : null}
          {creators.length > 0 ? (
            <span>
              Created by <PersonLinks people={creators} />
            </span>
          ) : null}
        </TitleMetaRow>
      }
      overview={show.overview}
    />
  );
}

export function PersonDetailView({ person }: { person: PersonDetail }) {
  return (
    <article className="layout-content layout-shell-pad-top motion-fade-rise relative z-[1] pb-16 text-left sm:pb-24">
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
          <h1 className="type-title-person text-foreground">{person.name}</h1>
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
          <h2 className="type-subsection text-foreground">Known for</h2>
          <ul className="poster-grid mt-4">
            {person.credits.map((credit) => {
              const href =
                credit.type === 'movie'
                  ? `/movies/${credit.id}`
                  : `/tv/${credit.id}`;
              const creditLabel = `${credit.title} (${credit.character || credit.job || credit.credit_kind})`;
              return (
                <li
                  key={`${credit.id}-${credit.credit_kind}-${credit.job ?? ''}-${credit.character ?? ''}`}
                  className="min-w-0"
                >
                  <TitlePosterLink
                    href={href}
                    contentId={credit.id}
                    posterUrl={credit.poster_url}
                    posterAlt={`${credit.title} poster`}
                    ariaLabel={creditLabel}
                    sizes={POSTER_GRID_SIZES}
                    className="block min-w-0 overflow-hidden transition hover:opacity-90"
                  >
                    <div className="poster-meta">
                      <p className="mt-2 truncate font-display text-sm font-medium text-foreground">
                        {credit.title}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {credit.character || credit.job || credit.credit_kind}
                      </p>
                    </div>
                  </TitlePosterLink>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
