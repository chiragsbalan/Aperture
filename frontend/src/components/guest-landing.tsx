'use client';

import dynamic from 'next/dynamic';
import { useState, type ReactNode } from 'react';

import {
  GuestLandingHero,
  type GuestLandingPanel,
} from '@/components/guest-landing-hero';
import { HomeCatalogRails } from '@/components/home-catalog-rails';
import type { TopMovie } from '@/lib/catalog';

const PosterMosaic = dynamic(
  () => import('@/components/poster-mosaic').then((mod) => mod.PosterMosaic),
  {
    ssr: false,
    loading: () => (
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
      />
    ),
  },
);

interface GuestLandingProps {
  posters: string[];
  inTheatres: TopMovie[];
  movies: TopMovie[];
  shows: TopMovie[];
}

function CapabilityIcon({ children }: { children: ReactNode }) {
  return (
    <span
      className="mb-3 inline-flex h-9 w-9 items-center justify-center text-accent"
      aria-hidden
    >
      {children}
    </span>
  );
}

const CAPABILITIES = [
  {
    title: 'Track what you watch',
    body: 'Log films and shows in a personal diary you can revisit anytime.',
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 6.5h16M4 12h10M4 17.5h13" />
      </svg>
    ),
  },
  {
    title: 'Save what’s next',
    body: 'Build a watchlist and favorites so the next pick is always close.',
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 4.5h10v15.5l-5-3.25L7 20V4.5z" />
      </svg>
    ),
  },
  {
    title: 'Rate and remember',
    body: 'Half-star ratings and notes keep your reaction with the title.',
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m12 3.5 2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9L12 3.5z" />
      </svg>
    ),
  },
  {
    title: 'Make lists',
    body: 'Compile custom lists — keep them private or share them publicly.',
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" />
      </svg>
    ),
  },
  {
    title: 'Follow people',
    body: 'See what friends and fellow cinephiles are watching and loving.',
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
        <path d="M16.5 11a3 3 0 1 0 0-4" />
        <path d="M19.5 19a4.5 4.5 0 0 0-3.2-4.3" />
      </svg>
    ),
  },
  {
    title: 'Look closer',
    body: 'Browse cast, similar titles, and the details that make a film stick.',
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16.2 16.2 20 20" />
      </svg>
    ),
  },
] as const;

/**
 * Logged-out `/` story: hero (marketing ↔ login ↔ signup) → capabilities →
 * rails. Auth panels stay on `/`; the rest of the page stays scrollable.
 */
export function GuestLanding({
  posters,
  inTheatres,
  movies,
  shows,
}: GuestLandingProps) {
  const [panel, setPanel] = useState<GuestLandingPanel>('marketing');

  return (
    <>
      <section className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-5 py-24 sm:px-6 sm:py-28">
        <PosterMosaic posters={posters} />
        <div className="motion-fade-rise relative z-[1] w-full max-w-xl">
          <GuestLandingHero panel={panel} onPanelChange={setPanel} />
        </div>
        {/* Seam fade only — keeps mosaic full-bleed to the viewport bottom. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-24 bg-gradient-to-b from-transparent to-[var(--color-bg)] sm:h-32"
        />
      </section>

      <section
        aria-labelledby="aperture-lets-you-heading"
        className="relative z-[1] bg-[var(--color-bg)] py-14 motion-fade-in sm:py-20"
      >
        <div className="layout-content">
          <h2
            id="aperture-lets-you-heading"
            className="type-rail text-center text-foreground"
          >
            Aperture lets you…
          </h2>
          <ul className="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {CAPABILITIES.map((item) => (
              <li key={item.title}>
                <button
                  type="button"
                  onClick={() => {
                    setPanel('signup');
                  }}
                  className="block h-full w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/60 px-5 py-5 text-left transition hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
                >
                  <CapabilityIcon>{item.icon}</CapabilityIcon>
                  <p className="font-display text-base font-medium text-foreground">
                    {item.title}
                  </p>
                  <p className="mt-2 text-sm text-muted">{item.body}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        aria-label="Discover titles"
        className="relative z-[1] bg-[var(--color-bg)] py-12 sm:py-16"
      >
        <HomeCatalogRails
          inTheatres={inTheatres}
          movies={movies}
          shows={shows}
          firstHeadingLevel="h2"
        />
      </section>
    </>
  );
}
