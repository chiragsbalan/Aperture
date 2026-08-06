'use client';

/**
 * @fileoverview Session-scoped auth state shared by header, theme, and account.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export interface MeUser {
  id: string;
  username: string | null;
  display_name: string | null;
}

export interface MeResponse {
  identity_id: string;
  email: string;
  user: MeUser | null;
  providers: Array<'password' | 'google'>;
}

export type AuthStatus = 'loading' | 'signed_out' | 'signed_in';

interface AuthContextValue {
  status: AuthStatus;
  me: MeResponse | null;
  /** Re-fetch `/api/auth/me` (e.g. after login). */
  refreshAuth: () => Promise<void>;
  /** Clear local session after logout. */
  clearAuth: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMe(): Promise<
  { status: 'signed_in'; me: MeResponse } | { status: 'signed_out' }
> {
  const res = await fetch('/api/auth/me', { cache: 'no-store' });
  if (!res.ok) {
    return { status: 'signed_out' };
  }
  const me = (await res.json()) as MeResponse;
  return { status: 'signed_in', me };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);

  const refreshAuth = useCallback(async () => {
    try {
      const result = await fetchMe();
      if (result.status === 'signed_in') {
        setMe(result.me);
        setStatus('signed_in');
        return;
      }
      setMe(null);
      setStatus('signed_out');
    } catch {
      setMe(null);
      setStatus('signed_out');
    }
  }, []);

  const clearAuth = useCallback(() => {
    setMe(null);
    setStatus('signed_out');
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const result = await fetchMe();
        if (cancelled) {
          return;
        }
        if (result.status === 'signed_in') {
          setMe(result.me);
          setStatus('signed_in');
          return;
        }
        setMe(null);
        setStatus('signed_out');
      } catch {
        if (!cancelled) {
          setMe(null);
          setStatus('signed_out');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void refreshAuth();
    }
    function onFocus() {
      void refreshAuth();
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshAuth]);

  const value: AuthContextValue = {
    status,
    me,
    refreshAuth,
    clearAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx == null) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
