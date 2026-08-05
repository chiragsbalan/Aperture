/**
 * @fileoverview Shared-element identity + arm store for title poster morphs.
 *
 * Product rule: any poster that opens a movie/TV detail page must go through
 * `TitleNavPoster` (or `TitlePosterLink` / `TmdbResolveLink`) so list→detail
 * and Back morphs stay consistent app-wide.
 *
 * Forward morph: click-time FLIP flight (`title-poster-flight.ts`) so the
 * animation works from any surface — including same-route Similar on a title
 * page, where React View Transitions often skip. Cold TMDb clicks push
 * `/movies|tv/tmdb/{id}` immediately with a provisional id via
 * {@link titlePosterProvisionalId} so the loading shell appears under the
 * morph (hover/focus still warms the UUID cache).
 * Browser Back: snapshot the detail hero and FLIP back — see
 * `TitlePosterBackMorph`.
 */

export interface TitlePosterMorphArm {
  contentId: string;
  posterUrl: string | null;
  alt: string;
}

export interface TitlePosterHeroSnapshot {
  contentId: string;
  posterUrl: string | null;
  alt: string;
  rect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

type ResolveKind = 'movie' | 'tv';

const RESOLVED_STORAGE_KEY = 'aperture:title-poster-resolved-v1';
const LAST_MORPH_STORAGE_KEY = 'aperture:title-poster-last-morph-v1';
const HERO_SNAPSHOT_STORAGE_KEY = 'aperture:title-poster-hero-snapshot-v1';

export const TITLE_POSTER_DATA_ATTR = 'data-title-poster';

/** List→hero FLIP duration (keep in sync with flight WAAPI). */
export const TITLE_POSTER_MORPH_MS = 750;

let armed: TitlePosterMorphArm | null = null;

/** tmdb kind:id → catalog content UUID (survives remount for back morph). */
const resolvedContentIds = new Map<string, string>();

/** Per-key listeners so unused links do not re-render on every resolve. */
const resolvedKeyListeners = new Map<string, Set<() => void>>();

let storageHydrated = false;

function resolvedKey(kind: ResolveKind, tmdbId: number): string {
  return `${kind}:${tmdbId}`;
}

function emitResolvedKey(key: string): void {
  const listeners = resolvedKeyListeners.get(key);
  if (listeners == null) {
    return;
  }
  for (const listener of listeners) {
    listener();
  }
}

function hydrateResolvedFromStorage(): void {
  if (storageHydrated || typeof window === 'undefined') {
    return;
  }
  storageHydrated = true;
  try {
    const raw = window.sessionStorage.getItem(RESOLVED_STORAGE_KEY);
    if (raw == null || raw === '') {
      return;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return;
    }
    for (const row of parsed) {
      if (
        Array.isArray(row) &&
        row.length === 2 &&
        typeof row[0] === 'string' &&
        typeof row[1] === 'string'
      ) {
        resolvedContentIds.set(row[0], row[1]);
      }
    }
  } catch {
    // Ignore quota / parse errors — in-memory map still works for the session.
  }
}

/**
 * Load sessionStorage into the resolved map. Call from subscribe / resolve /
 * remember — never from a pure ``getSnapshot``.
 */
export function ensureResolvedContentIdsHydrated(): void {
  hydrateResolvedFromStorage();
}

function persistResolvedToStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.setItem(
      RESOLVED_STORAGE_KEY,
      JSON.stringify([...resolvedContentIds.entries()]),
    );
  } catch {
    // Ignore quota errors.
  }
}

function persistLastMorph(next: TitlePosterMorphArm): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.setItem(LAST_MORPH_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota errors.
  }
}

/**
 * Share id used before a catalog UUID exists (cold TMDb → `/tmdb/` loading).
 */
export function titlePosterProvisionalId(
  kind: ResolveKind,
  tmdbId: number,
): string {
  return `tmdb-${kind}-${tmdbId}`;
}

export function armTitlePosterMorph(next: TitlePosterMorphArm): void {
  armed = next;
  persistLastMorph(next);
}

