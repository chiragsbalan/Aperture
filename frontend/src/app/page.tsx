import { ShellHealth } from '@/components/shell-health';

export default function Home() {
  return (
    <main className="shell-atmosphere relative flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="motion-fade-rise font-display [font-size:var(--text-brand)] font-semibold leading-none tracking-[var(--tracking-brand)] text-[var(--color-fg)]">
        Aperture
      </h1>
      <p className="motion-fade-rise-delay mt-6 max-w-xl font-display [font-size:var(--text-headline)] font-medium text-[var(--color-fg)]">
        Look closer at the films that move you.
      </p>
      <p className="motion-fade-rise-delay mt-4 max-w-md text-[var(--color-fg-muted)]">
        A personal cinema companion for tracking, reviewing, and rediscovering
        what you watch.
      </p>
      <div className="mt-10">
        <ShellHealth />
      </div>
    </main>
  );
}
