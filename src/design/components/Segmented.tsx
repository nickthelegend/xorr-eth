/**
 * Segmented — design.md §5. 2-3 exclusive options.
 *
 * Track padding 3-4 · radius 14-24 · background rgba(255,255,255,.05) (or sheet.fill + inputBorder
 * on black). Thumb flex:1 · height 34-42 · radius 11-22, selected #fff/#0B0B0B.
 *
 * animations.md: `background` only, 150ms — the fastest transition in the app, because
 * "selection must feel instant".
 */
import React from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, withTiming, interpolateColor } from 'react-native-reanimated';
import { borders, ink, sheet } from '../colors';
import { DURATION } from '../motion';
import { EASING } from '../easing';
import { useReducedMotion, motionDuration } from '../useReducedMotion';
import { type } from '../type';

export type SegmentedProps = {
  options: readonly string[];
  value: number;
  onChange: (index: number) => void;
  /** Thumb height. design.md: 34-42. Screen 7 uses 42. */
  height?: number;
  /** Track radius. */
  trackRadius?: number;
  thumbRadius?: number;
  /** The two white sheets (screens 6, 14) use #F2F2F5 with dark ink. */
  variant?: 'dark' | 'sheet';
  style?: ViewStyle;
  accessibilityLabel?: string;
};

export function Segmented({
  options,
  value,
  onChange,
  height = 38,
  trackRadius = 20,
  thumbRadius = 16,
  variant = 'dark',
  style,
  accessibilityLabel,
}: SegmentedProps) {
  const pad = 3;
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          flexDirection: 'row',
          padding: pad,
          borderRadius: trackRadius,
          backgroundColor: variant === 'sheet' ? sheet.fill : 'rgba(255,255,255,0.05)',
          borderWidth: variant === 'dark' ? 1 : 0,
          borderColor: borders.input,
        },
        style,
      ]}
    >
      {options.map((opt, i) => (
        <Thumb
          key={opt}
          label={opt}
          selected={i === value}
          onPress={() => onChange(i)}
          height={height}
          radius={thumbRadius}
          variant={variant}
        />
      ))}
    </View>
  );
}

function Thumb({
  label,
  selected,
  onPress,
  height,
  radius,
  variant,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  height: number;
  radius: number;
  variant: 'dark' | 'sheet';
}) {
  const reduced = useReducedMotion();
  const on = selected ? 1 : 0;

  // One property: background. 150ms. animations.md §2-3.
  const animated = useAnimatedStyle(() => ({
    backgroundColor: withTiming(
      interpolateColor(on, [0, 1], ['rgba(255,255,255,0)', '#FFFFFF']),
      { duration: motionDuration(DURATION.fast, reduced), easing: EASING },
    ),
  }));

  const fg = selected ? '#0B0B0B' : variant === 'sheet' ? sheet.muted : ink.i50;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={{ flex: 1 }}
    >
      <Animated.View
        style={[
          { height, borderRadius: radius, alignItems: 'center', justifyContent: 'center' },
          animated,
        ]}
      >
        <Text numberOfLines={1} style={[type.pill, { color: fg }]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}
