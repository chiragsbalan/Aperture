'use client';

import Link from 'next/link';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { useAuth } from '@/components/auth-provider';
import { FormSelect } from '@/components/form-select';
import { ListTitleWithVisibility } from '@/components/list-title-with-visibility';
import { MoreLikeThis } from '@/components/more-like-this';
import { ProfileAvatar } from '@/components/profile-avatar';
import { ReviewCard } from '@/components/review-card';
import { StarRating } from '@/components/star-rating';
import { ReviewsListSkeleton } from '@/components/skeleton';
import type { SimilarTitle } from '@/lib/catalog';
import { formatIsoMonthYear } from '@/lib/iso_date';
import type { LibraryContentType } from '@/lib/library';
import { MOTION_DURATION_MED_MS } from '@/lib/motion';
import {
  fetchTitleLists,
  fetchTitleRatings,
  fetchTitleReview,
  fetchTitleReviews,
  mergeReview,
  putReviewVote,
  RATING_SORT_OPTIONS,
  REVIEW_RATING_OPTIONS,
  REVIEW_SORT_OPTIONS,
  REVIEW_SPOILER_OPTIONS,
  TITLE_ACTIVITY_PAGE_SIZE,
  TITLE_ACTIVITY_SIMILAR_LIMIT,
  type ActivityTab,
  type RatingFilter,
  type RatingSort,
  type ReviewSort,
  type ReviewVote,
  type SpoilerFilter,
  type TitlePublicList,
  type TitleRating,
  type TitleReview,
} from '@/lib/reviews';
import { useScrollFadeX } from '@/lib/scroll-fade';

/** Visual strip order matches ``title-related-tabs.tsx``. */
const TABS: ReadonlyArray<{ id: ActivityTab; label: string }> = [
  { id: 'similar', label: 'SIMILAR' },
  { id: 'reviews', label: 'REVIEWS' },
  { id: 'ratings', label: 'RATINGS' },
  { id: 'lists', label: 'LISTS' },
];

function syncActivityTabInUrl(next: ActivityTab) {
  if (typeof window === 'undefined') {
    return;
  }
  const url = new URL(window.location.href);
  if (next === 'reviews') {
    url.searchParams.delete('tab');
  } else {
    url.searchParams.set('tab', next);
  }
  const nextPath = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, '', nextPath);
}

function LoadMoreButton({
  hasMore,
  loadingMore,
  onLoadMore,
  label,
}: {
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  label: string;
}) {
  if (!hasMore) {
    return null;
  }
  return (
    <div className="mt-8">
      <button
        type="button"
        className="btn btn-lg"
        disabled={loadingMore}
        aria-busy={loadingMore}
        onClick={onLoadMore}
      >
        {loadingMore ? 'Loading…' : label}
      </button>
    </div>
  );
}

