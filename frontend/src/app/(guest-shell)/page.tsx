import { ShellHealth } from '@/components/shell-health';

export default function Home() {
  return (
    <div className="flex flex-col items-center text-center">
      <h1 className="motion-fade-rise font-display [font-size:var(--text-brand)] font-semibold leading-none tracking-[var(--tracking-brand)] text-foreground">
        Aperture
      </h1>
      <p className="motion-fade-rise-delay mt-6 max-w-xl font-display [font-size:var(--text-headline)] font-medium text-foreground">
        Look closer at the films that move you.
      </p>
      <p className="motion-fade-rise-delay mt-4 max-w-md text-muted">
        A personal cinema companion for tracking, reviewing, and rediscovering
        what you watch.
      </p>
      <p className="motion-fade-in mt-8 max-w-md text-sm text-muted">
        Catalog pages live at{' '}
        <span className="text-foreground">/movies/[id]</span>,{' '}
        <span className="text-foreground">/tv/[id]</span>, and{' '}
        <span className="text-foreground">/people/[id]</span>. Seed locally with{' '}
        <span className="text-foreground">make seed-metadata</span> to print
        sample UUIDs.
      </p>
      <div className="mt-10">
        <ShellHealth />
      </div>
    </div>
  );
}
