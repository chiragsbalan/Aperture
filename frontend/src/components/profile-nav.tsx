'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { PROFILE_TABS } from '@/lib/profile';
import { useScrollFadeX } from '@/lib/scroll-fade';

interface ProfileNavProps {
  username: string;
}

export function ProfileNav({ username }: ProfileNavProps) {
  const pathname = usePathname();
  const listId = useId();
  const tablistRef = useRef<HTMLElement | null>(null);
  const tablistHostRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [indicatorReady, setIndicatorReady] = useState(false);
  useScrollFadeX(tablistRef, PROFILE_TABS.length, tablistHostRef);

  const base = `/u/${encodeURIComponent(username)}`;
  const activeIndex = PROFILE_TABS.findIndex((tab) => {
    const href = tab.slug ? `${base}/${tab.slug}` : base;
    return tab.slug === ''
      ? pathname === base || pathname === `${base}/`
      : pathname === href || pathname.startsWith(`${href}/`);
  });

  useLayoutEffect(() => {
    const list = tablistRef.current;
    if (!list || activeIndex < 0) {
      return;
    }

    const syncIndicator = () => {
      const activeTab = tabRefs.current[activeIndex];
      if (!activeTab) {
        setIndicator({ left: 0, width: 0 });
        return;
      }
      setIndicator({
        left: activeTab.offsetLeft,
        width: activeTab.offsetWidth,
      });
      setIndicatorReady(true);
    };

    syncIndicator();

    const activeTab = tabRefs.current[activeIndex];
    if (activeTab) {
      const tabLeft = activeTab.offsetLeft;
      const tabRight = tabLeft + activeTab.offsetWidth;
      const viewLeft = list.scrollLeft;
      const viewRight = viewLeft + list.clientWidth;
      const pad = 24;
      if (tabLeft < viewLeft + pad) {
        list.scrollTo({ left: Math.max(0, tabLeft - pad), behavior: 'smooth' });
      } else if (tabRight > viewRight - pad) {
        list.scrollTo({
          left: tabRight - list.clientWidth + pad,
          behavior: 'smooth',
        });
      }
    }

    const observer = new ResizeObserver(syncIndicator);
    observer.observe(list);
    for (const tab of tabRefs.current) {
      if (tab) {
        observer.observe(tab);
      }
    }
    window.addEventListener('resize', syncIndicator);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncIndicator);
    };
  }, [activeIndex, pathname, username]);

  useEffect(() => {
    // Re-measure after fonts/layout settle on first paint.
    const frame = window.requestAnimationFrame(() => {
      const activeTab = tabRefs.current[activeIndex];
      if (!activeTab) {
        return;
      }
      setIndicator({
        left: activeTab.offsetLeft,
        width: activeTab.offsetWidth,
      });
      setIndicatorReady(true);
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [activeIndex]);

  return (
    <div ref={tablistHostRef} className="scroll-fade-x-host mt-8">
      <nav
        ref={tablistRef}
        aria-labelledby={listId}
        className="scroll-fade-x relative flex w-full flex-nowrap items-end gap-1 border-b border-[var(--color-border)] pb-px"
      >
        <span id={listId} className="sr-only">
          Profile sections
        </span>
        {PROFILE_TABS.map((tab, index) => {
          const href = tab.slug ? `${base}/${tab.slug}` : base;
          const active = index === activeIndex;
          return (
            <Link
              key={tab.label}
              href={href}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              className={`shrink-0 whitespace-nowrap px-3 pb-2 pt-2 text-sm transition-colors duration-[var(--duration-med)] ${
                active ? 'text-accent' : 'text-muted hover:text-foreground'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
        <span
          aria-hidden
          className="title-tab-indicator pointer-events-none absolute bottom-0 h-0.5 bg-accent"
          style={{
            width: indicator.width,
            transform: `translateX(${indicator.left}px)`,
            opacity: indicatorReady ? 1 : 0,
          }}
        />
      </nav>
    </div>
  );
}
