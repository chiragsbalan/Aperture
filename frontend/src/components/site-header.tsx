'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { AccountMenu } from '@/components/account-menu';
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

/**
 * Sparse chrome: brand → `/`, search, and AccountMenu when signed in.
 * Guests use landing CTAs for auth (no header Sign in / Create account).
 */
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

  return (
    <header className="absolute inset-x-0 top-0 z-[var(--z-header)] flex items-center gap-3 px-5 py-5 sm:gap-4 sm:px-8 sm:py-6">
      <Link href="/" className="type-page shrink-0 text-foreground">
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
        {authState === 'signed_in' ? (
          <AccountMenu
            username={meUser?.username?.trim() || null}
            displayName={meUser?.display_name ?? null}
          />
        ) : null}
      </nav>
    </header>
  );
}
