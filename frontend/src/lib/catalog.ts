import { headers } from 'next/headers';
import { cache } from 'react';

import { upstreamApiBaseUrl } from '@/lib/api';
import {
  applyTrustedClientIpHeaders,
  clientIpFromForwardedFor,
} from '@/lib/trusted-client-headers';

const CATALOG_FETCH_TIMEOUT_MS = 12_000;

export interface CreditPersonRef {
  type: 'person';
  id: string;
  name: string;
  profile_url: string | null;
  character: string | null;
  job: string | null;
  billing_order: number | null;
}

export interface EpisodeDetail {
  id: string;
  episode_number: number;
  name: string | null;
  overview: string | null;
  air_date: string | null;
  runtime_minutes: number | null;
  still_url: string | null;
}

export interface SeasonDetail {
  id: string;
  season_number: number;
  name: string | null;
  overview: string | null;
  air_date: string | null;
  episode_count: number | null;
  poster_url: string | null;
  episodes: EpisodeDetail[];
}

export interface NamedId {
  id: number | null;
  name: string;
}

export interface StudioRef {
  id: number | null;
  name: string;
  origin_country: string | null;
}

export interface CountryRef {
  iso_3166_1: string;
  name: string | null;
}

export interface LanguageRef {
  iso_639_1: string | null;
  english_name: string | null;
  name: string | null;
}

export interface AlternativeTitle {
  iso_3166_1: string | null;
  title: string;
  type: string | null;
}

export interface ReleaseEvent {
  country: string | null;
  release_date: string | null;
  type: number | null;
  certification: string | null;
  note: string | null;
}

export interface VideoRef {
  key: string;
  name: string | null;
  site: string;
  type: string | null;
  official: boolean;
}

export interface MediaGallery {
  backdrops: string[];
  posters: string[];
}

export interface WatchProvider {
  provider_id: number | null;
  provider_name: string;
  logo_url: string | null;
  display_priority: number | null;
}

export interface WatchProviderRegion {
  link: string | null;
  flatrate: WatchProvider[];
  rent: WatchProvider[];
  buy: WatchProvider[];
  ads: WatchProvider[];
  free: WatchProvider[];
}

export interface CollectionRef {
  id: number | null;
  name: string;
  poster_url: string | null;
}

export interface SimilarTitle {
  tmdb_id: number;
  title: string;
  year: number | null;
  poster_url: string | null;
  content_id: string | null;
  content_type: string | null;
}

export interface TitleExtras {
  tagline: string | null;
  original_language: string | null;
  budget: number | null;
  revenue: number | null;
  collection: CollectionRef | null;
  genres: NamedId[];
  keywords: NamedId[];
  studios: StudioRef[];
  /** Present on TV extras; empty/omitted for movies. */
  networks?: StudioRef[];
  /** Typical episode length in minutes (TV). */
  episode_runtime_minutes?: number | null;
  countries: CountryRef[];
  spoken_languages: LanguageRef[];
  alternative_titles: AlternativeTitle[];
  releases: ReleaseEvent[];
  videos: VideoRef[];
  images: MediaGallery;
  watch_providers: Record<string, WatchProviderRegion>;
  similar: SimilarTitle[];
}

export interface MovieDetail {
  type: 'movie';
  id: string;
  title: string;
  original_title: string | null;
  overview: string | null;
  poster_url: string | null;
  backdrop_url: string | null;
  popularity: string | null;
  release_date: string | null;
  runtime_minutes: number | null;
  status: string | null;
  cast: CreditPersonRef[];
  crew: CreditPersonRef[];
  extras: TitleExtras;
}

export interface TvDetail {
  type: 'tv_show';
  id: string;
  title: string;
  original_title: string | null;
  overview: string | null;
  poster_url: string | null;
  backdrop_url: string | null;
  popularity: string | null;
  first_air_date: string | null;
  last_air_date: string | null;
  status: string | null;
  number_of_seasons: number | null;
  number_of_episodes: number | null;
  seasons: SeasonDetail[];
  cast: CreditPersonRef[];
  crew: CreditPersonRef[];
  extras: TitleExtras;
}

