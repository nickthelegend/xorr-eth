/**
 * Refreshing.tsx — the last answer, kept, while the next one is on its way.
 *
 * A screen that comes back into view reads its numbers again (`useFreshOnReturn`), and it deliberately does NOT go back
 * to a skeleton: the question has not changed, so what is on screen is still true, and replacing a real balance with a
 * grey block to fetch the same balance again is the app throwing away a correct answer to look busy. That was already
 * right, and it made the refresh completely silent — a figure read thirty seconds ago and a figure being replaced this
 * instant were drawn identically.
 *
 * That is the "nothing" versus "not yet" conflation this app fixes everywhere else, one step along: **"still" versus
 * "still arriving"**. `<Refreshing on>` says the missing half. The value stays, exactly as it was, and breathes.
 *
 * ## Why this may sit on a price, where a skeleton may not
 *
 * animations.md's skeleton rule ends "Never on a price. It appears only where a value is absent." That rule is about a
 * BLOCK STANDING WHERE A FIGURE SHOULD BE — a grey rectangle pulsing in a price column, which says the price is unknown
 * when it is known. This is the opposite case and the opposite claim: the figure is there, it is true, it is the last
 * one the executor gave, and the breath says exactly that.
 *
 * The price rule itself — rule 1, never animate a price — is untouched. **No value moves and no value changes.** Nothing
 * interpolates, nothing counts, nothing slides. One property, opacity, on a figure that is already correct.
 *
 * It is shallower than the skeleton on purpose: to .78 rather than .45. A skeleton has nothing to be read, so it may
 * dim until it is plainly not content; this is content, and a balance that dims to half is a balance someone squints at.
 *
 * Off under reduced motion, where the value simply stays — which is the important half of this anyway.
 */
import React, { useEffect } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { duration, timing, useReducedMotion } from './motion';

/** How far a kept value dims. Shallow: this is content, and it has to stay readable at the bottom of the breath. */
const KEPT_TO = 0.78;

export interface RefreshingProps {
  /**
   * A re-read is in flight and what is inside is the last answer — `rereading` from `useAsync`.
   *
   * Not `loading`: that means the question changed and the answer on screen is about to be wrong, which is a
   * placeholder's job, not this one's.
   */
  on: boolean;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Refreshing({ on, children, style, testID }: RefreshingProps) {
  const reduced = useReducedMotion();
  const kept = useSharedValue(1);

  useEffect(() => {
    if (!on || reduced) {
      // Back to full on the answer, on the interaction curve: the value has stopped being the last one.
      kept.set(withTiming(1, timing(duration.slow, reduced)));
      return;
    }
    // `true` reverses, so it breathes rather than snapping back to full at the loop boundary — the skeleton's cadence.
    kept.set(withRepeat(withTiming(KEPT_TO, timing(duration.pulse, reduced)), -1, true));
  }, [on, reduced, kept]);

  const breathing = useAnimatedStyle(() => ({ opacity: kept.get() }));

  return (
    <Animated.View
      testID={testID}
      /*
       * Said as well as drawn. A screen reader hears the figure as it always did and is told the app is working, which
       * is the whole of what the breath conveys — nobody should need to see a pulse to know a number is being replaced.
       */
      accessibilityState={{ busy: on }}
      aria-busy={on}
      style={[style, breathing]}
    >
      {children}
    </Animated.View>
  );
}
