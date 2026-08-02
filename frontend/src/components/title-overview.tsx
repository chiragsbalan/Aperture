'use client';

import { useEffect, useId, useRef, useState } from 'react';

const MOBILE_MQ = '(max-width: 639px)';
const EXPAND_MS = 320;

/**
 * Title synopsis: full text on desktop; on mobile clamps to 3 lines and
 * toggles open/closed via an overlay button (no “show more” chrome).
 */
export function TitleOverview({
  text,
  className = '',
}: {
  text: string;
  className?: string;
}) {
  const synopsisId = useId();
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [collapsible, setCollapsible] = useState(false);
  const [collapsedHeight, setCollapsedHeight] = useState(0);
  const [fullHeight, setFullHeight] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => {
      setReduceMotion(motion.matches);
    };
    syncMotion();
    motion.addEventListener('change', syncMotion);
    return () => {
      motion.removeEventListener('change', syncMotion);
    };
  }, []);

  useEffect(() => {
    const el = textRef.current;
    if (!el) {
      return;
    }

    const measure = () => {
      const mobile = window.matchMedia(MOBILE_MQ).matches;
      if (!mobile) {
        setCollapsible(false);
        setExpanded(false);
        setCollapsedHeight(0);
        setFullHeight(0);
        return;
      }

      const previousMaxHeight = el.style.maxHeight;
      const previousOverflow = el.style.overflow;
      el.style.maxHeight = 'none';
      el.style.overflow = 'visible';

      const styles = getComputedStyle(el);
      const parsedLineHeight = Number.parseFloat(styles.lineHeight);
      const fontSize = Number.parseFloat(styles.fontSize);
      const lineHeight = Number.isFinite(parsedLineHeight)
        ? parsedLineHeight
        : fontSize * 1.625;
      const threeLines = lineHeight * 3;
      const full = el.scrollHeight;

      el.style.maxHeight = previousMaxHeight;
      el.style.overflow = previousOverflow;

      setCollapsedHeight(threeLines);
      setFullHeight(full);
      setCollapsible(full > threeLines + 1);
    };

    measure();
    // Remeasure after layout/fonts settle so the first paint is not stuck open.
    const rafId = window.requestAnimationFrame(measure);
    const mobileMq = window.matchMedia(MOBILE_MQ);
    mobileMq.addEventListener('change', measure);
    window.addEventListener('resize', measure);
    return () => {
      window.cancelAnimationFrame(rafId);
      mobileMq.removeEventListener('change', measure);
      window.removeEventListener('resize', measure);
    };
  }, [text]);

  const interactive = collapsible;
  const maxHeight =
    interactive && collapsedHeight > 0 && fullHeight > 0
      ? expanded
        ? fullHeight
        : collapsedHeight
      : undefined;

  function toggle() {
    if (!interactive) {
      return;
    }
    if (!window.matchMedia(MOBILE_MQ).matches) {
      return;
    }
    setExpanded((value) => !value);
  }

  const showFade = interactive && !expanded;

  return (
    <div className="relative">
      <p
        ref={textRef}
        id={synopsisId}
        data-title-overview=""
        aria-hidden={interactive && !expanded ? true : undefined}
        className={`max-w-2xl whitespace-pre-wrap text-[0.875rem] leading-relaxed text-foreground sm:text-[1.05rem] ${
          showFade ? 'title-overview-clamped' : ''
        } ${className}`}
        style={{
          maxHeight: maxHeight != null ? `${maxHeight}px` : undefined,
          overflow: maxHeight != null ? 'hidden' : undefined,
          transition:
            maxHeight != null && !reduceMotion
              ? `max-height ${EXPAND_MS}ms var(--ease-out)`
              : undefined,
        }}
      >
        {text}
      </p>
      {interactive ? (
        <button
          type="button"
          className="absolute inset-0 cursor-pointer sm:cursor-default"
          aria-expanded={expanded}
          aria-controls={synopsisId}
          aria-label={expanded ? 'Hide full overview' : 'Show full overview'}
          onClick={toggle}
        />
      ) : null}
    </div>
  );
}
