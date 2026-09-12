import type { ReactNode } from 'react';

/** Stacked muted facts under a catalog detail title (release, credits, born). */
export function TitleMetaStack({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 flex flex-col gap-y-1 text-xs text-muted sm:mt-3 sm:gap-y-1.5 sm:text-sm">
      {children}
    </div>
  );
}

/** One wrap row inside {@link TitleMetaStack}. */
export function TitleMetaRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 sm:gap-x-3">
      {children}
    </div>
  );
}
