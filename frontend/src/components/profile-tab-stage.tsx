'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { MOTION_DURATION_MED_MS } from '@/lib/motion';

interface ProfileTabStageProps {
  children: ReactNode;
}

/**
 * Crossfades profile tab route content (same motion as title meta / seasons).
 */
export function ProfileTabStage({ children }: ProfileTabStageProps) {
  const pathname = usePathname();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const skipAnimRef = useRef(true);
  const pathRef = useRef(pathname);
  const childrenRef = useRef(children);
  const [panelPath, setPanelPath] = useState(pathname);
  const [panelChildren, setPanelChildren] = useState(children);
  const [outgoing, setOutgoing] = useState<{
    path: string;
    node: ReactNode;
  } | null>(null);
  const [stageHeight, setStageHeight] = useState<number | undefined>();
  const [reduceMotion, setReduceMotion] = useState(false);

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
    if (pathname === pathRef.current) {
      childrenRef.current = children;
      setPanelChildren(children);
    }
  }, [children, pathname]);

  useEffect(() => {
    if (skipAnimRef.current) {
      skipAnimRef.current = false;
      pathRef.current = pathname;
      childrenRef.current = children;
      setPanelPath(pathname);
      setPanelChildren(children);
      setOutgoing(null);
      setStageHeight(undefined);
      return;
    }

    if (pathname === pathRef.current) {
      return;
    }

    if (reduceMotion) {
      pathRef.current = pathname;
      childrenRef.current = children;
      setPanelPath(pathname);
      setPanelChildren(children);
      setOutgoing(null);
      setStageHeight(undefined);
      return;
    }

    const previousPath = pathRef.current;
    const previousChildren = childrenRef.current;
    const fromHeight = stageRef.current?.offsetHeight ?? 0;

    setOutgoing({ path: previousPath, node: previousChildren });
    pathRef.current = pathname;
    childrenRef.current = children;
    setPanelPath(pathname);
    setPanelChildren(children);
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
          '[data-profile-tab-panel="incoming"]',
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
        }, MOTION_DURATION_MED_MS);
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(measureFrame);
      window.clearTimeout(settleTimer);
    };
  }, [pathname, children, reduceMotion]);

  const isCrossfading = outgoing != null;

  return (
    <div
      ref={stageRef}
      className={`motion-size title-tab-panel-stage relative${
        stageHeight != null ? ' is-resizing' : ''
      }`}
      style={stageHeight != null ? { height: stageHeight } : undefined}
    >
      {outgoing != null ? (
        <div
          key={`out-${outgoing.path}`}
          className="title-tab-panel title-tab-panel-layer is-outgoing"
          aria-hidden
          inert
        >
          {outgoing.node}
        </div>
      ) : null}
      <div
        key={`in-${panelPath}`}
        data-profile-tab-panel="incoming"
        className={`title-tab-panel ${
          isCrossfading ? 'is-incoming' : 'is-active'
        }`}
      >
        {panelChildren}
      </div>
    </div>
  );
}
