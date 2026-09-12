import Link from 'next/link';
import type { ReactNode } from 'react';

import { LibraryActions } from '@/components/library-actions';
import { MoreLikeThis } from '@/components/more-like-this';
import { RecordTitlePosterHero } from '@/components/record-title-poster-hero';
import { SharedTitlePoster } from '@/components/shared-title-poster';
import { DetailHeroSkeleton } from '@/components/skeleton';
import { TitlePosterFlightTarget } from '@/components/title-poster-flight-target';
import { SiteHeader } from '@/components/site-header';
import { TitleAtmosphere } from '@/components/title-atmosphere';
import { TitleMetaRow, TitleMetaStack } from '@/components/title-meta-stack';
import { TitleMetaTabs } from '@/components/title-meta-tabs';
import { TitleOverview } from '@/components/title-overview';
import { TitleScore } from '@/components/title-score';
import { TitleSeasons } from '@/components/title-seasons';
import { WhereToWatch } from '@/components/where-to-watch';
import type {
  CreditPersonRef,
  MovieDetail,
  SeasonDetail,
  TitleExtras,
  TitleRating,
  TvDetail,
} from '@/lib/catalog';
import { formatIsoMonthYear } from '@/lib/iso_date';
import { formatTvStatusLabel } from '@/lib/tv-status';

export { PersonDetailView } from '@/components/person-detail-view';

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
  return <DetailHeroSkeleton />;
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
  rating,
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
  rating?: TitleRating | null;
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
          <div className="catalog-detail-hero">
            <div className="catalog-detail-hero-art">
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

            <div className="motion-fade-rise catalog-detail-hero-heading">
              {heading}
              {meta}
            </div>

            <div className="motion-fade-rise catalog-detail-hero-body">
              {rating != null ? <TitleScore rating={rating} /> : null}
              {tagline ? (
                <p
                  className={`type-eyebrow text-muted${
                    rating != null ? ' mt-3 sm:mt-4' : ''
                  }`}
                >
                  {tagline}
                </p>
              ) : null}
              {overview ? (
                <TitleOverview
                  text={overview}
                  className={tagline || rating != null ? 'mt-2.5 sm:mt-4' : ''}
                />
              ) : (
                <p
                  className={`text-xs text-muted sm:text-sm ${
                    tagline || rating != null ? 'mt-2.5 sm:mt-7' : 'sm:mt-7'
                  }`}
                >
                  No overview yet.
                </p>
              )}
              <hr className="title-actions-rule" />
              <LibraryActions contentType={contentType} contentId={contentId} />
              <TitleMetaTabs
                cast={cast}
                crew={crew}
                extras={extras}
                contentType={contentType}
                status={status}
              />
              {contentType === 'tv_show' ? (
                <TitleSeasons contentId={contentId} seasons={seasonList} />
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
  const releaseLabel = formatIsoMonthYear(movie.release_date);
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
      rating={movie.rating}
      heading={<h1 className="type-title text-foreground">{movie.title}</h1>}
      meta={
        <TitleMetaStack>
          {releaseLabel || movie.runtime_minutes != null ? (
            <TitleMetaRow>
              {releaseLabel ? <span>{releaseLabel}</span> : null}
              {movie.runtime_minutes != null ? (
                <span>{movie.runtime_minutes} min</span>
              ) : null}
            </TitleMetaRow>
          ) : null}
          {directors.length > 0 ? (
            <TitleMetaRow>
              <span>
                Directed by <PersonLinks people={directors} />
              </span>
            </TitleMetaRow>
          ) : null}
        </TitleMetaStack>
      }
      overview={movie.overview}
    />
  );
}

export function TvDetailView({ show }: { show: TvDetail }) {
  const firstAir = formatIsoMonthYear(show.first_air_date);
  const lastAir = formatIsoMonthYear(show.last_air_date);
  const airLabel =
    firstAir && lastAir && firstAir !== lastAir
      ? `${firstAir} – ${lastAir}`
      : firstAir || lastAir;
  const creators = creatorsFromCrew(show.crew);
  const episodeRuntime = show.extras.episode_runtime_minutes;
  const statusLabel = formatTvStatusLabel(show.status);
  const hasSeasons = show.number_of_seasons != null;
  const hasEpisodes = show.number_of_episodes != null;
  const hasPrimaryMeta =
    airLabel != null || hasSeasons || episodeRuntime != null;
  const hasEpisodeStatusRow = hasEpisodes || statusLabel != null;

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
      rating={show.rating}
      heading={<h1 className="type-title text-foreground">{show.title}</h1>}
      meta={
        <TitleMetaStack>
          {hasPrimaryMeta ? (
            <TitleMetaRow>
              {airLabel ? <span>{airLabel}</span> : null}
              {hasSeasons ? (
                <span>
                  {show.number_of_seasons} season
                  {show.number_of_seasons === 1 ? '' : 's'}
                </span>
              ) : null}
              {episodeRuntime != null ? (
                <span>~{episodeRuntime} min</span>
              ) : null}
            </TitleMetaRow>
          ) : null}
          {hasEpisodeStatusRow ? (
            <TitleMetaRow>
              {hasEpisodes ? (
                <span>
                  {show.number_of_episodes} episode
                  {show.number_of_episodes === 1 ? '' : 's'}
                </span>
              ) : null}
              {statusLabel ? <span>{statusLabel}</span> : null}
            </TitleMetaRow>
          ) : null}
          {creators.length > 0 ? (
            <TitleMetaRow>
              <span>
                Created by <PersonLinks people={creators} />
              </span>
            </TitleMetaRow>
          ) : null}
        </TitleMetaStack>
      }
      overview={show.overview}
    />
  );
}
