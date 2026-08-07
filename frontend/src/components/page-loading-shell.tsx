import { type ReactNode } from 'react';

import { SiteHeader } from '@/components/site-header';

/**
 * Shared chrome for route ``loading.tsx`` files: skip link, header, main.
 */
export function PageLoadingShell({
  children,
  centered = false,
}: {
  children: ReactNode;
  /** Match settings / account vertical centering. */
  centered?: boolean;
}) {
  return (
    <div
      className={
        centered
          ? 'layout-shell shell-atmosphere relative flex min-h-dvh flex-col items-center justify-center'
          : 'layout-shell shell-atmosphere relative flex min-h-dvh flex-col overflow-x-hidden'
      }
    >
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative z-[1] w-full">
        {children}
      </main>
    </div>
  );
}
