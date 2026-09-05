/**
 * SheetCard — design.md §5.
 * background #0C0C0D · border cardBorder · radius 22-34 · padding 16-26.
 * A full-bleed sheet uses radius 30 30 0 0 and sits at the bottom of the frame.
 */
import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { borders, surfaces } from '../colors';
import { hairlineWidth, radius as R } from '../space';

export type SheetCardProps = {
  children: React.ReactNode;
  radius?: number;
  padding?: number;
  /** Bottom sheet: radius 30 30 0 0, flush to the frame edge. */
  fullBleed?: boolean;
  style?: ViewStyle;
};

export function SheetCard({
  children,
  radius = R.xl,
  padding = 16,
  fullBleed = false,
  style,
}: SheetCardProps) {
  return (
    <View
      style={[
        {
          backgroundColor: surfaces.surface,
          borderWidth: hairlineWidth,
          borderColor: borders.card,
          padding,
        },
        fullBleed
          ? { borderTopLeftRadius: R.xxl, borderTopRightRadius: R.xxl, borderBottomWidth: 0 }
          : { borderRadius: radius },
        style,
      ]}
    >
      {children}
    </View>
  );
}
