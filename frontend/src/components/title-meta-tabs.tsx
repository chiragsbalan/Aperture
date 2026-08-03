'use client';

import Link from 'next/link';
import {
  Fragment,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { CreditPersonRef, SeasonDetail, TitleExtras } from '@/lib/catalog';
import { MOTION_DURATION_MED_MS } from '@/lib/motion';

type MetaTab = 'cast' | 'crew' | 'details' | 'genres' | 'releases' | 'seasons';

const RELEASE_TYPE_LABELS: Record<number, string> = {
  1: 'Premiere',
  2: 'Theatrical (limited)',
  3: 'Theatrical',
  4: 'Digital',
  5: 'Physical',
  6: 'TV',
};

/** Mobile 2-col × 3 rows, last cell = toggle → 5 credits. Desktop 3-col × 3 → 8. */
const CREDIT_PREVIEW_MOBILE = 5;
const CREDIT_PREVIEW_DESKTOP = 8;
/** Themes: 2-col × 5 rows → 9; desktop 3-col × 5 → 14. */
const THEME_PREVIEW_MOBILE = 9;
const THEME_PREVIEW_DESKTOP = 14;

function CreditPill({ credit }: { credit: CreditPersonRef }) {
  const detail = credit.character ?? credit.job;
  return (
    <Link
      href={`/people/${credit.id}`}
      className="group inline-flex max-w-full items-baseline gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-2 py-1 text-[length:var(--text-xs)] text-foreground transition hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] sm:gap-1.5 sm:px-2.5 sm:py-1.5 sm:text-[length:var(--text-sm)]"
      title={detail ? `${credit.name} — ${detail}` : credit.name}
    >
      <span className="truncate">{credit.name}</span>
      {detail ? (
        <span className="truncate text-xs text-muted group-hover:text-foreground">
          {detail}
        </span>
      ) : null}
    </Link>
  );
}

function TogglePill({
  expanded,
  remaining,
  onToggle,
}: {
  expanded: boolean;
  remaining: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className="inline-flex max-w-full items-baseline gap-1 rounded-[var(--radius-sm)] border border-[var(--color-fg)]/35 bg-[var(--color-fg)]/18 px-2 py-1 text-xs font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-[var(--color-fg)]/50 hover:bg-[var(--color-fg)]/26 sm:gap-1.5 sm:px-2.5 sm:py-1.5 sm:text-sm"
    >
      {expanded ? 'Show less' : `Show all (+${remaining})`}
    </button>
  );
}

function useDesktopPreview(mobileCount: number, desktopCount: number): number {
  const [count, setCount] = useState(mobileCount);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const sync = () => {
      setCount(mq.matches ? desktopCount : mobileCount);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => {
      mq.removeEventListener('change', sync);
    };
  }, [mobileCount, desktopCount]);
  return count;
}

function CreditPillList({ credits }: { credits: CreditPersonRef[] }) {
  const [expanded, setExpanded] = useState(false);
  const previewCount = useDesktopPreview(
    CREDIT_PREVIEW_MOBILE,
    CREDIT_PREVIEW_DESKTOP,
  );
  const needsToggle = credits.length > previewCount;
  const visible =
    expanded || !needsToggle ? credits : credits.slice(0, previewCount);
  const remaining = credits.length - previewCount;

  return (
    <ul className="flex flex-wrap justify-start gap-2">
      {visible.map((credit) => (
        <li
          key={`${credit.id}-${credit.character ?? ''}-${credit.job ?? ''}-${credit.billing_order ?? ''}`}
          className="min-w-0 max-w-full"
        >
          <CreditPill credit={credit} />
        </li>
      ))}
      {needsToggle ? (
        <li className="min-w-0 max-w-full">
          <TogglePill
            expanded={expanded}
            remaining={remaining}
            onToggle={() => {
              setExpanded((value) => !value);
            }}
          />
        </li>
      ) : null}
    </ul>
  );
}

function Pill({ children }: { children: string }) {
  return (
    <span className="inline-flex max-w-full truncate rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-2 py-1 text-[length:var(--text-xs)] text-foreground sm:px-2.5 sm:py-1.5 sm:text-[length:var(--text-sm)]">
      {children}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-foreground">{value}</dd>
    </>
  );
}

