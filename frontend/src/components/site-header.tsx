'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';

import { AccountMenu } from '@/components/account-menu';
import { useAuth } from '@/components/auth-provider';
import { SearchPageForm } from '@/components/search-page-form';
import { SiteSearch } from '@/components/site-search';

function HeaderSearch() {
  const pathname = usePathname();
  // On /search: expanded field in the same nav slot as the icon trigger.
  // Elsewhere: icon that opens the search overlay.
  if (pathname === '/search') {
    return (
      <Suspense
        fallback={
          <div
            className="h-11 w-28 shrink-0 sm:h-12 sm:w-32"
            aria-hidden="true"
          />
        }
      >
        <SearchPageForm />
      </Suspense>
    );
  }
  return <SiteSearch key={pathname} />;
}

/**
 * Sparse chrome: brand → `/`, search, and AccountMenu when signed in.
 * Guests use landing CTAs for auth (no header Sign in / Create account).
 * Search and account share one right-aligned cluster (same gap on every page).
 */
export function SiteHeader() {
  const { status, me } = useAuth();

  return (
    <header className="absolute inset-x-0 top-0 z-[var(--z-header)] flex items-center gap-3 px-5 py-5 sm:gap-4 sm:px-8 sm:py-6">
      <Link href="/" className="type-page shrink-0 text-foreground">
        Aperture
      </Link>
      <nav
        aria-label="Primary"
        className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2"
      >
        <HeaderSearch />
        {status === 'signed_in' ? (
          <AccountMenu
            username={me?.user?.username?.trim() || null}
            displayName={me?.user?.display_name ?? null}
            avatarUrl={me?.user?.avatar_url ?? null}
          />
        ) : null}
      </nav>
    </header>
  );
}
