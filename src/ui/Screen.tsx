/**
 * Screen.tsx — the screen shell.
 *
 * design.md §4 specifies `padding: 54px 0 26px` (22px with a tab bar) on a 402×874 canvas.
 * Those are the numbers for one device. Here they come from the real safe-area insets:
 *
 *   top    = insets.top + 10          the 10 is the "breathing room" half of the 54
 *   bottom = insets.bottom, floored   26 without a tab bar, 22 with one — a device that
 *                                     reports no inset still gets the design's padding
 *
 * With a tab bar, `Screen` yields the bottom padding entirely to `TabBar`, which sits
 * flush to the edge and pads itself. Two components padding the same edge is how you get
 * a 40px gap under a tab bar.
 *
 * Layout law (design.md §4): the *content* region takes `flex: 1`, never a trailing
 * spacer. An empty flex:1 view above a footer collects all the leftover height and opens
 * a visible hole. `Screen` gives `flex: 1` to nothing on its own — compose a `<Fill />`
 * onto the chart, the list or the scroll area.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from './tokens';

/** The breathing room design.md folds into its 54px top padding. */
const TOP_BREATHING_ROOM = space.s10;

export interface ScreenProps {
  children?: React.ReactNode;
  /**
   * Horizontal padding. `gutter` (20) for a normal screen, `sheet` (16) where a card runs
   * to the edge and its own padding makes up the difference, `none` where rows must bleed.
   */
  gutter?: 'gutter' | 'sheet' | 'none';
  /** A `TabBar` is rendered inside this screen, so it owns the bottom inset. */
  tabBar?: boolean;
  /** The light sheet (Auto Close, order ticket). Everything else is true black. */
  light?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Screen({
  children,
  gutter = 'gutter',
  tabBar = false,
  light = false,
  style,
  testID,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const paddingHorizontal =
    gutter === 'none' ? 0 : gutter === 'sheet' ? space.sheetGutter : space.gutter;

  return (
    <View
      testID={testID}
      style={[
        {
          flex: 1,
          backgroundColor: light ? colors.sheet.bg : colors.bg,
          paddingTop: insets.top + TOP_BREATHING_ROOM,
          paddingBottom: tabBar ? 0 : Math.max(insets.bottom, space.s26),
          paddingHorizontal,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * The flex:1 region. Put it on the thing that should absorb the leftover height — the
 * chart, the list, the scroll area — never on an empty view above a footer.
 */
export function Fill({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[{ flex: 1, minHeight: 0 }, style]}>{children}</View>;
}
