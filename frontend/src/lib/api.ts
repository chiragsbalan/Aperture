export interface ApiVersion {
  name: string;
  version: string;
  environment: string;
}

export interface ApiHealth {
  ready: boolean;
  version: ApiVersion | null;
  error: string | null;
}

const CLIENT_FETCH_TIMEOUT_MS = 12_000;

/**
 * Upstream FastAPI base URL for server-side BFF proxying only.
 *
 * Requires server-only ``API_URL``. In non-production, falls back to
 * ``NEXT_PUBLIC_API_URL`` for local DX only — never rely on the public var in
 * production Compose/cloud.
 */
export function upstreamApiBaseUrl(): string {
  const raw =
    process.env.API_URL?.trim() ||
    (process.env.NODE_ENV !== 'production'
      ? process.env.NEXT_PUBLIC_API_URL?.trim()
      : undefined);

  if (!raw) {
    throw new Error('API_URL is not configured');
  }

  return raw.replace(/\/$/, '');
}

async function readJson<T>(res: Response): Promise<T | null> {
  if (!res.ok) {
    await res.text().catch(() => undefined);
    return null;
  }
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Fetch health via the same-origin BFF proxy (browser-safe). */
export async function fetchApiHealthViaBff(
  fetchImpl: typeof fetch = fetch,
): Promise<ApiHealth> {
  const signal = AbortSignal.timeout(CLIENT_FETCH_TIMEOUT_MS);

  try {
    const [readyRes, versionRes] = await Promise.all([
      fetchImpl('/api/proxy/health/ready', { cache: 'no-store', signal }),
      fetchImpl('/api/proxy/version', { cache: 'no-store', signal }),
    ]);

    const version = await readJson<ApiVersion>(versionRes);

    if (!readyRes.ok) {
      await readyRes.text().catch(() => undefined);
      return {
        ready: false,
        version,
        error: `API not ready (HTTP ${readyRes.status})`,
      };
    }

    await readyRes.text().catch(() => undefined);
    return { ready: true, version, error: null };
  } catch {
    return {
      ready: false,
      version: null,
      error: 'Failed to reach API via BFF',
    };
  }
}
