'use client';

import {useRouter} from 'next/navigation';
import {type FormEvent, useState} from 'react';

export function SiteSearch({initialQuery = ''}: {initialQuery?: string}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = q.trim();
    if (!cleaned) {
      router.push('/search');
      return;
    }
    router.push(`/search?q=${encodeURIComponent(cleaned)}`);
  }

  return (
    <form
      role="search"
      onSubmit={onSubmit}
      className="flex min-w-0 flex-1 items-center px-2 sm:px-4"
    >
      <label htmlFor="site-search" className="sr-only">
        Search movies, TV, and people
      </label>
      <input
        id="site-search"
        name="q"
        type="search"
        value={q}
        onChange={(event) => {
          setQ(event.target.value);
        }}
        placeholder="Search titles and people"
        autoComplete="off"
        maxLength={100}
        className="w-full max-w-md rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-foreground placeholder:text-muted outline-none transition focus:border-[var(--color-accent)]"
      />
    </form>
  );
}