function ActivityReviewsPanel({
  kind,
  contentId,
  onTotal,
}: {
  kind: LibraryContentType;
  contentId: string;
  onTotal: (total: number, ready: boolean) => void;
}) {
  const { status: sessionStatus, me } = useAuth();
  const viewerUsername = me?.user?.username ?? null;
  const signedIn = sessionStatus === 'signed_in';
  const [sort, setSort] = useState<ReviewSort>('popular');
  const [spoilerFilter, setSpoilerFilter] = useState<SpoilerFilter>('all');
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('any');
  const [items, setItems] = useState<TitleReview[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const [votePendingId, setVotePendingId] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === 'loading') {
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setError(null);
    setPage(1);
    setRevealedIds(new Set());

    async function load() {
      const result = await fetchTitleReviews(kind, contentId, {
        page: 1,
        limit: TITLE_ACTIVITY_PAGE_SIZE,
        sort,
        spoilerFilter,
        ratingFilter,
      });
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setStatus('error');
        setError(result.error);
        onTotal(0, true);
        return;
      }
      setItems(result.data.items);
      setTotal(result.data.total);
      setStatus('ready');
      onTotal(result.data.total, true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [
    kind,
    contentId,
    sessionStatus,
    sort,
    spoilerFilter,
    ratingFilter,
    onTotal,
  ]);

  async function handleReveal(id: string) {
    const result = await fetchTitleReview(kind, contentId, id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRevealedIds((current) => new Set(current).add(id));
    setItems((current) => mergeReview(current, result.review));
  }

  async function handleVote(id: string, next: ReviewVote | null) {
    if (!signedIn) {
      return;
    }
    setVotePendingId(id);
    setError(null);
    const result = await putReviewVote(id, next);
    setVotePendingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setItems((current) => mergeReview(current, result.review));
  }

  async function handleLoadMore() {
    if (loadingMore || items.length >= total) {
      return;
    }
    setLoadingMore(true);
    const nextPage = page + 1;
    const result = await fetchTitleReviews(kind, contentId, {
      page: nextPage,
      limit: TITLE_ACTIVITY_PAGE_SIZE,
      sort,
      spoilerFilter,
      ratingFilter,
    });
    setLoadingMore(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPage(nextPage);
    setTotal(result.data.total);
    setItems((current) => {
      const seen = new Set(current.map((row) => row.id));
      return [
        ...current,
        ...result.data.items.filter((row) => !seen.has(row.id)),
      ];
    });
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <p
            id="activity-review-sort-label"
            className="mb-1 text-sm text-muted"
          >
            Sort
          </p>
          <FormSelect
            name="activity-review-sort"
            value={sort}
            options={REVIEW_SORT_OPTIONS}
            onChange={setSort}
            aria-labelledby="activity-review-sort-label"
          />
        </div>
        <div>
          <p
            id="activity-review-spoiler-label"
            className="mb-1 text-sm text-muted"
          >
            Spoilers
          </p>
          <FormSelect
            name="activity-review-spoilers"
            value={spoilerFilter}
            options={REVIEW_SPOILER_OPTIONS}
            onChange={setSpoilerFilter}
            aria-labelledby="activity-review-spoiler-label"
          />
        </div>
        <div>
          <p
            id="activity-review-rating-label"
            className="mb-1 text-sm text-muted"
          >
            Rating
          </p>
          <FormSelect
            name="activity-review-rating"
            value={ratingFilter}
            options={REVIEW_RATING_OPTIONS}
            onChange={setRatingFilter}
            aria-labelledby="activity-review-rating-label"
          />
        </div>
      </div>

      {status === 'loading' ? (
        <div className="mt-6" role="status" aria-busy="true">
          <span className="sr-only">Loading reviews…</span>
          <ReviewsListSkeleton />
        </div>
      ) : null}

      {status === 'error' ? (
        <p className="mt-6 text-sm text-[var(--color-danger)]" role="alert">
          {error ?? 'Could not load reviews.'}
        </p>
      ) : null}

      {status === 'ready' && items.length === 0 ? (
        <p className="mt-6 text-xs text-muted sm:text-sm">No reviews yet.</p>
      ) : null}

      {status === 'ready' && items.length > 0 ? (
        <ul className="mt-6 space-y-6">
          {items.map((review) => (
            <li key={review.id}>
              <ReviewCard
                review={review}
                signedIn={signedIn}
                viewerUsername={viewerUsername}
                revealed={revealedIds.has(review.id)}
                votePending={votePendingId === review.id}
                onReveal={(id) => {
                  void handleReveal(id);
                }}
                onVote={(id, next) => {
                  void handleVote(id, next);
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {error != null && status === 'ready' ? (
        <p className="mt-3 text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <LoadMoreButton
        hasMore={status === 'ready' && items.length < total}
        loadingMore={loadingMore}
        onLoadMore={() => {
          void handleLoadMore();
        }}
        label="Load more"
      />
    </div>
  );
}

function ActivityRatingsPanel({
  kind,
  contentId,
  onTotal,
}: {
  kind: LibraryContentType;
  contentId: string;
  onTotal: (total: number, ready: boolean) => void;
}) {
  const [sort, setSort] = useState<RatingSort>('highest');
  const [items, setItems] = useState<TitleRating[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    setPage(1);

    async function load() {
      const result = await fetchTitleRatings(kind, contentId, {
        page: 1,
        limit: TITLE_ACTIVITY_PAGE_SIZE,
        sort,
      });
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setStatus('error');
        setError(result.error);
        onTotal(0, true);
        return;
      }
      setItems(result.data.items);
      setTotal(result.data.total);
      setStatus('ready');
      onTotal(result.data.total, true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [kind, contentId, sort, onTotal]);

  async function handleLoadMore() {
    if (loadingMore || items.length >= total) {
      return;
    }
    setLoadingMore(true);
    const nextPage = page + 1;
    const result = await fetchTitleRatings(kind, contentId, {
      page: nextPage,
      limit: TITLE_ACTIVITY_PAGE_SIZE,
      sort,
    });
    setLoadingMore(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPage(nextPage);
    setTotal(result.data.total);
    setItems((current) => {
      const seen = new Set(current.map((row) => row.author.username));
      return [
        ...current,
        ...result.data.items.filter((row) => !seen.has(row.author.username)),
      ];
    });
  }

  return (
    <div>
      <div className="max-w-xs">
        <p id="activity-rating-sort-label" className="mb-1 text-sm text-muted">
          Sort
        </p>
        <FormSelect
          name="activity-rating-sort"
          value={sort}
          options={RATING_SORT_OPTIONS}
          onChange={setSort}
          aria-labelledby="activity-rating-sort-label"
        />
      </div>

      {status === 'loading' ? (
        <div className="mt-6" role="status" aria-busy="true">
          <span className="sr-only">Loading ratings…</span>
          <ReviewsListSkeleton count={6} />
        </div>
      ) : null}

      {status === 'error' ? (
        <p className="mt-6 text-sm text-[var(--color-danger)]" role="alert">
          {error ?? 'Could not load ratings.'}
        </p>
      ) : null}

      {status === 'ready' && items.length === 0 ? (
        <p className="mt-6 text-xs text-muted sm:text-sm">No ratings yet.</p>
      ) : null}

      {status === 'ready' && items.length > 0 ? (
        <ul className="mt-6 divide-y divide-[var(--color-border)]">
          {items.map((row) => {
            const displayName =
              row.author.display_name?.trim() || `@${row.author.username}`;
            const dateLabel = formatIsoMonthYear(row.watched_at);
            return (
              <li key={row.author.username} className="py-4 first:pt-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Link
                    href={`/u/${encodeURIComponent(row.author.username)}`}
                    className="inline-flex min-w-0 items-center gap-2 text-foreground underline decoration-[var(--color-border)] underline-offset-4 transition hover:decoration-accent"
                  >
                    <ProfileAvatar
                      username={row.author.username}
                      displayName={row.author.display_name}
                      avatarUrl={row.author.avatar_url}
                      size="sm"
                    />
                    <span className="truncate">{displayName}</span>
                  </Link>
                  <StarRating rating={row.rating} />
                  {dateLabel != null ? (
                    <time
                      dateTime={row.watched_at}
                      className="text-xs text-muted sm:text-sm"
                    >
                      {dateLabel}
                    </time>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <LoadMoreButton
        hasMore={status === 'ready' && items.length < total}
        loadingMore={loadingMore}
        onLoadMore={() => {
          void handleLoadMore();
        }}
        label="Load more"
      />
    </div>
  );
}

function ActivityListsPanel({
  kind,
  contentId,
  onTotal,
}: {
  kind: LibraryContentType;
  contentId: string;
  onTotal: (total: number, ready: boolean) => void;
}) {
  const [items, setItems] = useState<TitlePublicList[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    setPage(1);

    async function load() {
      const result = await fetchTitleLists(kind, contentId, {
        page: 1,
        limit: TITLE_ACTIVITY_PAGE_SIZE,
      });
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setStatus('error');
        setError(result.error);
        onTotal(0, true);
        return;
      }
      setItems(result.data.items);
      setTotal(result.data.total);
      setStatus('ready');
      onTotal(result.data.total, true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [kind, contentId, onTotal]);

  async function handleLoadMore() {
    if (loadingMore || items.length >= total) {
      return;
    }
    setLoadingMore(true);
    const nextPage = page + 1;
    const result = await fetchTitleLists(kind, contentId, {
      page: nextPage,
      limit: TITLE_ACTIVITY_PAGE_SIZE,
    });
    setLoadingMore(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPage(nextPage);
    setTotal(result.data.total);
    setItems((current) => {
      const seen = new Set(current.map((row) => row.id));
      return [
        ...current,
        ...result.data.items.filter((row) => !seen.has(row.id)),
      ];
    });
  }

  return (
    <div>
      {status === 'loading' ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">Loading lists…</span>
          <ReviewsListSkeleton count={6} />
        </div>
      ) : null}

      {status === 'error' ? (
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {error ?? 'Could not load lists.'}
        </p>
      ) : null}

      {status === 'ready' && items.length === 0 ? (
        <p className="text-xs text-muted sm:text-sm">No public lists yet.</p>
      ) : null}

      {status === 'ready' && items.length > 0 ? (
        <ul className="divide-y divide-[var(--color-border)]">
          {items.map((row) => {
            const ownerName =
              row.owner.display_name?.trim() || `@${row.owner.username}`;
            return (
              <li key={row.id} className="py-4 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <Link
                    href={`/lists/${encodeURIComponent(row.id)}`}
                    className="min-w-0 text-foreground underline decoration-[var(--color-border)] underline-offset-4 transition hover:decoration-accent"
                  >
                    <ListTitleWithVisibility
                      title={row.title}
                      visibility="public"
                    />
                  </Link>
                  <Link
                    href={`/u/${encodeURIComponent(row.owner.username)}`}
                    className="shrink-0 text-sm text-muted underline decoration-[var(--color-border)] underline-offset-4 transition hover:text-foreground hover:decoration-accent"
                  >
                    {ownerName}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <LoadMoreButton
        hasMore={status === 'ready' && items.length < total}
        loadingMore={loadingMore}
        onLoadMore={() => {
          void handleLoadMore();
        }}
        label="Load more"
      />
    </div>
  );
}

/**
 * Activity page tablist (Similar / Reviews / Ratings / Lists). Chrome
 * matches ``title-meta-tabs.tsx``.
 */
export function TitleActivityTabs({
  kind,
  contentId,
  similar = [],
  initialTab = 'reviews',
}: {
  kind: LibraryContentType;
  contentId: string;
  similar?: SimilarTitle[];
  initialTab?: ActivityTab;
}) {
  const similarKind = kind === 'tv' ? 'tv_show' : 'movie';
  const similarItems = similar.slice(0, TITLE_ACTIVITY_SIMILAR_LIMIT);
  const similarCount = similarItems.length;
  const panelId = useId();
  const [tab, setTab] = useState<ActivityTab>(initialTab);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tablistRef = useRef<HTMLDivElement | null>(null);
  const tablistHostRef = useRef<HTMLDivElement | null>(null);
  const [panelTab, setPanelTab] = useState<ActivityTab>(initialTab);
  const [outgoingTab, setOutgoingTab] = useState<ActivityTab | null>(null);
  const [stageHeight, setStageHeight] = useState<number | undefined>();
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [indicatorReady, setIndicatorReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const skipPanelAnimRef = useRef(true);
  const panelTabRef = useRef<ActivityTab>(initialTab);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [reviewsTotal, setReviewsTotal] = useState<number | null>(null);
  const [reviewsReady, setReviewsReady] = useState(false);
  const [ratingsTotal, setRatingsTotal] = useState<number | null>(null);
  const [ratingsReady, setRatingsReady] = useState(false);
  const [listsTotal, setListsTotal] = useState<number | null>(null);
  const [listsReady, setListsReady] = useState(false);

  const handleReviewsTotal = useCallback((total: number, ready: boolean) => {
    setReviewsTotal(total);
    setReviewsReady(ready);
  }, []);
  const handleRatingsTotal = useCallback((total: number, ready: boolean) => {
    setRatingsTotal(total);
    setRatingsReady(ready);
  }, []);
  const handleListsTotal = useCallback((total: number, ready: boolean) => {
    setListsTotal(total);
    setListsReady(ready);
  }, []);

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

  useScrollFadeX(tablistRef, TABS.length, tablistHostRef);

  useLayoutEffect(() => {
    const list = tablistRef.current;
    if (!list) {
      return;
    }

    const activeIndex = TABS.findIndex((item) => item.id === tab);

    const syncIndicator = () => {
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

    const activeTab = tabRefs.current[activeIndex];
    if (activeTab && activeIndex >= 0) {
      const tabCenter = activeTab.offsetLeft + activeTab.offsetWidth / 2;
      const targetLeft = tabCenter - list.clientWidth / 2;
      const maxScroll = Math.max(0, list.scrollWidth - list.clientWidth);
      const nextLeft = Math.min(Math.max(0, targetLeft), maxScroll);
      if (Math.abs(nextLeft - list.scrollLeft) > 1) {
        list.scrollTo({ left: nextLeft, behavior: 'smooth' });
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
  }, [tab, reviewsTotal, ratingsTotal, listsTotal, similarCount]);

  useEffect(() => {
    if (skipPanelAnimRef.current) {
      skipPanelAnimRef.current = false;
      panelTabRef.current = tab;
      setPanelTab(tab);
      setOutgoingTab(null);
      setStageHeight(undefined);
      return;
    }
    if (reduceMotion) {
      panelTabRef.current = tab;
      setPanelTab(tab);
      setOutgoingTab(null);
      setStageHeight(undefined);
      return;
    }
    if (tab === panelTabRef.current) {
      return;
    }

    const previous = panelTabRef.current;
    const fromHeight = stageRef.current?.offsetHeight ?? 0;

    setOutgoingTab(previous);
    panelTabRef.current = tab;
    setPanelTab(tab);
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
  }, [tab, reduceMotion]);

  function selectTab(next: ActivityTab) {
    setTab(next);
    syncActivityTabInUrl(next);
  }

  function focusTabAt(index: number) {
    const next = TABS[index];
    if (!next) {
      return;
    }
    selectTab(next.id);
    tabRefs.current[index]?.focus();
  }

  function onTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    const count = TABS.length;
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

  const isCrossfading = outgoingTab != null;

  function panelClass(id: ActivityTab): string {
    const outgoing = outgoingTab === id;
    const incoming = panelTab === id;
    if (outgoing) {
      return 'title-tab-panel title-tab-panel-layer is-outgoing';
    }
    if (incoming) {
      return `title-tab-panel ${isCrossfading ? 'is-incoming' : 'is-active'}`;
    }
    return 'hidden';
  }

  function countFor(id: ActivityTab): number | undefined {
    if (id === 'reviews') {
      return reviewsReady && reviewsTotal != null && reviewsTotal > 0
        ? reviewsTotal
        : undefined;
    }
    if (id === 'ratings') {
      return ratingsReady && ratingsTotal != null && ratingsTotal > 0
        ? ratingsTotal
        : undefined;
    }
    if (id === 'lists') {
      return listsReady && listsTotal != null && listsTotal > 0
        ? listsTotal
        : undefined;
    }
    return similarCount > 0 ? similarCount : undefined;
  }

  function ariaFor(id: ActivityTab, label: string): string {
    const count = countFor(id);
    return count != null ? `${label}, ${count}` : label;
  }

  return (
    <section className="mt-8 w-full text-left sm:mt-10">
      <div className="flex items-end gap-3 border-b border-[var(--color-border)] pb-px">
        <div ref={tablistHostRef} className="scroll-fade-x-host min-w-0 flex-1">
          <div
            ref={tablistRef}
            role="tablist"
            aria-label="Activity"
            aria-orientation="horizontal"
            className="scroll-fade-x relative flex w-full flex-nowrap items-end gap-4 sm:gap-6"
          >
            {TABS.map((item, index) => {
              const selected = tab === item.id;
              const count = countFor(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-label={ariaFor(item.id, item.label)}
                  tabIndex={selected ? 0 : -1}
                  id={`title-activity-tab-${item.id}`}
                  aria-controls={panelId}
                  ref={(element) => {
                    tabRefs.current[index] = element;
                  }}
                  onClick={() => {
                    selectTab(item.id);
                  }}
                  onKeyDown={(event) => {
                    onTabKeyDown(event, index);
                  }}
                  className={`shrink-0 whitespace-nowrap pb-1.5 text-xs font-semibold tracking-[0.03em] transition-colors duration-[var(--duration-med)] sm:pb-2 sm:text-sm sm:tracking-[0.12em] ${
                    selected
                      ? 'text-accent'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  {item.label}
                  {count != null ? (
                    <span className="ml-1 hidden font-normal tracking-normal text-muted sm:ml-2 sm:inline">
                      {count}
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
        </div>
      </div>

      <div
        ref={stageRef}
        className={`motion-size title-tab-panel-stage relative mt-5 text-left${
          stageHeight != null ? ' is-resizing' : ''
        }`}
        style={stageHeight != null ? { height: stageHeight } : undefined}
      >
        {TABS.map((item) => {
          const incoming = panelTab === item.id;
          const outgoing = outgoingTab === item.id;
          const hidden = !incoming && !outgoing;
          return (
            <div
              key={item.id}
              role={incoming ? 'tabpanel' : undefined}
              id={incoming ? panelId : undefined}
              aria-labelledby={
                incoming ? `title-activity-tab-${item.id}` : undefined
              }
              className={panelClass(item.id)}
              aria-hidden={hidden || outgoing ? true : undefined}
              inert={hidden || outgoing ? true : undefined}
            >
              {item.id === 'reviews' ? (
                <ActivityReviewsPanel
                  kind={kind}
                  contentId={contentId}
                  onTotal={handleReviewsTotal}
                />
              ) : null}
              {item.id === 'ratings' ? (
                <ActivityRatingsPanel
                  kind={kind}
                  contentId={contentId}
                  onTotal={handleRatingsTotal}
                />
              ) : null}
              {item.id === 'lists' ? (
                <ActivityListsPanel
                  kind={kind}
                  contentId={contentId}
                  onTotal={handleListsTotal}
                />
              ) : null}
              {item.id === 'similar' ? (
                <MoreLikeThis
                  items={similarItems}
                  kind={similarKind}
                  limit={TITLE_ACTIVITY_SIMILAR_LIMIT}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
