'use client';

import { useEffect, useRef } from 'react';

import { useAuth } from '@/components/auth-provider';
import { applyThemePreference, type ThemePreference } from '@/lib/theme';

/**
 * Loads signed-in preference theme once per session and applies ``data-theme``.
 * Signed-out users keep the layout default.
 */
export function ThemeSync() {
  const { status } = useAuth();
  const loadedForSignedIn = useRef(false);

  useEffect(() => {
    if (status !== 'signed_in') {
      loadedForSignedIn.current = false;
      return;
    }
    if (loadedForSignedIn.current) {
      return;
    }
    loadedForSignedIn.current = true;

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
  }, [status]);

  return null;
}
