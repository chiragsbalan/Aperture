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

/**
 * Upstream FastAPI base URL for server-side BFF proxying only.
 * Browser code should call same-origin `/api/proxy/...` instead.
 */
export function upstreamApiBaseUrl(): string {
  const raw =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:8000';
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
  try {
    const [readyRes, versionRes] = await Promise.all([
      fetchImpl('/api/proxy/health/ready', { cache: 'no-store' }),
      fetchImpl('/api/proxy/version', { cache: 'no-store' }),
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
