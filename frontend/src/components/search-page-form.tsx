'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';

import { SearchIcon } from '@/components/search-icon';

const DEBOUNCE_MS = 250;
/** Min / max width of the growing field (ch units ≈ character width). */
const MIN_WIDTH_CH = 10;
const MAX_WIDTH_CH = 28;

/**
 * Expanded navbar search field used on ``/search`` in place of the icon
 * trigger. Same slot as ``SiteSearch`` (immediately left of AccountMenu).
 */
export function SearchPageForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(initialQuery);
  const widthCh = Math.min(MAX_WIDTH_CH, Math.max(MIN_WIDTH_CH, q.length + 2));

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
        router.replace(next);
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
      router.replace('/search');
      return;
    }
    router.replace(`/search?q=${encodeURIComponent(cleaned)}`);
  }

  return (
    <form role="search" onSubmit={onSubmit} className="shrink-0">
      <label htmlFor={inputId} className="sr-only">
        Search titles and people
      </label>
      <div
        className="flex h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--overlay-surface-bg)] px-2.5 backdrop-blur-[14px] sm:h-12 sm:gap-2.5 sm:px-3"
        style={{ width: `${widthCh}ch` }}
      >
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
          maxLength={100}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted outline-none focus-visible:outline-none sm:text-base"
        />
        <SearchIcon className="h-5 w-5 shrink-0 text-muted sm:h-6 sm:w-6" />
      </div>
    </form>
  );
}
