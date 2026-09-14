/**
 * Live username availability for signup + settings rename (ADR-0018).
 *
 * Bloom/DB runs on each change once the handle matches the 3–32 character
 * rules. Shorter or badly shaped values stay invalid and are not probed.
 */

'use client';

import {
  fetchUsernameAvailability,
  type UsernameAvailabilityStatus,
  usernameAvailabilityCopy,
} from '@/lib/username-availability';
import { useEffect, useState } from 'react';

const USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/;

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

    // Fewer than 3 characters, or a bad shape, cannot be an existing handle.
    // Skip the bloom/DB check until the candidate could actually be taken.
    if (!USERNAME_RE.test(trimmed)) {
      setStatus('invalid');
      return;
    }

    const controller = new AbortController();
    setStatus('checking');
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

    return () => {
      controller.abort();
    };
  }, [username, enabled, currentUsername]);

  return {
    status,
    message: usernameAvailabilityCopy(status),
  };
}
