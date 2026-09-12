/**
 * motion.ts — the motion policy.
 *
 * Rewritten 2026-09-12 to the product owner's reference video. There are two kinds of motion now,
 * with different rules:
 *
 *   INTERACTION — a control the user touched: Switch, Segmented, the chat sheet. Platform default
 *   easing, the 150/180/250 scale, no overshoot. Unchanged.
 *
 *   ARRIVAL — a screen appearing. Sections rise into place one after another, a chart draws itself
 *   left to right, a figure's digits roll in. Ease-out, `duration.enter` / `duration.draw`, staggered
 *   so the eye reads top to bottom. Screens get it from `<Rise>` and `<RollingNumber>`, never from
 *   reanimated's builders directly.
 *
 * What did not change: no spring, bounce or overshoot anywhere; every animation collapses to an
 * instant state change under reduced motion; and no figure ever shows a value it does not have.
 * Digits roll in AT their true value — nothing counts through numbers the market never printed.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Easing, FadeInDown, ReduceMotion, type WithTimingConfig } from 'react-native-reanimated';
import { duration } from './tokens';

/**
 * The interaction easing: the platform default. CSS `ease` is `cubic-bezier(.25,.1,.25,1)`, which is
 * exactly `Easing.inOut(Easing.ease)`.
 */
export const easing = Easing.inOut(Easing.ease);

/** The arrival easing: quick out of the gate, settling gently — how a sheet comes to rest. */
export const easeOut = Easing.out(Easing.cubic);

/**
 * A timing config. Pass `reduced` from `useReducedMotion()` and the transition collapses to an
 * instant state change — the colour or position alone still carries the meaning.
 *
 * Seed a shared value with the current state and drive it from a `useEffect` with this, rather than
 * returning `withTiming` out of a `useDerivedValue` — the latter starts at 0 and animates to the
 * current state on mount, which is an entrance on a control that has not changed.
 */
export function timing(ms: number, reduced: boolean): WithTimingConfig {
  return { duration: reduced ? 0 : ms, easing };
}

/** The same, on the arrival curve. */
export function arrival(ms: number, reduced: boolean): WithTimingConfig {
  return { duration: reduced ? 0 : ms, easing: easeOut };
}

/** The beat between one arriving element and the next. */
export const STAGGER = 60;

/**
 * The entrance for the `index`-th element of a screen — undefined under reduced motion.
 *
 * `ReduceMotion.System` as well as the flag: `useReducedMotion` answers asynchronously, so on the very
 * first mount it still reads false. The builder asks the OS itself at the moment it runs.
 */
export function enterAt(index: number, reduced: boolean) {
  if (reduced) return undefined;
  return FadeInDown.duration(duration.enter)
    .delay(index * STAGGER)
    .easing(easeOut)
    .reduceMotion(ReduceMotion.System);
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