export interface PersonCreditRef {
  type: 'movie' | 'tv_show';
  id: string;
  title: string;
  poster_url: string | null;
  credit_kind: string;
  character: string | null;
  job: string | null;
}

export interface PersonDetail {
  type: 'person';
  id: string;
  name: string;
  biography: string | null;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  profile_url: string | null;
  credits: PersonCreditRef[];
}

export type CatalogFetchResult<T> =
  { ok: true; data: T } | { ok: false; status: number; error: string };

async function fetchCatalogJson<T>(
  path: string,
): Promise<CatalogFetchResult<T>> {
  let base: string;
  try {
    base = upstreamApiBaseUrl();
  } catch {
    return { ok: false, status: 0, error: 'API_URL is not configured' };
  }

  try {
    // Avoid sticky Data Cache in local dev so schema/fixture changes show up.
    const res = await fetch(`${base}${path}`, {
      ...(process.env.NODE_ENV === 'development'
        ? { cache: 'no-store' as const }
        : { next: { revalidate: 300 } }),
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(CATALOG_FETCH_TIMEOUT_MS),
    });
    if (res.status === 404) {
      return { ok: false, status: 404, error: 'Not found' };
    }
    if (!res.ok) {
      await res.text().catch(() => undefined);
      return {
        ok: false,
        status: res.status,
        error: `Upstream error (HTTP ${res.status})`,
      };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0, error: 'Catalog request failed' };
  }
}

export interface LandingPoster {
  poster_url: string;
  title: string | null;
}

export interface LandingPostersResponse {
  posters: LandingPoster[];
}

export interface TopMovie {
  tmdb_id: number;
  title: string;
  poster_url: string;
  year: number | null;
}

export interface TopMoviesResponse {
  movies: TopMovie[];
}

export interface TopTvShowsResponse {
  shows: TopMovie[];
}

export interface NowInTheatresResponse {
  movies: TopMovie[];
}

const TMDB_POSTER_URL_RE = /^https:\/\/image\.tmdb\.org\/t\/p\//;

/** Accept + trusted BFF client-IP headers for SSR → API catalog fetches. */
async function catalogUpstreamHeaders(
  extra?: Record<string, string>,
): Promise<Headers> {
  const requestHeaders = new Headers({
    Accept: 'application/json',
    ...extra,
  });
  const incoming = await headers();
  applyTrustedClientIpHeaders(
    requestHeaders,
    clientIpFromForwardedFor(incoming.get('x-forwarded-for')),
  );
  return requestHeaders;
}

