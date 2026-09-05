/**
 * The onboarding progress header — screens.md screens 7/8/9: a back circle, a 4px track, and an
 * "n/total" counter.
 *
 * animations.md: the track animates `width` at 250ms — the longest duration, "so it reads as
 * progress".
 */
import React from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { ink, surfaces } from '../colors';
import { DURATION } from '../motion';
import { EASING } from '../easing';
import { type } from '../type';
import { motionDuration, useReducedMotion } from '../useReducedMotion';
import { IconButton } from './IconButton';

export function Progress({
  step,
  total,
  onBack,
}: {
  step: number;
  total: number;
  onBack?: () => void;
}) {
  const reduced = useReducedMotion();
  const pct = (step / total) * 100;

  const bar = useAnimatedStyle(() => ({
    width: withTiming(`${pct}%`, {
      duration: motionDuration(DURATION.slow, reduced),
      easing: EASING,
    }),
  }));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <IconButton
        name="back"
        accessibilityLabel="Back"
        onPress={onBack}
        background={surfaces.surfaceAlt}
      />
      <View
        style={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          backgroundColor: surfaces.control,
          overflow: 'hidden',
        }}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: total, now: step }}
      >
        <Animated.View style={[{ height: 4, borderRadius: 2, backgroundColor: ink.full }, bar]} />
      </View>
      <Text style={[type.footnote, { color: ink.i40 }]}>
        {step}/{total}
      </Text>
    </View>
  );
}
