'use client';

import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { CatalogPoster } from '@/components/catalog-poster';
import type { SeasonDetail } from '@/lib/catalog';
import { MOTION_DURATION_MED_MS } from '@/lib/motion';
import { useScrollFadeX } from '@/lib/scroll-fade';
import { fetchTvSeasonClient } from '@/lib/tv-season';

const MONTH_DAY_YEAR = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatEpisodeDate(iso: string | null | undefined): string | null {
  if (!iso) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) {
    return iso.slice(0, 4);
  }
  return MONTH_DAY_YEAR.format(
    new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    ),
  );
}

function seasonYear(iso: string | null | undefined): string | null {
  if (!iso) {
    return null;
  }
  const year = iso.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

function seasonTabLabel(season: SeasonDetail): string {
  const name = season.name?.trim();
  if (name && !/^season\s+\d+$/i.test(name)) {
    return name;
  }
  return `Season ${season.season_number}`;
}

function SeasonPanel({
  season,
  loadingEpisodes,
}: {
  season: SeasonDetail;
  loadingEpisodes?: boolean;
}) {
  const year = seasonYear(season.air_date);
  const episodeCount =
    season.episode_count ??
    (season.episodes.length > 0 ? season.episodes.length : null);
  const heading = seasonTabLabel(season);

  return (
    <>
      <div className="flex gap-3 sm:gap-4">
        {season.poster_url ? (
          <div className="w-12 shrink-0 sm:w-16">
            <CatalogPoster
              url={season.poster_url}
              alt={`${heading} poster`}
              sizes="(max-width: 640px) 48px, 64px"
            />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-foreground sm:text-base">
            {heading}
          </h3>
          <p className="mt-0.5 text-[length:var(--text-xs)] text-muted sm:text-sm">
            {[
              year,
              episodeCount != null
                ? `${episodeCount} episode${episodeCount === 1 ? '' : 's'}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {season.overview ? (
            <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-[length:var(--text-xs)] text-muted sm:mt-2 sm:line-clamp-4 sm:text-sm">
              {season.overview}
            </p>
          ) : null}
        </div>
      </div>

      {loadingEpisodes ? (
        <p className="mt-3 text-sm text-muted" role="status">
          Loading episodes…
        </p>
      ) : season.episodes.length > 0 ? (
        <ul className="mt-3 space-y-0 text-left text-[0.68rem] leading-none sm:mt-3.5 sm:text-xs sm:leading-snug">
          {season.episodes.map((episode) => {
            const airDate = formatEpisodeDate(episode.air_date);
            return (
              <li
                key={episode.id}
                className="flex h-7 flex-nowrap items-center gap-x-1.5 overflow-hidden border-b border-[var(--color-border)]/60 sm:h-8 sm:gap-x-2"
              >
                <span className="w-7 shrink-0 font-medium tabular-nums text-foreground sm:w-8">
                  E{episode.episode_number}
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {episode.name?.trim() || 'Untitled'}
                </span>
                {airDate ? (
                  <span className="sr-only shrink-0 text-muted sm:not-sr-only sm:inline">
                    {airDate}
                  </span>
                ) : null}
                {episode.runtime_minutes != null ? (
                  <span className="shrink-0 tabular-nums text-muted">
                    {episode.runtime_minutes} min
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">
          No episodes listed for this season yet.
        </p>
      )}
    </>
  );
}

/**
 * Seasons section: horizontally scrollable season tabs + episode list.
 * Detail payload ships stubs + episodes for the default season; other seasons
 * lazy-load episodes when selected.
 */
export function TitleSeasons({
  contentId,
  seasons: initialSeasons,
}: {
  contentId: string;
  seasons: SeasonDetail[];
}) {
  const panelId = useId();
  const tablistRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const skipPanelAnimRef = useRef(true);
  const [seasons, setSeasons] = useState(initialSeasons);
  const [loadingSeasonId, setLoadingSeasonId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState(initialSeasons[0]?.id ?? '');
  const [panelIdState, setPanelIdState] = useState(
    initialSeasons[0]?.id ?? '',
  );
  const panelIdRef = useRef(initialSeasons[0]?.id ?? '');
  const [outgoingId, setOutgoingId] = useState<string | null>(null);
  const [stageHeight, setStageHeight] = useState<number | undefined>();
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [indicatorReady, setIndicatorReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setSeasons(initialSeasons);
    setActiveId(initialSeasons[0]?.id ?? '');
    setPanelIdState(initialSeasons[0]?.id ?? '');
    panelIdRef.current = initialSeasons[0]?.id ?? '';
    setOutgoingId(null);
    setLoadingSeasonId(null);
    // Reset when navigating to another title (not on every parent re-render).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- contentId gate
  }, [contentId]);

  const active =
    seasons.find((season) => season.id === activeId) ?? seasons[0] ?? null;
  const activeIndex = active
    ? seasons.findIndex((season) => season.id === active.id)
    : -1;
  const panelSeason =
    seasons.find((season) => season.id === panelIdState) ?? active;
  const outgoingSeason =
    outgoingId != null
      ? (seasons.find((season) => season.id === outgoingId) ?? null)
      : null;
  const isCrossfading = outgoingId != null;

  useEffect(() => {
    if (active == null) {
      return;
    }
    if (active.episodes.length > 0) {
      return;
    }
    const expectedCount = active.episode_count ?? 0;
    if (expectedCount <= 0) {
      return;
    }

    let cancelled = false;
    const seasonId = active.id;
    const seasonNumber = active.season_number;
    setLoadingSeasonId(seasonId);

    void (async () => {
      const result = await fetchTvSeasonClient(contentId, seasonNumber);
      if (cancelled) {
        return;
      }
      setLoadingSeasonId((current) =>
        current === seasonId ? null : current,
      );
      if (!result.ok) {
        return;
      }
      setSeasons((prev) =>
        prev.map((season) =>
          season.id === seasonId
            ? { ...season, episodes: result.data.episodes }
            : season,
        ),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [active, contentId]);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setReduceMotion(motion.matches);
    };
    sync();
    motion.addEventListener('change', sync);
    return () => {
      motion.removeEventListener('change', sync);
    };
  }, []);

  useScrollFadeX(tablistRef, seasons.length);

  useLayoutEffect(() => {
    const list = tablistRef.current;
    if (!list || !active || activeIndex < 0) {
      return;
    }

    const syncIndicator = () => {
      const tab = tabRefs.current[activeIndex];
      if (!tab) {
        setIndicator({ left: 0, width: 0 });
        return;
      }
      setIndicator({
        left: tab.offsetLeft,
        width: tab.offsetWidth,
      });
      setIndicatorReady(true);
    };

    syncIndicator();

    const tab = tabRefs.current[activeIndex];
    if (tab) {
      const tabLeft = tab.offsetLeft;
      const tabRight = tabLeft + tab.offsetWidth;
      const viewLeft = list.scrollLeft;
      const viewRight = viewLeft + list.clientWidth;
      const pad = 24;
      if (tabLeft < viewLeft + pad) {
        list.scrollTo({ left: Math.max(0, tabLeft - pad), behavior: 'smooth' });
      } else if (tabRight > viewRight - pad) {
        list.scrollTo({
          left: tabRight - list.clientWidth + pad,
          behavior: 'smooth',
        });
      }
    }

    const observer = new ResizeObserver(syncIndicator);
    observer.observe(list);
    for (const button of tabRefs.current) {
      if (button) {
        observer.observe(button);
      }
    }
    window.addEventListener('resize', syncIndicator);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncIndicator);
    };
  }, [active, activeIndex, seasons.length]);

  useEffect(() => {
    if (!active) {
      return;
    }
    if (skipPanelAnimRef.current) {
      skipPanelAnimRef.current = false;
      panelIdRef.current = active.id;
      setPanelIdState(active.id);
      setOutgoingId(null);
      setStageHeight(undefined);
      return;
    }
    if (reduceMotion) {
      panelIdRef.current = active.id;
      setPanelIdState(active.id);
      setOutgoingId(null);
      setStageHeight(undefined);
      return;
    }
    if (active.id === panelIdRef.current) {
      return;
    }

    const previous = panelIdRef.current;
    const fromHeight = stageRef.current?.offsetHeight ?? 0;

    setOutgoingId(previous);
    panelIdRef.current = active.id;
    setPanelIdState(active.id);
    if (fromHeight > 0) {
      setStageHeight(fromHeight);
    }

    let cancelled = false;
    let settleTimer = 0;
    let measureFrame = 0;

    measureFrame = window.requestAnimationFrame(() => {
      measureFrame = window.requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }
        const incoming =
          stageRef.current?.querySelector<HTMLElement>('[role="tabpanel"]');
        const toHeight = incoming?.scrollHeight ?? 0;
        if (toHeight > 0) {
          setStageHeight(toHeight);
        }

        settleTimer = window.setTimeout(() => {
          if (cancelled) {
            return;
          }
          setOutgoingId(null);
          setStageHeight(undefined);
        }, MOTION_DURATION_MED_MS);
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(measureFrame);
      window.clearTimeout(settleTimer);
    };
  }, [active, reduceMotion]);

  if (seasons.length === 0 || !active || !panelSeason) {
    return null;
  }

  function focusTabAt(index: number) {
    const next = seasons[index];
    if (!next) {
      return;
    }
    setActiveId(next.id);
    tabRefs.current[index]?.focus();
  }

  function onTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    const count = seasons.length;
    if (count === 0) {
      return;
    }
    let nextIndex: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        nextIndex = (index + 1) % count;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        nextIndex = (index - 1 + count) % count;
        break;
      case 'Home':
        event.preventDefault();
        nextIndex = 0;
        break;
      case 'End':
        event.preventDefault();
        nextIndex = count - 1;
        break;
      default:
        return;
    }
    focusTabAt(nextIndex);
  }

  function renderSeason(season: SeasonDetail): ReactNode {
    return (
      <SeasonPanel
        season={season}
        loadingEpisodes={
          loadingSeasonId === season.id && season.episodes.length === 0
        }
      />
    );
  }

  return (
    <section className="mt-8 w-full text-left sm:mt-10" aria-label="Seasons">
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Seasons"
        aria-orientation="horizontal"
        className="scroll-fade-x relative flex w-full flex-nowrap items-end gap-4 border-b border-[var(--color-border)] pb-px sm:gap-5"
      >
        {seasons.map((season, index) => {
          const selected = season.id === active.id;
          const label = seasonTabLabel(season);
          const count =
            season.episode_count ??
            (season.episodes.length > 0 ? season.episodes.length : null);
          return (
            <button
              key={season.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={count != null ? `${label}, ${count} episodes` : label}
              tabIndex={selected ? 0 : -1}
              id={`season-tab-${season.id}`}
              aria-controls={panelId}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              onClick={() => {
                setActiveId(season.id);
              }}
              onKeyDown={(event) => {
                onTabKeyDown(event, index);
              }}
              className={`shrink-0 whitespace-nowrap pb-1.5 text-xs font-semibold tracking-[0.03em] transition-colors duration-[var(--duration-med)] sm:pb-2 sm:text-sm sm:tracking-[0.08em] ${
                selected ? 'text-accent' : 'text-muted hover:text-foreground'
              }`}
            >
              {label}
            </button>
          );
        })}
        <span
          aria-hidden
          className="title-tab-indicator pointer-events-none absolute bottom-0 h-0.5 bg-accent"
          style={{
            width: indicator.width,
            transform: `translateX(${indicator.left}px)`,
            opacity: indicatorReady ? 1 : 0,
          }}
        />
      </div>

      <div
        ref={stageRef}
        className={`motion-size title-tab-panel-stage relative mt-4 text-left sm:mt-5${
          stageHeight != null ? ' is-resizing' : ''
        }`}
        style={stageHeight != null ? { height: stageHeight } : undefined}
      >
        {outgoingSeason != null ? (
          <div
            key={`out-${outgoingSeason.id}`}
            className="title-tab-panel title-tab-panel-layer is-outgoing"
            aria-hidden
            inert
          >
            {renderSeason(outgoingSeason)}
          </div>
        ) : null}
        <div
          key={`in-${panelSeason.id}`}
          role="tabpanel"
          id={panelId}
          aria-labelledby={`season-tab-${active.id}`}
          className={`title-tab-panel ${
            isCrossfading ? 'is-incoming' : 'is-active'
          }`}
        >
          {renderSeason(panelSeason)}
        </div>
      </div>
    </section>
  );
}
