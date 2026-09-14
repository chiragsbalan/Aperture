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

import { MoreLikeThis } from '@/components/more-like-this';
import { TitleLists } from '@/components/title-lists';
import { TitleRatings } from '@/components/title-ratings';
import { TitleReviews } from '@/components/title-reviews';
import type { SimilarTitle } from '@/lib/catalog';
import { toLibraryContentType } from '@/lib/library';
import { MOTION_DURATION_MED_MS } from '@/lib/motion';
import { activityHref, type ActivityTab } from '@/lib/reviews';
import { useScrollFadeX } from '@/lib/scroll-fade';

type PanelTab = ActivityTab;

/** Visual strip order matches ``title-activity-tabs.tsx``. */
const PANEL_TABS: ReadonlyArray<{ id: PanelTab; label: string }> = [
  { id: 'similar', label: 'SIMILAR' },
  { id: 'reviews', label: 'REVIEWS' },
  { id: 'ratings', label: 'RATINGS' },
  { id: 'lists', label: 'LISTS' },
];

const tabButtonClassName = (selected: boolean) =>
  `shrink-0 whitespace-nowrap pb-1.5 text-xs font-semibold tracking-[0.03em] transition-colors duration-[var(--duration-med)] sm:pb-2 sm:text-sm sm:tracking-[0.12em] ${
    selected ? 'text-accent' : 'text-muted hover:text-foreground'
  }`;

/**
 * Title-detail tab strip (Similar / Reviews / Ratings / Lists). All four are
 * in-page panels. Chrome matches ``title-meta-tabs.tsx`` (indicator, keyboard,
 * panel stage).
 */
