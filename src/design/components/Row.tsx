/**
 * Row — design.md §5 "Row — hairline list row".
 *
 * height 48-66 · flex row · align center · gap 12 · border-bottom hairline
 * NO horizontal padding — the screen gutter provides it.
 * [mark 30-34] [primary 14.5/600 + secondary 11.5/ink38 (gap 2)] [flex:1] [value + delta]
 */
import React from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { borders, ink } from '../colors';
import { hairlineWidth } from '../space';
import { type } from '../type';

export type RowProps = {
  /** 30-34px gradient mark / orb / dot. */
  mark?: React.ReactNode;
  primary: string;
  secondary?: string;
  /** Right-aligned value, 14.5/600. Always tabular via type.rowValue. */
  value?: string;
  /** Right-aligned delta under the value, 12/500. Pass its own color for P&L. */
  delta?: string;
  deltaColor?: string;
  valueColor?: string;
  /** Anything custom in the right slot (a sparkline, a pill, a switch). */
  right?: React.ReactNode;
  /** Between the label block and the right slot — e.g. screen 5's sparkline. */
  middle?: React.ReactNode;
  height?: number;
  onPress?: () => void;
  /** design.md §5: "Never wrap the last row's border" — the app accepts it as a section
   *  terminator consistently, but this opts out where a screen needs it. */
  divider?: boolean;
  style?: ViewStyle;
  testID?: string;
};

export function Row({
  mark,
  primary,
  secondary,
  value,
  delta,
  deltaColor,
  valueColor = ink.full,
  right,
  middle,
  height = 66,
  onPress,
  divider = true,
  style,
  testID,
}: RowProps) {
  const body = (
    <View
      style={[
        {
          height,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderBottomWidth: divider ? hairlineWidth : 0,
          borderBottomColor: borders.hairline,
        },
        style,
      ]}
    >
      {mark}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={[type.rowPrimary, { color: ink.full }]}>
          {primary}
        </Text>
        {secondary ? (
          <Text numberOfLines={1} style={[type.secondary, { color: ink.i38 }]}>
            {secondary}
          </Text>
        ) : null}
      </View>
      {middle}
      {right ??
        (value ? (
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={[type.rowValue, { color: valueColor }]}>{value}</Text>
            {delta ? (
              <Text style={[type.rowDelta, { color: deltaColor ?? ink.i38 }]}>{delta}</Text>
            ) : null}
          </View>
        ) : null)}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[primary, secondary, value, delta].filter(Boolean).join(', ')}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      {body}
    </Pressable>
  );
}
