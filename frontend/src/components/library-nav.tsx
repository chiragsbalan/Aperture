'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/library/watchlist', label: 'Watchlist' },
  { href: '/library/favorites', label: 'Favorites' },
  { href: '/library/lists', label: 'Lists' },
  { href: '/library/diary', label: 'Diary' },
] as const;

export function LibraryNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Library" className="mt-6 flex flex-wrap gap-4 text-sm">
      {LINKS.map((link) => {
        const current =
          pathname === link.href ||
          (link.href === '/library/lists' && pathname.startsWith('/lists/'));
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? 'page' : undefined}
            className={
              current
                ? 'text-foreground underline underline-offset-4'
                : 'text-muted transition hover:text-foreground'
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
