'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { ProfileAvatar } from '@/components/profile-avatar';
import { MOTION_DURATION_MED_MS } from '@/lib/motion';
import {
  ACCOUNT_OPEN_ATTR,
  applySiblingInert,
  clearBodyDataAttr,
  clearSiblingInert,
  CLOSE_ACCOUNT_EVENT,
  CLOSE_SEARCH_EVENT,
  dispatchOverlayClose,
  type FinishCloseOptions,
  lockBodyOverflow,
  restoreBodyOverflow,
  saveBodyOverflow,
  setBodyDataAttr,
} from '@/lib/overlay_chrome';

type MenuPhase = 'closed' | 'open' | 'closing';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled])';

function UserIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 19.25a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

function ProfileGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 19.25a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

function PublicProfileGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8.25" />
      <path d="M3.75 12h16.5M12 3.75c2.4 2.6 2.4 13.9 0 16.5M12 3.75c-2.4 2.6-2.4 13.9 0 16.5" />
    </svg>
  );
}

function LibraryGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 5.5h11.5a2 2 0 0 1 2 2V19" />
      <path d="M4 5.5V19a2.5 2.5 0 0 1 2.5-2.5H19" />
      <path d="M8 9h6.5M8 12.5h5" />
    </svg>
  );
}

function SettingsGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6" />
    </svg>
  );
}

function ChevronGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="opacity-45 transition group-hover:translate-x-0.5 group-hover:opacity-80"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/**
 * Profile icon dropdown: cinematic glass disclosure with Profile / Library /
 * Settings (and Public profile when username is set).
 */
