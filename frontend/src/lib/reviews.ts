import { apiErrorMessage } from '@/lib/profile';
import type { LibraryContentSummary, LibraryContentType } from '@/lib/library';

export type ReviewSort = 'popular' | 'recent';
export type SpoilerFilter = 'all' | 'no_spoilers';
export type RatingFilter = 'any' | '5' | '4_plus' | '3_plus' | 'below_3';
export type RatingSort = 'highest' | 'lowest' | 'recent';
export type ReviewVote = 1 | -1;

export const TITLE_REVIEWS_INLINE_LIMIT = 5;
export const TITLE_ACTIVITY_PAGE_SIZE = 24;
export const TITLE_ACTIVITY_SIMILAR_LIMIT = 30;

export type ActivityTab = 'reviews' | 'ratings' | 'lists' | 'similar';

const ACTIVITY_TABS: ReadonlySet<string> = new Set([
  'reviews',
  'ratings',
  'lists',
  'similar',
]);

export interface ReviewAuthor {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface TitleReview {
  id: string;
  rating: number;
  contains_spoilers: boolean;
  watched_at: string;
  like_count: number;
  dislike_count: number;
  score: number;
  author: ReviewAuthor;
  viewer_vote: ReviewVote | null;
  content?: LibraryContentSummary | null;
  note?: string | null;
}

export interface ReviewsPage {
  page: number;
  limit: number;
  total: number;
  items: TitleReview[];
}

export interface TitleRating {
  rating: number;
  watched_at: string;
  author: ReviewAuthor;
}

export interface TitleRatingsPage {
  page: number;
  limit: number;
  total: number;
  items: TitleRating[];
}

export interface TitlePublicList {
  id: string;
  title: string;
  visibility: 'public';
  updated_at: string;
  owner: ReviewAuthor;
}

export interface TitlePublicListsPage {
  page: number;
  limit: number;
  total: number;
  items: TitlePublicList[];
}

type ApiError = { ok: false; status: number; error: string };

export const REVIEW_SORT_OPTIONS: ReadonlyArray<{
  value: ReviewSort;
  label: string;
}> = [
  { value: 'popular', label: 'Popular' },
  { value: 'recent', label: 'Recent' },
];

export const REVIEW_SPOILER_OPTIONS: ReadonlyArray<{
  value: SpoilerFilter;
  label: string;
}> = [
  { value: 'all', label: 'All reviews' },
  { value: 'no_spoilers', label: 'Hide spoilers' },
];

export const REVIEW_RATING_OPTIONS: ReadonlyArray<{
  value: RatingFilter;
  label: string;
}> = [
  { value: 'any', label: 'Any rating' },
  { value: '5', label: '5 stars' },
  { value: '4_plus', label: '4 and up' },
  { value: '3_plus', label: '3 and up' },
  { value: 'below_3', label: 'Below 3' },
];

export const RATING_SORT_OPTIONS: ReadonlyArray<{
  value: RatingSort;
  label: string;
}> = [
  { value: 'highest', label: 'Highest' },
  { value: 'lowest', label: 'Lowest' },
  { value: 'recent', label: 'Recent' },
];

export function defaultSpoilerFilter(
  spoilers: 'show' | 'hide' | null,
): SpoilerFilter {
  return spoilers === 'show' ? 'all' : 'no_spoilers';
}

export function formatReviewScore(score: number): string {
  return String(score);
}

function reviewsQuery(params: {
  page: number;
  limit: number;
  sort: ReviewSort;
  spoilerFilter: SpoilerFilter;
  ratingFilter: RatingFilter;
  includeNoteIds?: string[];
}): string {
  const search = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    sort: params.sort,
    spoiler_filter: params.spoilerFilter,
    rating_filter: params.ratingFilter,
  });
  for (const id of params.includeNoteIds ?? []) {
    search.append('include_note_ids', id);
  }
  return search.toString();
}

async function parseReviewsResponse(
  res: Response,
  fallback: string,
): Promise<{ ok: true; data: ReviewsPage } | ApiError> {
  if (!res.ok) {
    let message = fallback;
    try {
      message = apiErrorMessage(await res.json(), fallback);
    } catch {
      // Keep fallback when the body is not JSON.
    }
    return { ok: false, status: res.status, error: message };
  }
  return { ok: true, data: (await res.json()) as ReviewsPage };
}

