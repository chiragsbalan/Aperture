import { upstreamApiBaseUrl } from '@/lib/api';

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
    const res = await fetch(`${base}${path}`, {
      next: { revalidate: 300 },
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
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, error: 'Failed to reach the API' };
  }
}

export function fetchMovie(
  id: string,
): Promise<CatalogFetchResult<MovieDetail>> {
  return fetchCatalogJson<MovieDetail>(
    `/api/v1/movies/${encodeURIComponent(id)}`,
  );
}

export function fetchTv(id: string): Promise<CatalogFetchResult<TvDetail>> {
  return fetchCatalogJson<TvDetail>(`/api/v1/tv/${encodeURIComponent(id)}`);
}

export function fetchPerson(
  id: string,
): Promise<CatalogFetchResult<PersonDetail>> {
  return fetchCatalogJson<PersonDetail>(
    `/api/v1/people/${encodeURIComponent(id)}`,
  );
}
