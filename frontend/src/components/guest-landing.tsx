import Link from 'next/link';

import { ShellHealth } from '@/components/shell-health';

/**
 * Marketing hero for signed-out visitors on `/`.
 */
export function GuestLanding() {
  return (
    <div className="flex flex-col items-center px-1 text-center">
      <h1 className="type-brand motion-fade-rise text-foreground">Aperture</h1>
      <p className="motion-fade-rise-delay mt-4 max-w-xl font-display text-lg font-medium text-foreground sm:mt-6 sm:[font-size:var(--text-headline)]">
        Look closer at the films that move you.
      </p>
      <p className="motion-fade-rise-delay mt-3 max-w-md text-sm text-muted sm:mt-4 sm:text-base">
        A personal cinema companion for tracking, reviewing, and rediscovering
        what you watch.
      </p>

      <div className="motion-fade-in mt-8 flex w-full max-w-sm flex-col items-stretch gap-3 sm:mt-10 sm:max-w-none sm:flex-row sm:items-center sm:justify-center sm:gap-4">
        <Link href="/signup" className="btn btn-solid">
          Sign up
        </Link>
        <Link
          href="/login"
          className="btn btn-lg hover:border-[var(--color-primary)]"
        >
          Log in
        </Link>
      </div>

      <div className="motion-fade-in mt-10 sm:mt-12">
        <ShellHealth />
      </div>
    </div>
  );
}
