import Link from 'next/link';

import { ShellHealth } from '@/components/shell-health';

/**
 * Marketing hero for signed-out visitors on `/`.
 */
export function GuestLanding() {
  return (
    <div className="flex flex-col items-center px-1 text-center">
      <h1 className="motion-fade-rise font-display [font-size:var(--text-brand)] font-semibold leading-none tracking-[var(--tracking-brand)] text-foreground">
        Aperture
      </h1>
      <p className="motion-fade-rise-delay mt-4 max-w-xl font-display text-lg font-medium text-foreground sm:mt-6 sm:[font-size:var(--text-headline)]">
        Look closer at the films that move you.
      </p>
      <p className="motion-fade-rise-delay mt-3 max-w-md text-sm text-muted sm:mt-4 sm:text-base">
        A personal cinema companion for tracking, reviewing, and rediscovering
        what you watch.
      </p>

      <div className="motion-fade-in mt-8 flex w-full max-w-sm flex-col items-stretch gap-3 sm:mt-10 sm:max-w-none sm:flex-row sm:items-center sm:justify-center sm:gap-4">
        <Link
          href="/signup"
          className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-5 py-2.5 text-center text-base font-medium text-[#1a140c] transition hover:brightness-110 sm:text-[0.9375rem]"
        >
          Sign up
        </Link>
        <Link
          href="/login"
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-5 py-2.5 text-center text-base font-medium text-foreground transition hover:border-[var(--color-accent)] sm:text-[0.9375rem]"
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
