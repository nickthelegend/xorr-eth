/**
 * Rise.tsx — how a section arrives.
 *
 * Wrap a block in `<Rise index={n}>` and it fades up into place `n` beats after the screen appears,
 * the way the reference video's sheets fill in from the top down. Screens never touch reanimated's
 * entrance builders themselves: this is the one place arrival motion is made, so it is the one place
 * that has to honour reduced motion — and does.
 */
import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { enterAt, useReducedMotion } from './motion';

export interface RiseProps {
  /** Its place in the arrival order — 0 arrives first. */
  index?: number;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Rise({ index = 0, children, style }: RiseProps) {
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={enterAt(index, reduced)} style={style}>
      {children}
    </Animated.View>
  );
}