export async function fetchTitleReviews(
  kind: LibraryContentType,
  contentId: string,
  params: {
    page?: number;
    limit?: number;
    sort?: ReviewSort;
    spoilerFilter?: SpoilerFilter;
    ratingFilter?: RatingFilter;
    includeNoteIds?: string[];
  } = {},
): Promise<{ ok: true; data: ReviewsPage } | ApiError> {
  const path = kind === 'tv' ? 'tv' : 'movies';
  const query = reviewsQuery({
    page: params.page ?? 1,
    limit: params.limit ?? TITLE_REVIEWS_INLINE_LIMIT,
    sort: params.sort ?? 'popular',
    spoilerFilter: params.spoilerFilter ?? 'all',
    ratingFilter: params.ratingFilter ?? 'any',
    includeNoteIds: params.includeNoteIds,
  });
  const res = await fetch(
    `/api/proxy/api/v1/${path}/${encodeURIComponent(contentId)}/reviews?${query}`,
    { cache: 'no-store' },
  );
  return parseReviewsResponse(res, 'Could not load reviews.');
}

function catalogPath(kind: LibraryContentType): 'movies' | 'tv' {
  return kind === 'tv' ? 'tv' : 'movies';
}

async function parseApiError(
  res: Response,
  fallback: string,
): Promise<ApiError> {
  let message = fallback;
  try {
    message = apiErrorMessage(await res.json(), fallback);
  } catch {
    // Keep fallback when the body is not JSON.
  }
  return { ok: false, status: res.status, error: message };
}

export async function fetchTitleReview(
  kind: LibraryContentType,
  contentId: string,
  entryId: string,
): Promise<{ ok: true; review: TitleReview } | ApiError> {
  const path = catalogPath(kind);
  const res = await fetch(
    `/api/proxy/api/v1/${path}/${encodeURIComponent(contentId)}/reviews/${encodeURIComponent(entryId)}`,
    { cache: 'no-store' },
  );
  if (!res.ok) {
    return parseApiError(res, 'Could not load this review.');
  }
  return { ok: true, review: (await res.json()) as TitleReview };
}

export async function fetchTitleRatings(
  kind: LibraryContentType,
  contentId: string,
  params: {
    page?: number;
    limit?: number;
    sort?: RatingSort;
  } = {},
): Promise<{ ok: true; data: TitleRatingsPage } | ApiError> {
  const path = catalogPath(kind);
  const search = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? TITLE_ACTIVITY_PAGE_SIZE),
    sort: params.sort ?? 'highest',
  });
  const res = await fetch(
    `/api/proxy/api/v1/${path}/${encodeURIComponent(contentId)}/ratings?${search}`,
    { cache: 'no-store' },
  );
  if (!res.ok) {
    return parseApiError(res, 'Could not load ratings.');
  }
  return { ok: true, data: (await res.json()) as TitleRatingsPage };
}

export async function fetchTitleLists(
  kind: LibraryContentType,
  contentId: string,
  params: { page?: number; limit?: number } = {},
): Promise<{ ok: true; data: TitlePublicListsPage } | ApiError> {
  const path = catalogPath(kind);
  const search = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? TITLE_ACTIVITY_PAGE_SIZE),
  });
  const res = await fetch(
    `/api/proxy/api/v1/${path}/${encodeURIComponent(contentId)}/lists?${search}`,
    { cache: 'no-store' },
  );
  if (!res.ok) {
    return parseApiError(res, 'Could not load lists.');
  }
  return { ok: true, data: (await res.json()) as TitlePublicListsPage };
}

export function parseActivityTab(
  value: string | null | undefined,
): ActivityTab {
  if (value != null && ACTIVITY_TABS.has(value)) {
    return value as ActivityTab;
  }
  return 'reviews';
}

export function activityHref(
  kind: LibraryContentType,
  contentId: string,
  tab: ActivityTab = 'reviews',
): string {
  const path = catalogPath(kind);
  const base = `/${path}/${encodeURIComponent(contentId)}/activity`;
  if (tab === 'reviews') {
    return base;
  }
  return `${base}?tab=${tab}`;
}

