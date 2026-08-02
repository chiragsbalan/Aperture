'use client';

import Link from 'next/link';
import { type KeyboardEvent, useMemo, useRef, useState } from 'react';

import type { CreditPersonRef, SeasonDetail, TitleExtras } from '@/lib/catalog';

type MetaTab = 'cast' | 'crew' | 'details' | 'genres' | 'releases' | 'seasons';

const RELEASE_TYPE_LABELS: Record<number, string> = {
  1: 'Premiere',
  2: 'Theatrical (limited)',
  3: 'Theatrical',
  4: 'Digital',
  5: 'Physical',
  6: 'TV',
};

const CREDIT_PREVIEW_COUNT = 10;

function CreditPill({ credit }: { credit: CreditPersonRef }) {
  const detail = credit.character ?? credit.job;
  return (
    <Link
      href={`/people/${credit.id}`}
      className="group inline-flex max-w-full items-baseline gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/70 px-2.5 py-1.5 text-sm text-foreground transition hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
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

function CreditTogglePill({
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
      onClick={onToggle}
      className="inline-flex max-w-full items-baseline gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/70 px-2.5 py-1.5 text-sm text-foreground transition hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
    >
      {expanded ? 'Show less' : `Show all (+${remaining})`}
    </button>
  );
}

function CreditPillList({ credits }: { credits: CreditPersonRef[] }) {
  const [expanded, setExpanded] = useState(false);
  const needsToggle = credits.length > CREDIT_PREVIEW_COUNT;
  const visible =
    expanded || !needsToggle ? credits : credits.slice(0, CREDIT_PREVIEW_COUNT);
  const remaining = credits.length - CREDIT_PREVIEW_COUNT;

  return (
    <ul className="flex flex-wrap gap-2">
      {visible.map((credit) => (
        <li
          key={`${credit.id}-${credit.character ?? ''}-${credit.job ?? ''}-${credit.billing_order ?? ''}`}
        >
          <CreditPill credit={credit} />
        </li>
      ))}
      {needsToggle ? (
        <li>
          <CreditTogglePill
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
    <span className="inline-flex rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/70 px-2.5 py-1.5 text-sm text-foreground">
      {children}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 text-sm sm:grid-cols-[10rem_1fr]">
      <dt className="text-muted">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
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
        className="inline-block h-5 w-5 shrink-0 rounded-full bg-[var(--color-border)]"
      />
    );
  }
  const iso = code.toLowerCase();
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny flag CDN asset
    <img
      src={`https://flagcdn.com/w40/${iso}.png`}
      alt=""
      width={20}
      height={20}
      className="h-5 w-5 shrink-0 rounded-full object-cover ring-1 ring-[var(--color-border)]"
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
    const items: Array<{ id: MetaTab; label: string; count?: number }> = [];
    if (cast.length > 0) {
      items.push({ id: 'cast', label: 'CAST', count: cast.length });
    }
    if (crew.length > 0) {
      items.push({ id: 'crew', label: 'CREW', count: crew.length });
    }
    items.push({ id: 'details', label: 'DETAILS' });
    if (extras.genres.length > 0 || extras.keywords.length > 0) {
      items.push({
        id: 'genres',
        label: 'GENRES',
        count: extras.genres.length + extras.keywords.length,
      });
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

  const [tab, setTab] = useState<MetaTab>(tabs[0]?.id ?? 'details');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = tabs.some((item) => item.id === tab)
    ? tab
    : (tabs[0]?.id ?? 'details');

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

  return (
    <section className="mt-10 text-left">
      <div
        role="tablist"
        aria-label="Title details"
        className="flex flex-wrap gap-6 border-b border-[var(--color-border)]"
      >
        {tabs.map((item, index) => {
          const selected = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              id={`title-tab-${item.id}`}
              aria-controls={`title-panel-${item.id}`}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              onClick={() => {
                setTab(item.id);
              }}
              onKeyDown={(event) => {
                onTabKeyDown(event, index);
              }}
              className={
                selected
                  ? 'border-b-2 border-accent pb-2 text-sm font-semibold tracking-[0.12em] text-accent'
                  : 'pb-2 text-sm font-semibold tracking-[0.12em] text-muted transition hover:text-foreground'
              }
            >
              {item.label}
              {item.count != null ? (
                <span className="ml-2 font-normal tracking-normal text-muted">
                  {item.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`title-panel-${active}`}
        aria-labelledby={`title-tab-${active}`}
        className="mt-5"
      >
        {active === 'cast' ? <CreditPillList credits={cast} /> : null}

        {active === 'crew' ? <CreditPillList credits={crew} /> : null}

        {active === 'details' ? (
          <dl className="space-y-3">
            {extras.studios.length > 0 ? (
              <DetailRow
                label="Studios"
                value={extras.studios.map((s) => s.name).join(', ')}
              />
            ) : null}
            {extras.countries.length > 0 ? (
              <DetailRow
                label="Countries"
                value={extras.countries
                  .map((c) => c.name || c.iso_3166_1)
                  .join(', ')}
              />
            ) : null}
            {extras.original_language ? (
              <DetailRow
                label="Primary language"
                value={extras.original_language.toUpperCase()}
              />
            ) : null}
            {extras.spoken_languages.length > 0 ? (
              <DetailRow
                label="Spoken languages"
                value={extras.spoken_languages
                  .map((l) => l.english_name || l.name || l.iso_639_1 || '')
                  .filter(Boolean)
                  .join(', ')}
              />
            ) : null}
            {extras.collection ? (
              <DetailRow label="Collection" value={extras.collection.name} />
            ) : null}
            {formatMoney(extras.budget) ? (
              <DetailRow label="Budget" value={formatMoney(extras.budget)!} />
            ) : null}
            {formatMoney(extras.revenue) ? (
              <DetailRow label="Revenue" value={formatMoney(extras.revenue)!} />
            ) : null}
            {extras.alternative_titles.length > 0 ? (
              <div className="pt-2">
                <p className="mb-2 text-sm text-muted">Alternative titles</p>
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
              </div>
            ) : null}
          </dl>
        ) : null}

        {active === 'genres' ? (
          <div className="space-y-5">
            {extras.genres.length > 0 ? (
              <div>
                <p className="mb-2 text-sm text-muted">Genres</p>
                <ul className="flex flex-wrap gap-2">
                  {extras.genres.map((genre) => (
                    <li key={`${genre.id}-${genre.name}`}>
                      <Pill>{genre.name}</Pill>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {extras.keywords.length > 0 ? (
              <div>
                <p className="mb-2 text-sm text-muted">Themes</p>
                <ul className="flex flex-wrap gap-2">
                  {extras.keywords.map((keyword) => (
                    <li key={`${keyword.id}-${keyword.name}`}>
                      <Pill>{keyword.name}</Pill>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {active === 'releases' ? (
          <ul className="catalog-thumb-scroll max-h-[28rem] space-y-2 overflow-y-auto pr-1 text-sm">
            {sortedReleases.map((release, index) => (
              <li
                key={`${release.country}-${release.release_date}-${release.type}-${index}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--color-border)]/60 py-2"
              >
                <span className="inline-flex min-w-0 items-center gap-2 font-medium text-foreground">
                  <CountryFlag code={release.country} />
                  <span className="truncate">
                    {countryDisplayName(release.country)}
                  </span>
                </span>
                <span className="text-muted">
                  {formatReleaseDate(release.release_date)}
                </span>
                {release.type != null ? (
                  <span className="text-foreground">
                    {RELEASE_TYPE_LABELS[release.type] ??
                      `Type ${release.type}`}
                  </span>
                ) : null}
                {release.certification ? (
                  <span className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)]/40 px-1.5 py-0.5 text-xs text-muted">
                    {release.certification}
                  </span>
                ) : null}
                {release.note ? (
                  <span className="text-muted">{release.note}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {active === 'seasons' ? (
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
        ) : null}
      </div>
    </section>
  );
}