export function AccountMenu({
  username,
  displayName,
}: {
  username: string | null;
  displayName: string | null;
}) {
  const pathname = usePathname();
  const panelId = useId();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const previousOverflowRef = useRef('');
  const inertedRef = useRef<HTMLElement[]>([]);
  const chromeActiveRef = useRef(false);
  const phaseRef = useRef<MenuPhase>('closed');
  const [phase, setPhase] = useState<MenuPhase>('closed');
  const [mounted, setMounted] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null);
  const [anchor, setAnchor] = useState({ top: 0, right: 0 });

  const visible = phase === 'open' || phase === 'closing';
  const leaving = phase === 'closing';
  const ownUsername = username?.trim() || '';
  const label = displayName?.trim() || ownUsername || 'Account';

  phaseRef.current = phase;

  useEffect(() => {
    setMounted(true);
  }, []);

  const syncAnchor = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    setAnchor({
      top: rect.bottom + 10,
      right: Math.max(12, window.innerWidth - rect.right),
    });
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const teardownOverlayChrome = useCallback(() => {
    clearSiblingInert(inertedRef.current);
    inertedRef.current = [];
    clearBodyDataAttr(ACCOUNT_OPEN_ATTR);
    if (chromeActiveRef.current) {
      restoreBodyOverflow(previousOverflowRef.current);
      chromeActiveRef.current = false;
    }
  }, []);

  const finishClose = useCallback(
    (options?: FinishCloseOptions) => {
      if (phaseRef.current === 'closed') {
        return;
      }
      clearCloseTimer();
      teardownOverlayChrome();
      if (options?.suppressFocusRestore !== true) {
        triggerRef.current?.focus();
      }
      setPhase('closed');
    },
    [clearCloseTimer, teardownOverlayChrome],
  );

  const beginClose = useCallback(() => {
    if (phaseRef.current !== 'open') {
      return;
    }
    clearCloseTimer();
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (reduceMotion) {
      finishClose();
      return;
    }
    setPhase('closing');
    closeTimerRef.current = window.setTimeout(() => {
      finishClose();
    }, MOTION_DURATION_MED_MS);
  }, [clearCloseTimer, finishClose]);

  const requestDismiss = useCallback(() => {
    if (phaseRef.current === 'closing') {
      finishClose();
      return;
    }
    beginClose();
  }, [beginClose, finishClose]);

  const openMenu = useCallback(() => {
    // B1: peer finishClose synchronously before our chrome applies.
    dispatchOverlayClose(CLOSE_SEARCH_EVENT);
    clearCloseTimer();
    syncAnchor();
    setPhase('open');
  }, [clearCloseTimer, syncAnchor]);

  // B1: peer open → synchronous finishClose (full teardown, no focus steal).
  useEffect(() => {
    function onPeerClose() {
      if (phaseRef.current === 'closed') {
        return;
      }
      finishClose({ suppressFocusRestore: true });
    }
    document.addEventListener(CLOSE_ACCOUNT_EVENT, onPeerClose);
    return () => {
      document.removeEventListener(CLOSE_ACCOUNT_EVENT, onPeerClose);
    };
  }, [finishClose]);

  // Pathname change: same teardown path (no focus restore while navigating).
  useEffect(() => {
    if (phaseRef.current === 'closed') {
      return;
    }
    finishClose({ suppressFocusRestore: true });
  }, [pathname, finishClose]);

  // Overlay chrome + Escape/Tab while visible; full cleanup on unmount or close.
  useLayoutEffect(() => {
    if (!visible || !portalRoot) {
      return;
    }

    previousOverflowRef.current = saveBodyOverflow();
    lockBodyOverflow();
    setBodyDataAttr(ACCOUNT_OPEN_ATTR);
    chromeActiveRef.current = true;
    inertedRef.current = applySiblingInert(portalRoot);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (phaseRef.current === 'open') {
          event.preventDefault();
          beginClose();
          return;
        }
        if (phaseRef.current === 'closing') {
          event.preventDefault();
          finishClose();
          return;
        }
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusable = Array.from(
        portalRoot.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute('disabled'));
      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !portalRoot.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !portalRoot.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    function onReposition() {
      syncAnchor();
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
      clearCloseTimer();
      teardownOverlayChrome();
    };
  }, [
    visible,
    portalRoot,
    beginClose,
    finishClose,
    syncAnchor,
    clearCloseTimer,
    teardownOverlayChrome,
  ]);

  useEffect(() => {
    if (phase !== 'open') {
      return;
    }
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    focusable?.focus();
  }, [phase]);

  const publicProfileHref = ownUsername ? `/u/${ownUsername}` : null;

  const links: Array<{
    href: string;
    label: string;
    hint: string;
    current: boolean;
    icon: ReactNode;
  }> = [
    {
      href: '/account',
      label: 'Profile',
      hint: ownUsername ? `@${ownUsername}` : 'Your account',
      current: pathname === '/account',
      icon: <ProfileGlyph />,
    },
    ...(publicProfileHref
      ? [
          {
            href: publicProfileHref,
            label: 'Public profile',
            hint: `@${ownUsername}`,
            // B2: exact own public profile path only.
            current: pathname === publicProfileHref,
            icon: <PublicProfileGlyph />,
          },
        ]
      : []),
    {
      href: '/library',
      label: 'Library',
      hint: 'Watchlist, lists & diary',
      current: pathname.startsWith('/library'),
      icon: <LibraryGlyph />,
    },
    {
      href: '/settings',
      label: 'Settings',
      hint: 'Preferences',
      current: pathname === '/settings',
      icon: <SettingsGlyph />,
    },
  ];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={
          ownUsername ? `Account menu (@${ownUsername})` : 'Account menu'
        }
        aria-expanded={visible}
        aria-controls={visible ? panelId : undefined}
        aria-haspopup="true"
        onClick={() => {
          if (phase === 'open') {
            beginClose();
          } else if (phase === 'closing') {
            finishClose();
          } else {
            openMenu();
          }
        }}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-pill)] text-muted transition hover:bg-[var(--color-primary-soft)] hover:text-foreground sm:h-12 sm:w-12 ${
          phase === 'open'
            ? 'bg-[var(--color-primary-soft)] text-foreground ring-1 ring-[var(--color-primary)]/35'
            : ''
        }`}
      >
        {ownUsername ? (
          <ProfileAvatar
            username={ownUsername}
            displayName={displayName}
            size="sm"
          />
        ) : (
          <UserIcon className="h-6 w-6 sm:h-7 sm:w-7" />
        )}
      </button>

      {mounted && visible
        ? createPortal(
            <div
              ref={setPortalRoot}
              className="fixed inset-0 z-[var(--z-overlay)]"
              role="presentation"
            >
              <div
                className={[
                  'account-menu-backdrop absolute inset-0',
                  leaving ? 'is-leaving' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="presentation"
                onClick={requestDismiss}
              />
              <div
                ref={panelRef}
                id={panelId}
                aria-labelledby={titleId}
                className={[
                  'account-menu-panel absolute z-[1] w-[min(18.5rem,calc(100vw-1.5rem))]',
                  leaving ? 'is-leaving' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ top: anchor.top, right: anchor.right }}
              >
                <div className="account-menu-surface overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-[0_28px_90px_rgba(0,0,0,0.55)]">
                  <div className="account-menu-header relative px-4 pb-4 pt-4">
                    <p className="text-[length:var(--text-xs)] font-semibold tracking-[var(--tracking-wider)] text-muted">
                      ACCOUNT
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      {ownUsername ? (
                        <ProfileAvatar
                          username={ownUsername}
                          displayName={displayName}
                          size="sm"
                        />
                      ) : (
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-primary-soft)] text-foreground">
                          <UserIcon className="h-5 w-5" />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p
                          id={titleId}
                          className="truncate font-display text-[length:var(--text-body)] font-semibold leading-tight tracking-[var(--tracking-tight)] text-foreground"
                        >
                          {label}
                        </p>
                        {ownUsername ? (
                          <p className="mt-0.5 truncate text-[length:var(--text-xs)] text-muted">
                            @{ownUsername}
                          </p>
                        ) : (
                          <p className="mt-0.5 truncate text-[length:var(--text-xs)] text-muted">
                            Signed in
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <nav
                    aria-label="Account"
                    className="flex flex-col gap-0.5 p-2 pt-2.5"
                  >
                    {links.map((item, index) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={item.current ? 'page' : undefined}
                        onClick={() => {
                          finishClose({ suppressFocusRestore: true });
                        }}
                        style={{ animationDelay: `${60 + index * 40}ms` }}
                        className={`account-menu-item group flex items-center gap-3 rounded-[var(--radius-sm)] px-2.5 py-2.5 transition ${
                          item.current
                            ? 'bg-[var(--color-primary-soft)] text-foreground'
                            : 'text-foreground hover:bg-[var(--color-fg)]/[0.06]'
                        }`}
                      >
                        <span
                          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border transition ${
                            item.current
                              ? 'border-[var(--color-primary)]/35 bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                              : 'border-[var(--color-border)] bg-[var(--color-bg)]/35 text-muted group-hover:border-[var(--color-primary)]/30 group-hover:text-foreground'
                          }`}
                        >
                          {item.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[length:var(--text-body-sm)] font-medium tracking-wide">
                            {item.label}
                          </span>
                          <span className="mt-0.5 block truncate text-[length:var(--text-xs)] text-muted">
                            {item.hint}
                          </span>
                        </span>
                        <ChevronGlyph />
                      </Link>
                    ))}
                  </nav>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
