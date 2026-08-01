import { upstreamApiBaseUrl } from '@/lib/api';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

function buildUpstreamUrl(pathParts: string[], search: string): URL | null {
  if (pathParts.length === 0) {
    return null;
  }
  if (pathParts.some((part) => part === '..' || part.includes('\\'))) {
    return null;
  }

  const base = upstreamApiBaseUrl();
  const path = pathParts.map(encodeURIComponent).join('/');
  try {
    return new URL(`${base}/${path}${search}`);
  } catch {
    return null;
  }
}

async function proxyRequest(
  request: NextRequest,
  pathParts: string[],
): Promise<NextResponse> {
  const upstreamUrl = buildUpstreamUrl(pathParts, request.nextUrl.search);
  if (upstreamUrl === null) {
    return NextResponse.json({ detail: 'Invalid proxy path' }, { status: 400 });
  }

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  // Backend is cookie-agnostic; never forward browser cookies upstream.
  headers.delete('cookie');

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, init);
  } catch {
    return NextResponse.json(
      { detail: 'Upstream API unreachable' },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}
