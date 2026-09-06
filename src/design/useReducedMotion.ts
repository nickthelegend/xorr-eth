/**
 * animations.md §6: "Respect reduced motion. Every transition degrades to an instant state
 * change with no loss of meaning."
 *
 * Every animated primitive reads this hook and passes duration 0 when it is true — the
 * color/position change alone still carries the information.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduced(v));
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduced;
}

/**
 * Duration that collapses to 0 under reduced motion.
 *
 * Marked as a worklet because most of its callers are inside `useAnimatedStyle`, whose body runs
 * on the UI runtime rather than the JS one. Without the directive that is a cross-runtime call,
 * and react-native-worklets refuses it outright:
 *
 *   [Worklets] Tried to synchronously call a Remote Function. Called "motionDuration" on the UI
 *   Runtime.
 *
 * Web never saw this — Reanimated runs everything on one thread there — so the error only appeared
 * the first time the app ran natively, on the very first screen with a Segmented control. The
 * directive makes the function itself available to both runtimes; the callers that are ordinary JS
 * are unaffected.
 */
export function motionDuration(ms: number, reduced: boolean): number {
  'worklet';
  return reduced ? 0 : ms;
}
