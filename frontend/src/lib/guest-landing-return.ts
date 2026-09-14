/**
 * @fileoverview Logo → marketing return for guest login and signup.
 *
 * The header logo asks the mounted auth surface to play the same reverse
 * slide as the landing back control, instead of a hard jump to `/`.
 */

type ReturnToMarketing = () => boolean;

let returnToMarketing: ReturnToMarketing | null = null;

/** Register the surface that can slide back to the marketing landing. */
export function registerReturnToMarketing(
  handler: ReturnToMarketing,
): () => void {
  returnToMarketing = handler;
  return () => {
    if (returnToMarketing === handler) {
      returnToMarketing = null;
    }
  };
}

/**
 * Play the reverse landing slide when one is mounted.
 * Returns false when the logo should navigate normally.
 */
export function requestReturnToMarketing(): boolean {
  return returnToMarketing?.() ?? false;
}
