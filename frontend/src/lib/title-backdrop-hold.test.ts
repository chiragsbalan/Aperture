import { describe, expect, it, vi } from 'vitest';

import {
  claimIncomingTitleBackdrop,
  holdOutgoingTitleBackdrop,
  isTitleBackdropSuppressed,
  subscribeTitleBackdropHold,
  suppressTitleBackdrop,
  TITLE_BACKDROP_HOLD_ATTR,
} from './title-backdrop-hold';

describe('title backdrop hold', () => {
  it('notifies listeners so the outgoing atmosphere can unmount its art', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeTitleBackdropHold(listener);

    holdOutgoingTitleBackdrop();

    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    holdOutgoingTitleBackdrop();
    expect(listener).toHaveBeenCalledOnce();
  });

  it('sets and clears the document hold attribute when a DOM exists', () => {
    const root = {
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    };
    vi.stubGlobal('document', { documentElement: root });

    holdOutgoingTitleBackdrop();
    expect(root.setAttribute).toHaveBeenCalledWith(
      TITLE_BACKDROP_HOLD_ATTR,
      '',
    );

    suppressTitleBackdrop('title-a');
    claimIncomingTitleBackdrop('title-a');
    expect(root.removeAttribute).not.toHaveBeenCalled();
    expect(isTitleBackdropSuppressed('title-a')).toBe(true);

    claimIncomingTitleBackdrop('title-b');
    expect(root.removeAttribute).toHaveBeenCalledWith(TITLE_BACKDROP_HOLD_ATTR);
    expect(isTitleBackdropSuppressed('title-a')).toBe(false);

    vi.unstubAllGlobals();
  });
});
