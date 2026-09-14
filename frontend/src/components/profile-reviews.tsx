'use client';

import { useEffect, useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { ReviewCard } from '@/components/review-card';
import { DiaryCardsSkeleton } from '@/components/skeleton';
import { toLibraryContentType } from '@/lib/library';
import {
  defaultSpoilerFilter,
  fetchSpoilerPreference,
  fetchTitleReview,
  fetchUserReviews,
  mergeReview,
  putReviewVote,
  type TitleReview,
} from '@/lib/reviews';

const PAGE_SIZE = 24;

export function ProfileReviews({ username }: { username: string }) {
  const { status: sessionStatus, me } = useAuth();
  const viewerUsername = me?.user?.username ?? null;
  const signedIn = sessionStatus === 'signed_in';
  const [prefsReady, setPrefsReady] = useState(false);
  const [spoilerFilter, setSpoilerFilter] = useState<'all' | 'no_spoilers'>(
    'all',
  );
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
    let cancelled = false;
    async function loadPrefs() {
      if (sessionStatus === 'loading') {
        return;
      }
      if (sessionStatus !== 'signed_in') {
        if (!cancelled) {
          setSpoilerFilter('no_spoilers');
          setPrefsReady(true);
        }
        return;
      }
      const spoilers = await fetchSpoilerPreference();
      if (!cancelled) {
        setSpoilerFilter(defaultSpoilerFilter(spoilers));
        setPrefsReady(true);
      }
    }
    void loadPrefs();
    return () => {
      cancelled = true;
    };
  }, [sessionStatus]);

  useEffect(() => {
    if (!prefsReady) {
      return;
    }
    let cancelled = false;
    setStatus('loading');
    async function load() {
      const result = await fetchUserReviews(username, {
        page: 1,
        limit: PAGE_SIZE,
        sort: 'recent',
        spoilerFilter,
      });
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setStatus('error');
        setError(result.error);
        return;
      }
      setItems(result.data.items);
      setTotal(result.data.total);
      setPage(1);
      setStatus('ready');
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [username, prefsReady, spoilerFilter]);

  async function handleReveal(id: string) {
    const current = items.find((row) => row.id === id);
    const kind =
      current?.content != null
        ? toLibraryContentType(current.content.type)
        : null;
    const contentId = current?.content?.id;
    if (kind == null || contentId == null) {
      return;
    }
    const result = await fetchTitleReview(kind, contentId, id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRevealedIds((open) => new Set(open).add(id));
    setItems((rows) => mergeReview(rows, result.review));
  }

  async function handleVote(id: string, next: 1 | -1 | null) {
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
    const result = await fetchUserReviews(username, {
      page: nextPage,
      limit: PAGE_SIZE,
      sort: 'recent',
      spoilerFilter,
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
    <section className="mt-10 text-left">
      {status === 'loading' || !prefsReady ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">Loading…</span>
          <DiaryCardsSkeleton className="mt-0" />
        </div>
      ) : null}

      {status === 'error' ? (
        <p className="text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {status === 'ready' && items.length === 0 ? (
        <p className="text-muted">No reviews yet.</p>
      ) : null}

      {status === 'ready' && items.length > 0 ? (
        <>
          <ul className="space-y-8">
            {items.map((review) => (
              <li key={review.id}>
                <ReviewCard
                  review={review}
                  signedIn={signedIn}
                  viewerUsername={viewerUsername}
                  revealed={revealedIds.has(review.id)}
                  showPoster
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
          {items.length < total ? (
            <div className="mt-8">
              <button
                type="button"
                className="btn btn-lg"
                disabled={loadingMore}
                aria-busy={loadingMore}
                onClick={() => {
                  void handleLoadMore();
                }}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {error != null && status === 'ready' ? (
        <p className="mt-3 text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