function DetailsList({ extras }: { extras: TitleExtras }) {
  const rows: Array<{ key: string; node: ReactNode }> = [];

  if (extras.studios.length > 0) {
    rows.push({
      key: 'studios',
      node: (
        <DetailRow
          label="Studios"
          value={extras.studios.map((s) => s.name).join(', ')}
        />
      ),
    });
  }
  if (extras.countries.length > 0) {
    rows.push({
      key: 'countries',
      node: (
        <DetailRow
          label="Countries"
          value={extras.countries.map((c) => c.name || c.iso_3166_1).join(', ')}
        />
      ),
    });
  }
  if (extras.original_language) {
    rows.push({
      key: 'language',
      node: (
        <DetailRow
          label="Primary language"
          value={extras.original_language.toUpperCase()}
        />
      ),
    });
  }
  if (extras.spoken_languages.length > 0) {
    rows.push({
      key: 'spoken',
      node: (
        <DetailRow
          label="Spoken languages"
          value={extras.spoken_languages
            .map((l) => l.english_name || l.name || l.iso_639_1 || '')
            .filter(Boolean)
            .join(', ')}
        />
      ),
    });
  }
  if (extras.collection) {
    rows.push({
      key: 'collection',
      node: <DetailRow label="Collection" value={extras.collection.name} />,
    });
  }
  if (formatMoney(extras.budget)) {
    rows.push({
      key: 'budget',
      node: <DetailRow label="Budget" value={formatMoney(extras.budget)!} />,
    });
  }
  if (formatMoney(extras.revenue)) {
    rows.push({
      key: 'revenue',
      node: <DetailRow label="Revenue" value={formatMoney(extras.revenue)!} />,
    });
  }
  if (extras.alternative_titles.length > 0) {
    rows.push({
      key: 'alts',
      node: (
        <>
          <dt className="text-muted">Alternative titles</dt>
          <dd className="min-w-0">
            <ul className="flex flex-wrap gap-2">
              {extras.alternative_titles.map((title) => (
                <li key={`${title.iso_3166_1}-${title.title}`}>
                  <Pill>
                    {title.iso_3166_1
                      ? `${title.title} (${title.iso_3166_1})`
                      : title.title}
                  </Pill>
                </li>
              ))}
            </ul>
          </dd>
        </>
      ),
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">No additional details available.</p>
    );
  }

  return (
    <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-3 text-left text-xs sm:grid-cols-[10rem_1fr] sm:gap-x-3 sm:text-sm">
      {rows.map((row) => (
        <Fragment key={row.key}>{row.node}</Fragment>
      ))}
    </dl>
  );
}

function ThemePillList({
  keywords,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: {
  keywords: TitleExtras['keywords'];
  'aria-label'?: string;
  'aria-labelledby'?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const previewCount = useDesktopPreview(
    THEME_PREVIEW_MOBILE,
    THEME_PREVIEW_DESKTOP,
  );
  const needsToggle = keywords.length > previewCount;
  const visible =
    expanded || !needsToggle ? keywords : keywords.slice(0, previewCount);
  const remaining = keywords.length - previewCount;

  return (
    <ul
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className="flex flex-wrap justify-start gap-2"
    >
      {visible.map((keyword) => (
        <li
          key={`${keyword.id}-${keyword.name}`}
          className="min-w-0 max-w-full"
        >
          <Pill>{keyword.name}</Pill>
        </li>
      ))}
      {needsToggle ? (
        <li className="min-w-0 max-w-full">
          <TogglePill
            expanded={expanded}
            remaining={remaining}
            onToggle={() => {
              setExpanded((value) => !value);
            }}
          />
        </li>
      ) : null}
    </ul>
  );
}

function formatMoney(amount: number | null | undefined): string | null {
  if (amount == null || amount <= 0) {
    return null;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatReleaseDate(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) {
    return iso;
  }
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

const REGION_NAMES =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

function countryDisplayName(code: string | null | undefined): string {
  if (!code) {
    return 'Unknown';
  }
  return REGION_NAMES?.of(code.toUpperCase()) ?? code;
}

function CountryFlag({ code }: { code: string | null | undefined }) {
  if (!code || code.length !== 2) {
    return (
      <span
        aria-hidden
        className="inline-block h-3.5 w-3.5 shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-border)] sm:h-4 sm:w-4"
      />
    );
  }
  const iso = code.toLowerCase();
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny flag CDN asset
    <img
      src={`https://flagcdn.com/w40/${iso}.png`}
      alt=""
      width={16}
      height={16}
      className="h-3.5 w-3.5 shrink-0 rounded-[var(--radius-pill)] object-cover ring-1 ring-[var(--color-border)] sm:h-4 sm:w-4"
      loading="lazy"
    />
  );
}

/**
 * Tabbed metadata for title detail pages.
 */
export function TitleMetaTabs({
  cast,
  crew,
  extras,
  seasons,
}: {
  cast: CreditPersonRef[];
  crew: CreditPersonRef[];
  extras: TitleExtras;
  seasons?: SeasonDetail[];
}) {
  const seasonList = seasons ?? [];
  const tabs = useMemo(() => {
    const items: Array<{
      id: MetaTab;
      label: string;
      count?: number;
      ariaLabel?: string;
    }> = [];
    if (cast.length > 0) {
      items.push({ id: 'cast', label: 'CAST', count: cast.length });
    }
    if (crew.length > 0) {
      items.push({ id: 'crew', label: 'CREW', count: crew.length });
    }
    items.push({ id: 'details', label: 'DETAILS' });
    if (extras.genres.length > 0 || extras.keywords.length > 0) {
      const genreCount = extras.genres.length;
      const themeCount = extras.keywords.length;
      if (genreCount > 0 && themeCount > 0) {
        items.push({
          id: 'genres',
          label: 'GENRES & THEMES',
          ariaLabel: `Genres and themes, ${genreCount} genres, ${themeCount} themes`,
        });
      } else if (genreCount > 0) {
        items.push({
          id: 'genres',
          label: 'GENRES',
          count: genreCount,
        });
      } else {
        items.push({
          id: 'genres',
          label: 'THEMES',
          count: themeCount,
        });
      }
    }
    if (extras.releases.length > 0) {
      items.push({
        id: 'releases',
        label: 'RELEASES',
        count: extras.releases.length,
      });
    }
    if (seasonList.length > 0) {
      items.push({
        id: 'seasons',
        label: 'SEASONS',
        count: seasonList.length,
      });
    }
    return items;
  }, [cast.length, crew.length, extras, seasonList.length]);

  const panelId = useId();
  const themesHeadingId = useId();
  const [tab, setTab] = useState<MetaTab>(tabs[0]?.id ?? 'details');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tablistRef = useRef<HTMLDivElement | null>(null);
  const active = tabs.some((item) => item.id === tab)
    ? tab
    : (tabs[0]?.id ?? 'details');
  const [panelTab, setPanelTab] = useState<MetaTab>(active);
  const [outgoingTab, setOutgoingTab] = useState<MetaTab | null>(null);
  /** Fixed stage height while crossfading so content below eases with the panel. */
  const [stageHeight, setStageHeight] = useState<number | undefined>();
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [indicatorReady, setIndicatorReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const skipPanelAnimRef = useRef(true);
  const panelTabRef = useRef<MetaTab>(active);
  const stageRef = useRef<HTMLDivElement | null>(null);

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

  useLayoutEffect(() => {
    const list = tablistRef.current;
    if (!list) {
      return;
    }

    const syncIndicator = () => {
      const activeIndex = tabs.findIndex((item) => item.id === active);
      const activeTab = tabRefs.current[activeIndex];
      if (!activeTab) {
        setIndicator({ left: 0, width: 0 });
        return;
      }
      setIndicator({
        left: activeTab.offsetLeft,
        width: activeTab.offsetWidth,
      });
      setIndicatorReady(true);
    };

    syncIndicator();
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
  }, [active, tabs]);

  useEffect(() => {
    if (skipPanelAnimRef.current) {
      skipPanelAnimRef.current = false;
      panelTabRef.current = active;
      setPanelTab(active);
      setOutgoingTab(null);
      setStageHeight(undefined);
      return;
    }
    if (reduceMotion) {
      panelTabRef.current = active;
      setPanelTab(active);
      setOutgoingTab(null);
      setStageHeight(undefined);
      return;
    }
    if (active === panelTabRef.current) {
      return;
    }

    const previous = panelTabRef.current;
    const fromHeight = stageRef.current?.offsetHeight ?? 0;

    setOutgoingTab(previous);
    panelTabRef.current = active;
    setPanelTab(active);
    if (fromHeight > 0) {
      setStageHeight(fromHeight);
    }

    let cancelled = false;
    let settleTimer = 0;
    let measureFrame = 0;

    // Paint locked height, then measure the incoming panel and ease to it.
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
          setOutgoingTab(null);
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

  if (tabs.length === 0) {
    return null;
  }

  const sortedReleases = [...extras.releases].sort((a, b) => {
    const left = a.release_date ?? '';
    const right = b.release_date ?? '';
    if (left !== right) {
      return left.localeCompare(right);
    }
    return (a.country ?? '').localeCompare(b.country ?? '');
  });

  function focusTabAt(index: number) {
    const next = tabs[index];
    if (!next) {
      return;
    }
    setTab(next.id);
    tabRefs.current[index]?.focus();
  }

  function onTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    const count = tabs.length;
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

  function renderPanel(panel: MetaTab): ReactNode {
    if (panel === 'cast') {
      return <CreditPillList credits={cast} />;
    }
    if (panel === 'crew') {
      return <CreditPillList credits={crew} />;
    }
    if (panel === 'details') {
      return <DetailsList extras={extras} />;
    }
    if (panel === 'genres') {
      const hasGenres = extras.genres.length > 0;
      const hasThemes = extras.keywords.length > 0;
      return (
        <div className="space-y-5">
          {hasGenres ? (
            <ul
              aria-label="Genres"
              className="flex flex-wrap justify-start gap-2"
            >
              {extras.genres.map((genre) => (
                <li key={`${genre.id}-${genre.name}`} className="min-w-0">
                  <Pill>{genre.name}</Pill>
                </li>
              ))}
            </ul>
          ) : null}
          {hasThemes ? (
            hasGenres ? (
              <div>
                <h3
                  id={themesHeadingId}
                  className="mb-2 text-sm font-normal text-muted"
                >
                  Themes
                </h3>
                <ThemePillList
                  keywords={extras.keywords}
                  aria-labelledby={themesHeadingId}
                />
              </div>
            ) : (
              <ThemePillList keywords={extras.keywords} aria-label="Themes" />
            )
          ) : null}
        </div>
      );
    }
    if (panel === 'releases') {
      return (
        <ul className="catalog-thumb-scroll max-h-[28rem] space-y-0 overflow-y-auto pr-1 text-left text-[0.68rem] leading-none sm:text-xs sm:leading-snug">
          {sortedReleases.map((release, index) => (
            <li
              key={`${release.country}-${release.release_date}-${release.type}-${index}`}
              className="flex h-7 flex-nowrap items-center gap-x-1.5 overflow-hidden border-b border-[var(--color-border)]/60 sm:h-8 sm:gap-x-2"
            >
              <span className="inline-flex min-w-0 shrink items-center gap-1 font-medium text-foreground sm:gap-1.5">
                <CountryFlag code={release.country} />
                <span className="truncate">
                  {countryDisplayName(release.country)}
                </span>
              </span>
              <span className="shrink-0 text-muted">
                {formatReleaseDate(release.release_date)}
              </span>
              {release.type != null ? (
                <span className="min-w-0 truncate text-foreground">
                  {RELEASE_TYPE_LABELS[release.type] ?? `Type ${release.type}`}
                </span>
              ) : null}
              {release.certification ? (
                <span className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)]/40 px-1 py-px text-[length:var(--text-eyebrow)] text-muted">
                  {release.certification}
                </span>
              ) : null}
              {release.note ? (
                <span className="min-w-0 truncate text-muted">
                  {release.note}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      );
    }
    if (panel === 'seasons') {
      return (
        <ul className="space-y-6">
          {seasonList.map((season) => (
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
      );
    }
    return null;
  }

  const isCrossfading = outgoingTab != null;

  return (
    <section className="mt-5 text-left sm:mt-7">
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Title metadata"
        className="relative flex w-full flex-nowrap items-end justify-between gap-0.5 border-b border-[var(--color-border)] sm:justify-start sm:gap-6"
      >
        {tabs.map((item, index) => {
          const selected = active === item.id;
          const ariaLabel =
            item.ariaLabel ??
            (item.count != null ? `${item.label}, ${item.count}` : item.label);
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={ariaLabel}
              tabIndex={selected ? 0 : -1}
              id={`title-tab-${item.id}`}
              aria-controls={panelId}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              onClick={() => {
                setTab(item.id);
              }}
              onKeyDown={(event) => {
                onTabKeyDown(event, index);
              }}
              className={`min-w-0 flex-1 whitespace-nowrap pb-1.5 text-center text-xs font-semibold tracking-[0.03em] transition-colors duration-[var(--duration-med)] sm:flex-none sm:pb-2 sm:text-left sm:text-sm sm:tracking-[0.12em] ${
                selected ? 'text-accent' : 'text-muted hover:text-foreground'
              }`}
            >
              {item.label}
              {item.count != null ? (
                <span className="ml-1 hidden font-normal tracking-normal text-muted sm:ml-2 sm:inline">
                  {item.count}
                </span>
              ) : null}
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
        className={`title-tab-panel-stage relative mt-5 text-left${
          stageHeight != null ? ' is-resizing' : ''
        }`}
        style={stageHeight != null ? { height: stageHeight } : undefined}
      >
        {outgoingTab != null ? (
          <div
            key={`out-${outgoingTab}`}
            className="title-tab-panel title-tab-panel-layer is-outgoing"
            aria-hidden
            inert
          >
            {renderPanel(outgoingTab)}
          </div>
        ) : null}
        <div
          key={`in-${panelTab}`}
          role="tabpanel"
          id={panelId}
          aria-labelledby={`title-tab-${active}`}
          className={`title-tab-panel ${
            isCrossfading ? 'is-incoming' : 'is-active'
          }`}
        >
          {renderPanel(panelTab)}
        </div>
      </div>
    </section>
  );
}