export function mergeReview(
  items: TitleReview[],
  next: TitleReview,
): TitleReview[] {
  return items.map((row) => {
    if (row.id !== next.id) {
      return row;
    }
    const merged: TitleReview = { ...row, ...next };
    if (next.note === undefined && row.note != null) {
      merged.note = row.note;
    }
    return merged;
  });
}

export async function fetchUserReviews(
  username: string,
  params: {
    page?: number;
    limit?: number;
    sort?: ReviewSort;
    spoilerFilter?: SpoilerFilter;
    ratingFilter?: RatingFilter;
    includeNoteIds?: string[];
  } = {},
): Promise<{ ok: true; data: ReviewsPage } | ApiError> {
  const query = reviewsQuery({
    page: params.page ?? 1,
    limit: params.limit ?? 24,
    sort: params.sort ?? 'recent',
    spoilerFilter: params.spoilerFilter ?? 'all',
    ratingFilter: params.ratingFilter ?? 'any',
    includeNoteIds: params.includeNoteIds,
  });
  const res = await fetch(
    `/api/proxy/api/v1/users/${encodeURIComponent(username)}/reviews?${query}`,
    { cache: 'no-store' },
  );
  return parseReviewsResponse(res, 'Could not load reviews.');
}

export async function putReviewVote(
  entryId: string,
  vote: ReviewVote | null,
): Promise<{ ok: true; review: TitleReview } | ApiError> {
  const res = await fetch(
    `/api/proxy/api/v1/me/watch-entries/${encodeURIComponent(entryId)}/vote`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote }),
    },
  );
  if (!res.ok) {
    let message = 'Could not save vote.';
    try {
      message = apiErrorMessage(await res.json(), message);
    } catch {
      // Keep fallback.
    }
    return { ok: false, status: res.status, error: message };
  }
  return { ok: true, review: (await res.json()) as TitleReview };
}

export async function fetchSpoilerPreference(): Promise<
  'show' | 'hide' | null
> {
  const res = await fetch('/api/proxy/api/v1/users/me/preferences', {
    cache: 'no-store',
  });
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as { spoilers?: string };
  return data.spoilers === 'hide' ? 'hide' : 'show';
}

export interface LogWatchDraft {
  watchedAt: string;
  note: string;
  rating: number | null;
  containsSpoilers: boolean;
}

function logDraftKey(type: string, contentId: string): string {
  return `aperture:log-draft:${type}:${contentId}`;
}

export function readLogWatchDraft(
  type: string,
  contentId: string,
): LogWatchDraft | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(logDraftKey(type, contentId));
    if (raw == null || raw === '') {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<LogWatchDraft>;
    if (
      typeof parsed.watchedAt !== 'string' ||
      typeof parsed.note !== 'string'
    ) {
      return null;
    }
    return {
      watchedAt: parsed.watchedAt,
      note: parsed.note,
      rating: typeof parsed.rating === 'number' ? parsed.rating : null,
      containsSpoilers: parsed.containsSpoilers === true,
    };
  } catch {
    return null;
  }
}

export function writeLogWatchDraft(
  type: string,
  contentId: string,
  draft: LogWatchDraft,
): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.setItem(
    logDraftKey(type, contentId),
    JSON.stringify(draft),
  );
}

export function clearLogWatchDraft(type: string, contentId: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.removeItem(logDraftKey(type, contentId));
  window.sessionStorage.removeItem(logDraftRestoreKey(type, contentId));
}

function logDraftRestoreKey(type: string, contentId: string): string {
  return `aperture:log-draft-restore:${type}:${contentId}`;
}

/** Mark a guest draft so the log sheet reopens after same-tab login. */
export function markLogWatchDraftForRestore(
  type: string,
  contentId: string,
): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.setItem(logDraftRestoreKey(type, contentId), '1');
}

/** True once when a guest draft should reopen the log sheet after login. */
export function consumeLogWatchDraftRestore(
  type: string,
  contentId: string,
): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const key = logDraftRestoreKey(type, contentId);
  const marked = window.sessionStorage.getItem(key) === '1';
  if (marked) {
    window.sessionStorage.removeItem(key);
  }
  return marked;
}
