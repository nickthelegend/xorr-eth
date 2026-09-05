/**
 * Switch — design.md §5.
 *
 * Track 50x30 (alerts 48x29) radius 15 · padding 2. Knob 26x26 white with the one permitted
 * shadow. On #2BD87A, off #2A2B2E. transform translateX(0 -> 19-21px), 180ms; the track
 * background cross-fades in the same 180ms.
 *
 * "Always paired with a caption line that changes with state — a bare switch label is not enough
 * on a screen where the toggle authorises autonomous spending." The `caption` prop is REQUIRED on
 * SwitchRow for exactly that reason.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { ink, pnl, surfaces } from '../colors';
import { DURATION } from '../motion';
import { EASING } from '../easing';
import { shadows } from '../space';
import { type } from '../type';
import { motionDuration, useReducedMotion } from '../useReducedMotion';

export type SwitchProps = {
  value: boolean;
  onValueChange: (v: boolean) => void;
  /** design.md: 50x30 default; the alerts screen uses 48x29. */
  size?: 'default' | 'alerts';
  disabled?: boolean;
  accessibilityLabel?: string;
};

export function Switch({
  value,
  onValueChange,
  size = 'default',
  disabled,
  accessibilityLabel,
}: SwitchProps) {
  const reduced = useReducedMotion();
  const W = size === 'alerts' ? 48 : 50;
  const H = size === 'alerts' ? 29 : 30;
  const PAD = 2;
  const KNOB = 26;
  const travel = W - PAD * 2 - KNOB; // 50-4-26 = 20; 48-4-26 = 18 (design.md says 19-21)
  const on = value ? 1 : 0;
  const d = motionDuration(DURATION.base, reduced);

  const track = useAnimatedStyle(() => ({
    backgroundColor: withTiming(interpolateColor(on, [0, 1], [surfaces.switchOff, pnl.up]), {
      duration: d,
      easing: EASING,
    }),
  }));

  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(on * travel, { duration: d, easing: EASING }) }],
  }));

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Animated.View
        style={[
          { width: W, height: H, borderRadius: H / 2, padding: PAD, justifyContent: 'center' },
          track,
          disabled ? { opacity: 0.4 } : null,
        ]}
      >
        <Animated.View
          style={[
            {
              width: KNOB,
              height: KNOB,
              borderRadius: KNOB / 2,
              backgroundColor: '#FFFFFF',
            },
            shadows.switchKnob,
            knob,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

/**
 * The only sanctioned way to put a Switch on a screen. `caption` is required and must change
 * with state — design.md §5, and state.md's `autoNote` is the canonical example.
 */
export function SwitchRow({
  label,
  caption,
  value,
  onValueChange,
  height = 56,
  size = 'default',
}: {
  label: string;
  /** REQUIRED. Must differ between on and off. */
  caption: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  height?: number;
  size?: 'default' | 'alerts';
}) {
  return (
    <View
      style={{
        minHeight: height,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 8,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.rowPrimary, { color: ink.full }]}>{label}</Text>
        <Text style={[type.secondary, { color: ink.i38 }]}>{caption}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        size={size}
        accessibilityLabel={label}
      />
    </View>
  );
}
