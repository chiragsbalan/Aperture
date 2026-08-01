'use client';

import { type ApiHealth, fetchApiHealthViaBff } from '@/lib/api';
import { useEffect, useState } from 'react';

type LoadState = 'loading' | 'done';

export function ShellHealth() {
  const [state, setState] = useState<LoadState>('loading');
  const [health, setHealth] = useState<ApiHealth | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchApiHealthViaBff().then((result) => {
      if (!cancelled) {
        setHealth(result);
        setState('done');
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'loading' || health === null) {
    return (
      <p className="motion-fade-in text-muted" role="status" aria-live="polite">
        Checking API…
      </p>
    );
  }

  const statusClass = health.ready
    ? 'text-[var(--color-ok)]'
    : 'text-[var(--color-danger)]';
  const statusLabel = health.ready ? 'API ready' : 'API not ready';

  return (
    <div
      className="motion-fade-in flex flex-col items-center gap-2 text-sm"
      aria-live="polite"
    >
      <p className={`status-pulse ${statusClass}`} role="status">
        {statusLabel}
      </p>
      {health.version ? (
        <p className="text-muted">
          {health.version.name} {health.version.version}
          <span aria-hidden="true"> · </span>
          <span className="sr-only">Environment: </span>
          {health.version.environment}
        </p>
      ) : null}
      {health.error ? (
        <p className="text-[var(--color-danger)]">{health.error}</p>
      ) : null}
    </div>
  );
}
