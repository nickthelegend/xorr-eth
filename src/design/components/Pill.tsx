/**
 * Pill — design.md §5 "Pill — filter / segment chip".
 *
 * height 34 · padding 0 14 · radius 20 · 13/600.
 * Selected #fff on #0B0B0B; unselected #141516 on ink50.
 *
 * "Pills must never shrink to fit — the market tabs broke this way; they scroll horizontally
 * instead." PillRow enforces that: flexGrow:0, flexShrink:0 on every child.
 */
import React from 'react';
import { Pressable, ScrollView, Text, View, type ViewStyle } from 'react-native';
import { ink, surfaces } from '../colors';
import { radius, MIN_HIT } from '../space';
import { type } from '../type';

export type PillProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
};

export function Pill({ label, selected = false, onPress, disabled, testID }: PillProps) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      accessibilityLabel={label}
      // design.md §7: hit targets >= 44px. The pill stays 34 tall and grows its touch area.
      hitSlop={{ top: (MIN_HIT - 34) / 2, bottom: (MIN_HIT - 34) / 2, left: 0, right: 0 }}
      style={({ pressed }) => [
        {
          height: 34,
          paddingHorizontal: 14,
          borderRadius: radius.lg2,
          alignItems: 'center',
          justifyContent: 'center',
          // The law: never shrink to fit.
          flexGrow: 0,
          flexShrink: 0,
          backgroundColor: selected ? ink.full : surfaces.surfaceAlt,
          // animations.md: pressed state is instant opacity, not a transition.
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[type.pill, { color: selected ? '#0B0B0B' : ink.i50 }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A horizontally scrolling row of pills. design.md §5: `overflow-x:auto`, `flex:none` per pill,
 * `scrollbar-width:none`.
 */
export function PillRow({
  children,
  gap = 8,
  style,
  contentStyle,
}: {
  children: React.ReactNode;
  gap?: number;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={[{ gap, flexDirection: 'row' }, contentStyle]}
    >
      {children}
    </ScrollView>
  );
}

/** A wrapping row of pills — screen 7's goal chips (gap 9, chips 40 tall, radius 22). */
export function PillWrap({ children, gap = 9 }: { children: React.ReactNode; gap?: number }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>{children}</View>;
}

/** Screen 7 goal chip: 40px tall, radius 22, selected white/#0B0B0B, unselected #111214 + border. */
export function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        height: 40,
        paddingHorizontal: 16,
        borderRadius: radius.xl,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected ? ink.full : '#111214',
        borderWidth: selected ? 0 : 1,
        borderColor: 'rgba(255,255,255,0.07)',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={[type.pill, { color: selected ? '#0B0B0B' : ink.i70 }]}>{label}</Text>
    </Pressable>
  );
}
