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

function apiBaseUrl(): string {
  return (
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:8000'
  );
}

async function readVersion(res: Response): Promise<ApiVersion | null> {
  if (!res.ok) {
    await res.text().catch(() => undefined);
    return null;
  }
  try {
    return (await res.json()) as ApiVersion;
  } catch {
    return null;
  }
}

export async function fetchApiHealth(): Promise<ApiHealth> {
  const base = apiBaseUrl();
  try {
    const [readyRes, versionRes] = await Promise.all([
      fetch(`${base}/health/ready`, { cache: 'no-store' }),
      fetch(`${base}/version`, { cache: 'no-store' }),
    ]);

    const version = await readVersion(versionRes);

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
      error: 'Failed to reach API',
    };
  }
}
