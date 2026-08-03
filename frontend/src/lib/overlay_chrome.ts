/**
 * @fileoverview Shared body-chrome helpers for header overlays (search, account).
 */

/** Dispatched when AccountMenu opens; SiteSearch must finishClose synchronously. */
export const CLOSE_SEARCH_EVENT = 'aperture:close-search';

/** Dispatched when SiteSearch opens; AccountMenu must finishClose synchronously. */
export const CLOSE_ACCOUNT_EVENT = 'aperture:close-account';

export const SEARCH_OPEN_ATTR = 'data-search-open';
export const ACCOUNT_OPEN_ATTR = 'data-account-open';

export interface FinishCloseOptions {
  suppressFocusRestore?: boolean;
}

/** Mark every body child except `portalRoot` inert; returns elements we flipped. */
export function applySiblingInert(portalRoot: HTMLElement): HTMLElement[] {
  const inerted: HTMLElement[] = [];
  for (const child of Array.from(document.body.children)) {
    if (child === portalRoot || !(child instanceof HTMLElement)) {
      continue;
    }
    if (!child.inert) {
      child.inert = true;
      inerted.push(child);
    }
  }
  return inerted;
}

/** Clear inert from elements previously returned by applySiblingInert. */
export function clearSiblingInert(inerted: HTMLElement[]): void {
  for (const el of inerted) {
    el.inert = false;
  }
}

/** Save current body overflow for later restore. */
export function saveBodyOverflow(): string {
  return document.body.style.overflow;
}

/** Lock body scroll while an overlay owns chrome. */
export function lockBodyOverflow(): void {
  document.body.style.overflow = 'hidden';
}

/** Restore body overflow saved via saveBodyOverflow. */
export function restoreBodyOverflow(previous: string): void {
  document.body.style.overflow = previous;
}

/** Set a boolean body data attribute (empty string value). */
export function setBodyDataAttr(name: string): void {
  document.body.setAttribute(name, '');
}

/** Remove a body data attribute. */
export function clearBodyDataAttr(name: string): void {
  document.body.removeAttribute(name);
}

/** Request peer overlay to finishClose synchronously (CustomEvent, bubbles). */
export function dispatchOverlayClose(eventName: string): void {
  document.dispatchEvent(new Event(eventName));
}