export function TitleRelatedTabs({
  items,
  kind,
  contentId,
  contentType,
}: {
  items?: SimilarTitle[] | null;
  kind: 'movie' | 'tv_show';
  contentId: string;
  contentType: string;
}) {
  const similarItems = items ?? [];
  const similarCount = similarItems.length;
  const panelId = useId();
  const [tab, setTab] = useState<PanelTab>('similar');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tablistRef = useRef<HTMLDivElement | null>(null);
  const tablistHostRef = useRef<HTMLDivElement | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>('similar');
  const [outgoingTab, setOutgoingTab] = useState<PanelTab | null>(null);
  const [stageHeight, setStageHeight] = useState<number | undefined>();
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [indicatorReady, setIndicatorReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const skipPanelAnimRef = useRef(true);
  const panelTabRef = useRef<PanelTab>('similar');
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [reviewsTotal, setReviewsTotal] = useState<number | null>(null);
  const [reviewsReady, setReviewsReady] = useState(false);
  const [ratingsTotal, setRatingsTotal] = useState<number | null>(null);
  const [ratingsReady, setRatingsReady] = useState(false);
  const [listsTotal, setListsTotal] = useState<number | null>(null);
  const [listsReady, setListsReady] = useState(false);

  const handleReviewsMeta = useCallback(
    (meta: { total: number; ready: boolean }) => {
      setReviewsTotal(meta.total);
      setReviewsReady(meta.ready);
    },
    [],
  );
  const handleRatingsMeta = useCallback(
    (meta: { total: number; ready: boolean }) => {
      setRatingsTotal(meta.total);
      setRatingsReady(meta.ready);
    },
    [],
  );
  const handleListsMeta = useCallback(
    (meta: { total: number; ready: boolean }) => {
      setListsTotal(meta.total);
      setListsReady(meta.ready);
    },
    [],
  );

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

  useScrollFadeX(tablistRef, PANEL_TABS.length, tablistHostRef);

  useLayoutEffect(() => {
    const list = tablistRef.current;
    if (!list) {
      return;
    }

    const activeIndex = PANEL_TABS.findIndex((item) => item.id === tab);

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
  }, [
    tab,
    reviewsTotal,
    ratingsTotal,
    listsTotal,
    similarCount,
  ]);

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

  function focusTabAt(index: number) {
    const next = PANEL_TABS[index];
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
    const count = PANEL_TABS.length;
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

  function panelClass(id: PanelTab): string {
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

  function countFor(id: PanelTab): number | undefined {
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

  function ariaFor(id: PanelTab, label: string): string {
    const count = countFor(id);
    return count != null ? `${label}, ${count}` : label;
  }

  const libraryKind = toLibraryContentType(contentType);
  const seeAllSimilarHref =
    libraryKind != null
      ? activityHref(libraryKind, contentId, 'similar')
      : null;
  const seeAllReviewsHref =
    libraryKind != null ? activityHref(libraryKind, contentId) : null;
  const seeAllRatingsHref =
    libraryKind != null
      ? activityHref(libraryKind, contentId, 'ratings')
      : null;
  const seeAllListsHref =
    libraryKind != null ? activityHref(libraryKind, contentId, 'lists') : null;

  const showSeeAllSimilar =
    tab === 'similar' && similarCount > 0 && seeAllSimilarHref != null;
  const showSeeAllReviews =
    tab === 'reviews' &&
    reviewsReady &&
    reviewsTotal != null &&
    reviewsTotal > 0 &&
    seeAllReviewsHref != null;
  const showSeeAllRatings =
    tab === 'ratings' &&
    ratingsReady &&
    ratingsTotal != null &&
    ratingsTotal > 0 &&
    seeAllRatingsHref != null;
  const showSeeAllLists =
    tab === 'lists' &&
    listsReady &&
    listsTotal != null &&
    listsTotal > 0 &&
    seeAllListsHref != null;

  const seeAllLinkClassName =
    'shrink-0 whitespace-nowrap pb-1.5 text-sm text-muted underline-offset-2 transition hover:text-foreground hover:underline sm:pb-2';

  return (
    <section className="mt-8 w-full text-left sm:mt-10">
      <div className="flex items-end gap-3 border-b border-[var(--color-border)] pb-px">
        <div ref={tablistHostRef} className="scroll-fade-x-host min-w-0 flex-1">
          <div
            ref={tablistRef}
            role="tablist"
            aria-label="Reviews and related"
            aria-orientation="horizontal"
            className="scroll-fade-x relative flex w-full flex-nowrap items-end gap-4 sm:gap-6"
          >
            {PANEL_TABS.map((item, index) => {
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
                  id={`title-related-tab-${item.id}`}
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
                  className={tabButtonClassName(selected)}
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
        {showSeeAllSimilar && seeAllSimilarHref != null ? (
          <Link
            href={seeAllSimilarHref}
            aria-label="See all similar titles"
            className={seeAllLinkClassName}
          >
            See all similar
          </Link>
        ) : null}
        {showSeeAllReviews && seeAllReviewsHref != null ? (
          <Link
            href={seeAllReviewsHref}
            aria-label="See all reviews"
            className={seeAllLinkClassName}
          >
            See all reviews
          </Link>
        ) : null}
        {showSeeAllRatings && seeAllRatingsHref != null ? (
          <Link
            href={seeAllRatingsHref}
            aria-label="See all ratings"
            className={seeAllLinkClassName}
          >
            See all ratings
          </Link>
        ) : null}
        {showSeeAllLists && seeAllListsHref != null ? (
          <Link
            href={seeAllListsHref}
            aria-label="See all lists"
            className={seeAllLinkClassName}
          >
            See all lists
          </Link>
        ) : null}
      </div>

      <div
        ref={stageRef}
        className={`motion-size title-tab-panel-stage relative mt-5 text-left${
          stageHeight != null ? ' is-resizing' : ''
        }`}
        style={stageHeight != null ? { height: stageHeight } : undefined}
      >
        {PANEL_TABS.map((item) => {
          const incoming = panelTab === item.id;
          const outgoing = outgoingTab === item.id;
          const hidden = !incoming && !outgoing;
          return (
            <div
              key={item.id}
              role={incoming ? 'tabpanel' : undefined}
              id={incoming ? panelId : undefined}
              aria-labelledby={
                incoming ? `title-related-tab-${item.id}` : undefined
              }
              className={panelClass(item.id)}
              aria-hidden={hidden || outgoing ? true : undefined}
              inert={hidden || outgoing ? true : undefined}
            >
              {item.id === 'similar' ? (
                <MoreLikeThis items={similarItems} kind={kind} />
              ) : null}
              {item.id === 'reviews' ? (
                <TitleReviews
                  contentType={contentType}
                  contentId={contentId}
                  onMetaChange={handleReviewsMeta}
                />
              ) : null}
              {item.id === 'ratings' ? (
                <TitleRatings
                  contentType={contentType}
                  contentId={contentId}
                  onMetaChange={handleRatingsMeta}
                />
              ) : null}
              {item.id === 'lists' ? (
                <TitleLists
                  contentType={contentType}
                  contentId={contentId}
                  onMetaChange={handleListsMeta}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
