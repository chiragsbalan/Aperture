'use client';

import Link from 'next/link';
import {usePathname, useRouter, useSearchParams} from 'next/navigation';
import {Suspense, useEffect, useState} from 'react';

import {SiteSearch} from '@/components/site-search';

type AuthState = 'loading' | 'signed_out' | 'signed_in';

function HeaderSearch() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const headerQuery =
    pathname === '/search' ? (searchParams.get('q') ?? '') : '';
  return <SiteSearch key={`${pathname}:${headerQuery}`} initialQuery={headerQuery} />;
}

export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAuth() {
      try {
        const res = await fetch('/api/auth/me', {cache: 'no-store'});
        if (!cancelled) {
          setAuthState(res.ok ? 'signed_in' : 'signed_out');
        }
      } catch {
        if (!cancelled) {
          setAuthState('signed_out');
        }
      }
    }

    void loadAuth();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', {method: 'POST'});
      setAuthState('signed_out');
      router.push('/login');
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <header className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-6 py-5">
      <Link
        href="/"
        className="shrink-0 font-display text-lg font-semibold tracking-tight text-foreground"
      >
        Aperture
      </Link>
      <Suspense fallback={<div className="min-w-0 flex-1" aria-hidden="true" />}>
        <HeaderSearch />
      </Suspense>
      <nav
        aria-label="Account"
        className="flex shrink-0 items-center gap-4 text-sm"
      >
        {authState === 'loading' ? (
          <span className="text-muted" aria-live="polite">
            …
          </span>
        ) : null}

        {authState === 'signed_out' ? (
          <>
            <Link
              href="/signup"
              className="text-muted transition hover:text-foreground"
            >
              Sign up
            </Link>
            <Link
              href="/login"
              className="text-muted transition hover:text-foreground"
            >
              Log in
            </Link>
          </>
        ) : null}

        {authState === 'signed_in' ? (
          <>
            <Link
              href="/account"
              aria-current={pathname === '/account' ? 'page' : undefined}
              className="text-muted transition hover:text-foreground"
            >
              Account
            </Link>
            <Link
              href="/settings"
              aria-current={pathname === '/settings' ? 'page' : undefined}
              className="text-muted transition hover:text-foreground"
            >
              Settings
            </Link>
            <button
              type="button"
              onClick={() => {
                void handleLogout();
              }}
              disabled={loggingOut}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-foreground transition hover:border-[var(--color-accent)] disabled:opacity-60"
            >
              {loggingOut ? 'Logging out…' : 'Log out'}
            </button>
          </>
        ) : null}
      </nav>
    </header>
  );
}