export function getArmedTitlePosterMorph(
  contentId: string,
): TitlePosterMorphArm | null {
  if (armed != null && armed.contentId === contentId) {
    return armed;
  }
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(LAST_MORPH_STORAGE_KEY);
    if (raw == null || raw === '') {
      return null;
    }
    const parsed = JSON.parse(raw) as TitlePosterMorphArm;
    if (
      parsed != null &&
      typeof parsed.contentId === 'string' &&
      parsed.contentId === contentId
    ) {
      return {
        contentId: parsed.contentId,
        posterUrl:
          typeof parsed.posterUrl === 'string' || parsed.posterUrl === null
            ? parsed.posterUrl
            : null,
        alt: typeof parsed.alt === 'string' ? parsed.alt : '',
      };
    }
  } catch {
    // Ignore.
  }
  return null;
}

export function clearTitlePosterMorph(contentId?: string): void {
  if (contentId == null || armed?.contentId === contentId) {
    armed = null;
  }
}

export function rememberResolvedContentId(
  kind: ResolveKind,
  tmdbId: number,
  contentId: string,
): void {
  ensureResolvedContentIdsHydrated();
  const key = resolvedKey(kind, tmdbId);
  if (resolvedContentIds.get(key) === contentId) {
    return;
  }
  resolvedContentIds.set(key, contentId);
  persistResolvedToStorage();
  emitResolvedKey(key);
}

/** Pure map read — no sessionStorage hydrate (use with hydrated subscribe). */
export function getResolvedContentId(
  kind: ResolveKind,
  tmdbId: number,
): string | undefined {
  return resolvedContentIds.get(resolvedKey(kind, tmdbId));
}

/**
 * Subscribe to one kind:tmdbId resolve. Hydrates once; unused keys do not
 * notify this listener.
 */
export function subscribeResolvedContentId(
  kind: ResolveKind,
  tmdbId: number,
  listener: () => void,
): () => void {
  ensureResolvedContentIdsHydrated();
  const key = resolvedKey(kind, tmdbId);
  let listeners = resolvedKeyListeners.get(key);
  if (listeners == null) {
    listeners = new Set();
    resolvedKeyListeners.set(key, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      resolvedKeyListeners.delete(key);
    }
  };
}

function parseHeroSnapshot(raw: string): TitlePosterHeroSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as TitlePosterHeroSnapshot;
    if (
      parsed == null ||
      typeof parsed.contentId !== 'string' ||
      parsed.rect == null ||
      typeof parsed.rect.top !== 'number' ||
      typeof parsed.rect.left !== 'number' ||
      typeof parsed.rect.width !== 'number' ||
      typeof parsed.rect.height !== 'number'
    ) {
      return null;
    }
    return {
      contentId: parsed.contentId,
      posterUrl:
        typeof parsed.posterUrl === 'string' || parsed.posterUrl === null
          ? parsed.posterUrl
          : null,
      alt: typeof parsed.alt === 'string' ? parsed.alt : '',
      rect: parsed.rect,
    };
  } catch {
    return null;
  }
}

export function recordTitlePosterHeroSnapshot(
  snapshot: TitlePosterHeroSnapshot,
): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.setItem(
      HERO_SNAPSHOT_STORAGE_KEY,
      JSON.stringify(snapshot),
    );
  } catch {
    // Ignore quota errors.
  }
}

/** Read the Back-morph snapshot without consuming it. */
export function peekTitlePosterHeroSnapshot(): TitlePosterHeroSnapshot | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(HERO_SNAPSHOT_STORAGE_KEY);
    if (raw == null || raw === '') {
      return null;
    }
    return parseHeroSnapshot(raw);
  } catch {
    return null;
  }
}

export function clearTitlePosterHeroSnapshot(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.removeItem(HERO_SNAPSHOT_STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

export function consumeTitlePosterHeroSnapshot(): TitlePosterHeroSnapshot | null {
  const snapshot = peekTitlePosterHeroSnapshot();
  if (snapshot != null) {
    clearTitlePosterHeroSnapshot();
  }
  return snapshot;
}

export function findTitlePosterElement(contentId: string): HTMLElement | null {
  if (typeof document === 'undefined') {
    return null;
  }
  return document.querySelector<HTMLElement>(
    `[${TITLE_POSTER_DATA_ATTR}="${CSS.escape(contentId)}"]`,
  );
}
