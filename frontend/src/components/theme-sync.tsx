'use client';

import { applyThemePreference, type ThemePreference } from '@/lib/theme';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Loads signed-in preference theme and applies it to ``data-theme``.
 * Signed-out users keep the layout default.
 */
export function ThemeSync() {
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/proxy/api/v1/users/me/preferences', {
          cache: 'no-store',
        });
        if (cancelled || !res.ok) {
          return;
        }
        const data = (await res.json()) as { theme?: ThemePreference };
        if (
          data.theme === 'system' ||
          data.theme === 'light' ||
          data.theme === 'dark'
        ) {
          applyThemePreference(data.theme);
        }
      } catch {
        // Keep layout default on network failure.
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
