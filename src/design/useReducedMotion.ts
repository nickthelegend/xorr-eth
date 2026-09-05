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

/** Duration that collapses to 0 under reduced motion. */
export function motionDuration(ms: number, reduced: boolean): number {
  return reduced ? 0 : ms;
}
