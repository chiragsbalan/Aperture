'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import {
  GuestLandingHero,
  type GuestLandingPanel,
} from '@/components/guest-landing-hero';
import { registerReturnToMarketing } from '@/lib/guest-landing-return';
import { MOTION_DURATION_SLOW_MS } from '@/lib/motion';

interface GuestAuthRouteProps {
  mode: 'login' | 'signup';
  initialError?: string | null;
}

/**
 * `/login` and `/signup`: the logo slides back to the marketing landing,
 * same reverse motion as the in-page auth panel, then replaces the route.
 */
export function GuestAuthRoute({
  mode,
  initialError = null,
}: GuestAuthRouteProps) {
  const router = useRouter();
  const [panel, setPanel] = useState<GuestLandingPanel>(mode);
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);

  useEffect(() => {
    let timer = 0;
    const unregister = registerReturnToMarketing(() => {
      if (leavingRef.current) {
        return true;
      }
      leavingRef.current = true;
      setLeaving(true);
      setPanel('marketing');
      const reduce = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      timer = window.setTimeout(
        () => {
          document.documentElement.dataset.skipLandingEntrance = '1';
          router.replace('/');
        },
        reduce ? 0 : MOTION_DURATION_SLOW_MS,
      );
      return true;
    });
    return () => {
      unregister();
      window.clearTimeout(timer);
    };
  }, [router]);

  return (
    <div
      className={`motion-fade-rise w-full max-w-xl ${leaving ? 'pointer-events-none' : ''}`}
    >
      <GuestLandingHero
        panel={panel}
        onPanelChange={(next) => {
          if (leavingRef.current) {
            return;
          }
          setPanel(next);
        }}
        showBack={false}
        initialError={initialError}
        switchModeInPlace={false}
      />
    </div>
  );
}
