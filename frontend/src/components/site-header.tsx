'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { ProfileAvatar } from '@/components/profile-avatar';
import { SiteSearch } from '@/components/site-search';

type AuthState = 'loading' | 'signed_out' | 'signed_in';

interface MeUser {
  username: string | null;
  display_name: string | null;
}

function HeaderSearch() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const headerQuery =
    pathname === '/search' ? (searchParams.get('q') ?? '') : '';
  return <SiteSearch key={pathname} initialQuery={headerQuery} />;
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 19.25a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [meUser, setMeUser] = useState<MeUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAuth() {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (cancelled) {
          return;
        }
        if (!res.ok) {
          setAuthState('signed_out');
          setMeUser(null);
          return;
        }
        const data = (await res.json()) as { user: MeUser | null };
        setAuthState('signed_in');
        setMeUser(data.user);
      } catch {
        if (!cancelled) {
          setAuthState('signed_out');
          setMeUser(null);
        }
      }
    }

    void loadAuth();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const username = meUser?.username?.trim() || null;

  return (
    <header className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-5 py-5 sm:gap-4 sm:px-8 sm:py-6">
      <Link
        href="/"
        className="shrink-0 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
      >
        Aperture
      </Link>
      <div className="min-w-0 flex-1" aria-hidden="true" />
      <nav
        aria-label="Primary"
        className="flex shrink-0 items-center gap-1.5 sm:gap-2"
      >
        <Suspense
          fallback={
            <div
              className="h-11 w-11 shrink-0 sm:h-12 sm:w-12"
              aria-hidden="true"
            />
          }
        >
          <HeaderSearch />
        </Suspense>
        {authState === 'loading' ? (
          <span
            className="inline-flex h-11 w-11 shrink-0 sm:h-12 sm:w-12"
            aria-live="polite"
          >
            <span className="sr-only">Loading account…</span>
          </span>
        ) : null}
        {authState === 'signed_in' ? (
          <Link
            href="/account"
            aria-label={username ? `Profile (@${username})` : 'Your account'}
            aria-current={pathname === '/account' ? 'page' : undefined}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted transition hover:bg-[var(--color-accent-soft)] hover:text-foreground sm:h-12 sm:w-12"
          >
            {username ? (
              <ProfileAvatar
                username={username}
                displayName={meUser?.display_name}
                size="sm"
              />
            ) : (
              <UserIcon className="h-6 w-6 sm:h-7 sm:w-7" />
            )}
          </Link>
        ) : null}
      </nav>
    </header>
  );
}
