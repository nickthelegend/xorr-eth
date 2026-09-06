/**
 * Segmented.tsx — 2–3 exclusive options.
 *
 * design.md §5:
 *   track  padding 3–4 · radius 14–24 · background rgba(255,255,255,.05)
 *          (or #111214 + inputBorder on black)
 *   thumb  flex:1 · height 34–42 · radius 11–22 · selected #fff / #0B0B0B
 *          transition: background .15s
 *
 * The thumb transition is a **background** cross-fade, not a sliding pill. animations.md
 * puts it at 150ms — the fastest thing in the app, because selection must feel instant.
 * One property, platform easing, and it collapses to an instant swap under reduced motion.
 *
 * Selected is white-on-dark. Never green.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Press } from './Press';
import { Text } from './Text';
import { duration, timing, useReducedMotion } from './motion';
import { border, colors, size, space } from './tokens';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string | number> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Thumb height. §5: 34–42. */
  height?: number;
  /** The light sheet inverts: selected is `sheetInk` with white on it. */
  light?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  height = size.segThumb,
  light = false,
  style,
  testID,
}: SegmentedProps<T>) {
  const trackRadius = height / 2 + size.segPad;
  const thumbRadius = height / 2;

  return (
    <View
      testID={testID}
      style={[
        {
          flexDirection: 'row',
          gap: space.s4,
          padding: size.segPad,
          borderRadius: trackRadius,
          backgroundColor: light ? colors.sheet.fill : colors.inputBg,
        },
        light ? null : border.input,
        style,
      ]}
    >
      {options.map((option) => (
        <Segment
          key={String(option.value)}
          label={option.label}
          selected={option.value === value}
          onPress={() => onChange(option.value)}
          height={height}
          borderRadius={thumbRadius}
          light={light}
        />
      ))}
    </View>
  );
}

function Segment({
  label,
  selected,
  onPress,
  height,
  borderRadius,
  light,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  height: number;
  borderRadius: number;
  light: boolean;
}) {
  const reduced = useReducedMotion();
  /* Seeded with the current selection so the segment that mounts selected is simply
     selected — see the note in Switch.tsx. */
  const progress = useSharedValue(selected ? 1 : 0);
  React.useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, timing(duration.fast, reduced));
  }, [selected, reduced, progress]);

  const selectedBg = light ? colors.sheet.ink : colors.ink;

  const fill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ['transparent', selectedBg]),
  }));

  return (
    <Press
      onPress={onPress}
      hitHeight={height}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{ flex: 1 }}
    >
      <Animated.View
        style={[
          {
            height,
            borderRadius,
            alignItems: 'center',
            justifyContent: 'center',
          },
          fill,
        ]}
      >
        <Text
          variant="control"
          numberOfLines={1}
          color={
            selected
              ? light
                ? colors.sheet.bg
                : colors.sheet.ink
              : light
                ? colors.sheet.muted
                : colors.ink50
          }
        >
          {label}
        </Text>
      </Animated.View>
    </Press>
  );
}