/** Shared TMDb top-rated posters for landing / auth atmosphere. */
export async function fetchLandingPosterUrls(): Promise<string[]> {
  let base: string;
  try {
    base = upstreamApiBaseUrl();
  } catch {
    return [];
  }

  try {
    // Shorter revalidate than catalog detail — empty/degraded responses
    // should not stick in the Next Data Cache for five minutes.
    const res = await fetch(`${base}/api/v1/landing/posters`, {
      ...(process.env.NODE_ENV === 'development'
        ? { cache: 'no-store' as const }
        : { next: { revalidate: 60 } }),
      headers: await catalogUpstreamHeaders(),
      signal: AbortSignal.timeout(CATALOG_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      await res.text().catch(() => undefined);
      return [];
    }
    const data = (await res.json()) as LandingPostersResponse;
    return (data.posters ?? [])
      .map((poster) => poster.poster_url)
      .filter((url) => TMDB_POSTER_URL_RE.test(url));
  } catch {
    return [];
  }
}

function isHomeRailTitle(item: TopMovie): boolean {
  return (
    typeof item.tmdb_id === 'number' &&
    item.tmdb_id > 0 &&
    typeof item.title === 'string' &&
    item.title.length > 0 &&
    typeof item.poster_url === 'string' &&
    TMDB_POSTER_URL_RE.test(item.poster_url)
  );
}

async function fetchHomeRailTitles(
  path: string,
  pick: (body: unknown) => TopMovie[] | undefined,
  limit = 12,
): Promise<TopMovie[]> {
  let base: string;
  try {
    base = upstreamApiBaseUrl();
  } catch {
    return [];
  }

  const capped = Math.min(100, Math.max(1, limit));
  try {
    const res = await fetch(`${base}${path}?limit=${capped}`, {
      cache: 'no-store',
      headers: await catalogUpstreamHeaders(),
      signal: AbortSignal.timeout(CATALOG_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      await res.text().catch(() => undefined);
      return [];
    }
    const data: unknown = await res.json();
    return (pick(data) ?? []).filter(isHomeRailTitle);
  } catch {
    return [];
  }
}

/**
 * Shuffled sample from the TMDb top-rated pool for the signed-in home rail.
 * Public/unauthenticated upstream (request-level rate limited); always
 * no-store so each navigation can reshuffle via the API.
 */
export async function fetchTopMovies(limit = 12): Promise<TopMovie[]> {
  return fetchHomeRailTitles(
    '/api/v1/catalog/top-movies',
    (body) => (body as TopMoviesResponse).movies,
    limit,
  );
}

/** Shuffled sample from TMDb top-rated TV for the signed-in home rail. */
export async function fetchTopTvShows(limit = 12): Promise<TopMovie[]> {
  return fetchHomeRailTitles(
    '/api/v1/catalog/top-tv-shows',
    (body) => (body as TopTvShowsResponse).shows,
    limit,
  );
}

/**
 * Most popular movies currently in theatres (TMDb now_playing, popularity
 * order). Same default count as top movies / top TV.
 */
export async function fetchNowInTheatres(limit = 12): Promise<TopMovie[]> {
  return fetchHomeRailTitles(
    '/api/v1/catalog/now-in-theatres',
    (body) => (body as NowInTheatresResponse).movies,
    limit,
  );
}

/** Dedupes generateMetadata + page fetch within one RSC request. */
export const fetchMovie = cache(function fetchMovie(
  id: string,
): Promise<CatalogFetchResult<MovieDetail>> {
  return fetchCatalogJson<MovieDetail>(
    `/api/v1/movies/${encodeURIComponent(id)}`,
  );
});

/** Dedupes generateMetadata + page fetch within one RSC request. */
export const fetchTv = cache(function fetchTv(
  id: string,
): Promise<CatalogFetchResult<TvDetail>> {
  return fetchCatalogJson<TvDetail>(`/api/v1/tv/${encodeURIComponent(id)}`);
});

/** Dedupes generateMetadata + page fetch within one RSC request. */
export const fetchPerson = cache(function fetchPerson(
  id: string,
): Promise<CatalogFetchResult<PersonDetail>> {
  return fetchCatalogJson<PersonDetail>(
    `/api/v1/people/${encodeURIComponent(id)}`,
  );
});

export interface ResolveByTmdbResult {
  id: string;
  type: 'movie' | 'tv_show';
}

const RESOLVE_TIMEOUT_MS = 45_000;

async function resolveByTmdb(
  path: string,
  tmdbId: number,
): Promise<CatalogFetchResult<ResolveByTmdbResult>> {
  let base: string;
  try {
    base = upstreamApiBaseUrl();
  } catch {
    return { ok: false, status: 0, error: 'API_URL is not configured' };
  }

  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      cache: 'no-store',
      headers: await catalogUpstreamHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ tmdb_id: tmdbId }),
      signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
    });
    if (res.status === 404) {
      return { ok: false, status: 404, error: 'Not found' };
    }
    if (!res.ok) {
      await res.text().catch(() => undefined);
      return {
        ok: false,
        status: res.status,
        error: `Upstream error (HTTP ${res.status})`,
      };
    }
    return { ok: true, data: (await res.json()) as ResolveByTmdbResult };
  } catch {
    return { ok: false, status: 0, error: 'Catalog resolve failed' };
  }
}

/** Resolve (and ingest if needed) a TMDb movie into the catalog. */
export function resolveMovieByTmdb(
  tmdbId: number,
): Promise<CatalogFetchResult<ResolveByTmdbResult>> {
  return resolveByTmdb('/api/v1/movies/resolve', tmdbId);
}

/** Resolve (and ingest if needed) a TMDb TV show into the catalog. */
export function resolveTvByTmdb(
  tmdbId: number,
): Promise<CatalogFetchResult<ResolveByTmdbResult>> {
  return resolveByTmdb('/api/v1/tv/resolve', tmdbId);
}
