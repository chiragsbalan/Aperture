'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { AccountMenu } from '@/components/account-menu';
import { useAuth } from '@/components/auth-provider';
import { SiteSearch } from '@/components/site-search';

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
  const { status, me } = useAuth();

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
        {status === 'signed_in' ? (
          <AccountMenu
            username={me?.user?.username?.trim() || null}
            displayName={me?.user?.display_name ?? null}
          />
        ) : null}
      </nav>
    </header>
  );
}
