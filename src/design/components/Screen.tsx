/**
 * Screen — design.md §4 "Screen shell & navigation".
 *
 * Every screen: flex:1, background #000, column.
 * Top padding 54, bottom 26 (or 22 when a tab bar is present).
 * Gutter 20 (sheet-edge screens use 16 so the card's own padding makes up the difference).
 *
 * THE LAYOUT LAW (design.md §4): "the *content* region takes flex:1, never a trailing spacer.
 * An empty <div flex:1> above a footer collects all leftover height and produces a visible hole —
 * this bug appeared twice in review. Give flex:1 to the chart, the list, or the scroll area."
 *
 * `Screen.Content` is the ONLY thing allowed to carry flex:1. `Screen.Spacer` does not exist,
 * deliberately. In __DEV__, `assertNoTrailingSpacer` warns if a screen's last child is a bare
 * flex:1 View — see src/design/layoutLaw.ts.
 */
import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { surfaces } from '../colors';
import { GUTTER, SCREEN_BOTTOM, SCREEN_BOTTOM_TABBED, SCREEN_TOP, SHEET_GUTTER } from '../space';

export type ScreenProps = {
  children: React.ReactNode;
  /** A tab bar is present — bottom content padding drops to 22. */
  tabbed?: boolean;
  /** Sheet-edge screens use a 16 gutter. */
  sheetEdge?: boolean;
  /** Set false when the screen paints its own gutter per-section. */
  gutter?: boolean;
  /** White-sheet screens (6, 14) paint their own background. */
  background?: string;
  style?: ViewStyle;
  testID?: string;
};

export function Screen({
  children,
  tabbed = false,
  sheetEdge = false,
  gutter = true,
  background = surfaces.bg,
  style,
  testID,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  // design.md's 54/26 are CONTENT paddings; they compose on top of the real device insets so the
  // design reads identically on a notch, a punch-hole and a home-indicator-less device.
  const top = Math.max(SCREEN_TOP, insets.top + 10);
  const bottomBase = tabbed ? SCREEN_BOTTOM_TABBED : SCREEN_BOTTOM;
  const bottom = tabbed ? bottomBase : Math.max(bottomBase, insets.bottom);

  return (
    <View
      testID={testID}
      style={[
        {
          flex: 1,
          flexDirection: 'column',
          backgroundColor: background,
          paddingTop: top,
          paddingBottom: bottom,
          paddingHorizontal: gutter ? (sheetEdge ? SHEET_GUTTER : GUTTER) : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * The content region. This — and only this — carries flex:1.
 * Put the chart, the list or the scroll area in here.
 */
export function ScreenContent({
  children,
  style,
}: {
  /** Optional: a screen whose content sits above the flexible region still needs the region. */
  children?: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[{ flex: 1, minHeight: 0 }, style]}>{children}</View>;
}

Screen.Content = ScreenContent;

/** A screen header row: title left, optional circular action right. design.md §4. */
export function ScreenHeader({
  left,
  right,
  style,
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
        style,
      ]}
    >
      {left}
      {right}
    </View>
  );
}
