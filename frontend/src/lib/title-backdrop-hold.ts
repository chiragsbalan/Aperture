/**
 * @fileoverview Hide the current title backdrop as soon as a poster morph starts.
 *
 * Soft navigations keep the previous title page mounted until the next RSC
 * payload arrives. An inline opacity on ``[data-title-backdrop]`` is not enough:
 * React can reconcile it away, and flight teardown restores it while the old
 * art is still on screen. A document attribute plus a listener lets the
 * outgoing atmosphere stay cleared until the incoming detail mounts.
 */

export const TITLE_BACKDROP_HOLD_ATTR = 'data-title-backdrop-hold';

type HoldListener = () => void;

const holdListeners = new Set<HoldListener>();

/** Content id whose atmosphere must stay cleared until a different title mounts. */
let suppressedContentId: string | null = null;

function holdRoot(): HTMLElement | null {
  if (typeof document === 'undefined') {
    return null;
  }
  return document.documentElement;
}

/** Hide any current title backdrop immediately (click path, including reduced motion). */
export function holdOutgoingTitleBackdrop(): void {
  holdRoot()?.setAttribute(TITLE_BACKDROP_HOLD_ATTR, '');
  for (const listener of holdListeners) {
    listener();
  }
}

/** Remember which title started the morph so a remount of that page stays clear. */
export function suppressTitleBackdrop(contentId: string): void {
  suppressedContentId = contentId;
}

export function isTitleBackdropSuppressed(contentId: string): boolean {
  return suppressedContentId != null && suppressedContentId === contentId;
}

/**
 * Let a different title paint.
 *
 * A remount of the suppressed id must not clear the hold, or the old art
 * flashes back while soft navigation still has that page mounted.
 */
export function claimIncomingTitleBackdrop(contentId: string): void {
  if (suppressedContentId == null || suppressedContentId === contentId) {
    return;
  }
  suppressedContentId = null;
  holdRoot()?.removeAttribute(TITLE_BACKDROP_HOLD_ATTR);
}

export function subscribeTitleBackdropHold(listener: HoldListener): () => void {
  holdListeners.add(listener);
  return () => {
    holdListeners.delete(listener);
  };
}
