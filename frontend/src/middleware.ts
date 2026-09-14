import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { hasAuthSessionCookie } from '@/lib/auth-cookies';
import {
  SIGNED_IN_HOME_HEADER,
  SIGNED_IN_HOME_PATH,
} from '@/lib/signed-in-home';

/**
 * Keep a session cookie off the cached anonymous home document.
 *
 * The browser URL stays ``/``. The rewritten page is dynamic.
 */
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname !== '/') {
    return NextResponse.next();
  }
  if (!hasAuthSessionCookie((name) => request.cookies.has(name))) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = SIGNED_IN_HOME_PATH;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(SIGNED_IN_HOME_HEADER, '1');
  return NextResponse.rewrite(url, {
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ['/'],
};
