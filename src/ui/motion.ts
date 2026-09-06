/**
 * motion.ts — the motion policy.
 *
 * animations.md, in one file: one property per transition, three durations, the platform
 * default easing, no entrance animations, and an instant degrade under reduced motion.
 *
 * Only two primitives animate — `Switch` (knob transform + track background, 180ms) and
 * `Segmented` (thumb background, 150ms). Everything else in the inventory is screen-level
 * and gets built with the screen. Prices never animate: interpolating a number implies a
 * market move that didn't happen.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Easing, type WithTimingConfig } from 'react-native-reanimated';
import { duration } from './tokens';

/**
 * The platform default easing. animations.md forbids a custom cubic-bezier, a spring and
 * any overshoot — overshoot on a confirmation control suggests the value is still settling.
 * CSS `ease` is `cubic-bezier(.25,.1,.25,1)`, which is exactly `Easing.inOut(Easing.ease)`.
 */
export const easing = Easing.inOut(Easing.ease);

/**
 * A timing config. Pass `reduced` from `useReducedMotion()` and the transition collapses
 * to an instant state change — the colour or position alone still carries the meaning.
 *
 * Seed a shared value with the current state and drive it from a `useEffect` with this,
 * rather than returning `withTiming` out of a `useDerivedValue` — the latter starts at 0
 * and animates to the current state on mount, which is an entrance animation on a control
 * that has not changed.
 *
 * On web these transitions advance on `requestAnimationFrame`, so they are frozen while
 * the tab is hidden. That is the browser throttling rAF, not the transition failing;
 * verify motion on a visible surface.
 */
export function timing(ms: number, reduced: boolean): WithTimingConfig {
  return { duration: reduced ? 0 : ms, easing };
}

export { duration };

/** Tracks the OS "reduce motion" setting for the life of the component. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) setReduced(on);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
