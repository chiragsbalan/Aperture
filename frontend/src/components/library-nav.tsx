'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/library/watchlist', label: 'Watchlist' },
  { href: '/library/favorites', label: 'Favorites' },
  { href: '/library/lists', label: 'Lists', disabled: true },
  { href: '/library/diary', label: 'Diary', disabled: true },
] as const;

export function LibraryNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Library" className="mt-6 flex flex-wrap gap-4 text-sm">
      {LINKS.map((link) => {
        if ('disabled' in link && link.disabled) {
          return (
            <span
              key={link.href}
              className="text-muted/70"
              title="Coming soon"
              aria-disabled="true"
            >
              {link.label}
            </span>
          );
        }
        const current = pathname === link.href;
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
