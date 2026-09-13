/**
 * Debounced live username availability for signup + settings rename (ADR-0018).
 */

'use client';

import {
  fetchUsernameAvailability,
  type UsernameAvailabilityStatus,
  usernameAvailabilityCopy,
} from '@/lib/username-availability';
import { useEffect, useState } from 'react';

const DEBOUNCE_MS = 400;

export interface UseUsernameAvailabilityOptions {
  enabled: boolean;
  /** When set and equal (case-insensitive) to the candidate, treat as available. */
  currentUsername?: string | null;
}

export function useUsernameAvailability(
  username: string,
  options: UseUsernameAvailabilityOptions,
): {
  status: UsernameAvailabilityStatus;
  message: string | null;
} {
  const { enabled, currentUsername = null } = options;
  const [status, setStatus] = useState<UsernameAvailabilityStatus>('idle');

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }

    const trimmed = username.trim();
    if (!trimmed) {
      setStatus('idle');
      return;
    }

    if (
      currentUsername &&
      trimmed.toLowerCase() === currentUsername.toLowerCase()
    ) {
      setStatus('available');
      return;
    }

    if (!/^[A-Za-z0-9_]{3,32}$/.test(trimmed)) {
      setStatus('invalid');
      return;
    }

    const controller = new AbortController();
    setStatus('checking');
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await fetchUsernameAvailability(
            trimmed,
            controller.signal,
          );
          if (!controller.signal.aborted) {
            setStatus(result.status);
          }
        } catch (err) {
          if (controller.signal.aborted) {
            return;
          }
          if (err instanceof DOMException && err.name === 'AbortError') {
            return;
          }
          setStatus('error');
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [username, enabled, currentUsername]);

  return {
    status,
    message: usernameAvailabilityCopy(status),
  };
}
