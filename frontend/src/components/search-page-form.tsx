'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';

import { SearchIcon } from '@/components/search-icon';

const DEBOUNCE_MS = 250;
/** Backend ``MAX_QUERY_LENGTH`` — keep typing within the API contract. */
const MAX_QUERY_LENGTH = 100;

/**
 * Expanded navbar search field used on ``/search`` in place of the icon
 * trigger. Same slot as ``SiteSearch`` (immediately left of AccountMenu).
 *
 * Grows with the typed query via an invisible text sizer (real glyph width),
 * so the magnifier chrome does not clip characters. Capped at half the
 * viewport on mobile and one third on ``sm+``.
 */
export function SearchPageForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(initialQuery);

  useEffect(() => {
    setQ(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) {
        return;
      }
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const cleaned = q.trim();
    const timer = window.setTimeout(() => {
      const next =
        cleaned.length > 0
          ? `/search?q=${encodeURIComponent(cleaned)}`
          : '/search';
      const current = `${window.location.pathname}${window.location.search}`;
      if (current !== next) {
        router.replace(next, { scroll: false });
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [q, router]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = q.trim();
    if (!cleaned) {
      router.replace('/search', { scroll: false });
      return;
    }
    router.replace(`/search?q=${encodeURIComponent(cleaned)}`, {
      scroll: false,
    });
  }

  const sizerText = q.length > 0 ? q : 'Search';

  return (
    <form role="search" onSubmit={onSubmit} className="min-w-0 shrink">
      <label htmlFor={inputId} className="sr-only">
        Search titles and people
      </label>
      <div className="inline-grid h-11 max-w-[50vw] grid-cols-[minmax(0,auto)_auto] items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--overlay-surface-bg)] px-2.5 backdrop-blur-[14px] sm:h-12 sm:max-w-[33.333vw] sm:gap-2.5 sm:px-3">
        <div className="inline-grid min-w-[4.5rem] max-w-full items-center overflow-x-auto">
          <span
            aria-hidden
            className="invisible col-start-1 row-start-1 whitespace-pre text-sm sm:text-base"
          >
            {sizerText}
            {/* Caret pad so the last glyph is not flush against the icon. */}
            {'\u00a0\u00a0'}
          </span>
          <input
            ref={inputRef}
            id={inputId}
            name="q"
            type="search"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
            }}
            placeholder="Search"
            autoComplete="off"
            maxLength={MAX_QUERY_LENGTH}
            className="col-start-1 row-start-1 w-full min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted outline-none focus-visible:outline-none sm:text-base [&::-webkit-search-cancel-button]:appearance-none"
          />
        </div>
        <SearchIcon className="h-5 w-5 shrink-0 text-muted sm:h-6 sm:w-6" />
      </div>
    </form>
  );
}
