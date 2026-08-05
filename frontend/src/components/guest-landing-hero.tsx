'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { AuthForm } from '@/components/auth-form';
import { MOTION_DURATION_SLOW_MS } from '@/lib/motion';

export type GuestLandingPanel = 'marketing' | 'login' | 'signup';

type SlideDirection = 'up' | 'down';

interface GuestLandingHeroProps {
  panel: GuestLandingPanel;
  onPanelChange: (panel: GuestLandingPanel) => void;
}

function MarketingPanel({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="flex flex-col items-center px-1 text-center">
      <h1 className="type-brand text-foreground">Aperture</h1>
      <p className="mt-3 flex max-w-md flex-col items-center gap-0.5 font-display font-medium text-foreground sm:mt-4 sm:gap-1">
        <span className="text-[length:var(--text-rail)] sm:text-[length:var(--text-subsection)]">
          Track films you’ve watched.
        </span>
        <span className="text-[length:var(--text-body-sm)] sm:text-[length:var(--text-body)]">
          Save those you want to see.
        </span>
        <span className="text-[length:var(--text-caption)] sm:text-[length:var(--text-body-sm)]">
          Look closer at what’s good.
        </span>
      </p>
      <div className="mt-6 sm:mt-8">
        <button type="button" className="btn btn-solid" onClick={onGetStarted}>
          Get started
        </button>
      </div>
    </div>
  );
}

function AuthPanel({
  mode,
  onBack,
  onSwitchMode,
  autoFocusFirstField,
}: {
  mode: 'login' | 'signup';
  onBack: () => void;
  onSwitchMode: (mode: 'login' | 'signup') => void;
  autoFocusFirstField: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-md text-left">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-sm text-muted transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
      >
        ← Back
      </button>
      <AuthForm
        mode={mode}
        onSwitchMode={onSwitchMode}
        autoFocusFirstField={autoFocusFirstField}
      />
    </div>
  );
}

function panelNode(
  panel: GuestLandingPanel,
  handlers: {
    onGetStarted: () => void;
    onBack: () => void;
    onSwitchMode: (mode: 'login' | 'signup') => void;
  },
  autoFocusFirstField: boolean,
): ReactNode {
  if (panel === 'marketing') {
    return <MarketingPanel onGetStarted={handlers.onGetStarted} />;
  }
  return (
    <AuthPanel
      mode={panel}
      onBack={handlers.onBack}
      onSwitchMode={handlers.onSwitchMode}
      autoFocusFirstField={autoFocusFirstField}
    />
  );
}

/** Forward stack (up): marketing → login → signup. Reverse (down): signup → login. */
function slideDirection(
  from: GuestLandingPanel,
  to: GuestLandingPanel,
): SlideDirection {
  const order: Record<GuestLandingPanel, number> = {
    marketing: 0,
    login: 1,
    signup: 2,
  };
  return order[to] >= order[from] ? 'up' : 'down';
}

/**
 * Crossfades guest hero marketing ↔ login ↔ signup on `/` (mosaic stays).
 */
export function GuestLandingHero({
  panel,
  onPanelChange,
}: GuestLandingHeroProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef(panel);
  const [visiblePanel, setVisiblePanel] = useState(panel);
  const [outgoing, setOutgoing] = useState<ReactNode | null>(null);
  const [slide, setSlide] = useState<SlideDirection>('up');
  const [stageHeight, setStageHeight] = useState<number | undefined>();
  const [reduceMotion, setReduceMotion] = useState(false);

  const inertHandlers = {
    onGetStarted: () => {},
    onBack: () => {},
    onSwitchMode: (_mode: 'login' | 'signup') => {},
  };

  const liveHandlers = {
    onGetStarted: () => {
      onPanelChange('login');
    },
    onBack: () => {
      onPanelChange('marketing');
    },
    onSwitchMode: (mode: 'login' | 'signup') => {
      onPanelChange(mode);
    },
  };

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setReduceMotion(motion.matches);
    };
    sync();
    motion.addEventListener('change', sync);
    return () => {
      motion.removeEventListener('change', sync);
    };
  }, []);

  useEffect(() => {
    if (panel === panelRef.current) {
      return;
    }

    const previous = panelRef.current;
    const direction = slideDirection(previous, panel);
    // Outgoing panels never auto-focus fields.
    const previousNode = panelNode(previous, inertHandlers, false);

    panelRef.current = panel;
    setSlide(direction);

    window.scrollTo({
      top: 0,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });

    if (reduceMotion) {
      setOutgoing(null);
      setVisiblePanel(panel);
      setStageHeight(undefined);
      return;
    }

    const fromHeight = stageRef.current?.offsetHeight ?? 0;
    setOutgoing(previousNode);
    setVisiblePanel(panel);
    if (fromHeight > 0) {
      setStageHeight(fromHeight);
    }

    let cancelled = false;
    let settleTimer = 0;
    let measureFrame = 0;

    measureFrame = window.requestAnimationFrame(() => {
      measureFrame = window.requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }
        const incoming = stageRef.current?.querySelector<HTMLElement>(
          '[data-guest-hero-panel="incoming"]',
        );
        const toHeight = incoming?.scrollHeight ?? 0;
        if (toHeight > 0) {
          setStageHeight(toHeight);
        }

        settleTimer = window.setTimeout(() => {
          if (cancelled) {
            return;
          }
          setOutgoing(null);
          setStageHeight(undefined);
        }, MOTION_DURATION_SLOW_MS);
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(measureFrame);
      window.clearTimeout(settleTimer);
    };
  }, [panel, reduceMotion]);

  const isCrossfading = outgoing != null;
  // Focus first field only after the slide settles (or immediately when
  // reduced-motion skips the crossfade).
  const autoFocusFirstField =
    !isCrossfading && (visiblePanel === 'login' || visiblePanel === 'signup');
  const incomingNode = panelNode(
    visiblePanel,
    liveHandlers,
    autoFocusFirstField,
  );

  return (
    <div
      ref={stageRef}
      className={`guest-hero-panel-stage motion-size title-tab-panel-stage relative w-full${
        stageHeight != null ? ' is-resizing' : ''
      }`}
      style={stageHeight != null ? { height: stageHeight } : undefined}
    >
      {outgoing != null ? (
        <div
          className={`title-tab-panel title-tab-panel-layer is-outgoing guest-hero-slide-out-${slide}`}
          aria-hidden
          inert
        >
          {outgoing}
        </div>
      ) : null}
      <div
        data-guest-hero-panel="incoming"
        className={`title-tab-panel ${
          isCrossfading ? `guest-hero-slide-in-${slide}` : 'is-active'
        }`}
      >
        {incomingNode}
      </div>
    </div>
  );
}
