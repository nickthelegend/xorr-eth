/**
 * The thing that stops one press becoming two records.
 *
 * `useGuardedPress` in `Button.tsx` carried this logic inline, and its own docblock explains why it
 * exists at all: `loading` is React state, so two presses dispatched in the same tick both read
 * `loading === false` and both fire. Measured, not theorised — double-tapping "Alert me when WETH
 * is above $9000" created two identical alerts.
 *
 * It had no test, because a hook holding a ref inside a component is awkward to exercise and the
 * only honest end-to-end check is a real double-tap in a browser. Split out here for the same
 * reason `apiError.ts` was split out of `api.ts`: the part worth testing was the part that could
 * not be reached. The hook keeps one of these in a ref and is otherwise unchanged.
 */

/** Long enough to swallow a double tap, short enough not to be felt. Unchanged from Button.tsx. */
export const DOUBLE_TAP_MS = 800;

export type PressGuard = {
  /**
   * Try to take the lock. `true` means the caller owns it and should run; `false` means a press is
   * already in flight and this one must be dropped.
   */
  take(): boolean;
  /** Release it — on the promise settling, on `loading` clearing, or after the timeout. */
  release(): void;
  /** Whether a press is currently in flight. Exposed for tests and for the `loading` effect. */
  readonly held: boolean;
};

export function createPressGuard(): PressGuard {
  let inFlight = false;
  return {
    take() {
      if (inFlight) return false;
      inFlight = true;
      return true;
    },
    release() {
      inFlight = false;
    },
    get held() {
      return inFlight;
    },
  };
}
