/**
 * IconButton.tsx — the circular glyph button.
 *
 * design.md §1 gives `surfaceAlt` as "Icon buttons, inactive tabs", §3 gives radius 50% for
 * "circular icon buttons", and §1 gives `ink55` for "Icon glyphs, chevrons". Those three
 * lines are the whole recipe, and it appears in almost every screen header: back on the
 * pushed screens, search on Markets, sort on the leaderboard, gear on Home.
 *
 * It is 34pt drawn — under the 44pt minimum — so it grows its touch area through `Press`
 * rather than growing the circle, which is the §7 rule for every small control.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Press } from './Press';
import { colors, radius, size, space } from './tokens';
import { Icon, type IconName } from '@/design/Icon';

export interface IconButtonProps {
  name: IconName;
  /** Required: a bare glyph gives a screen reader nothing to announce. */
  accessibilityLabel: string;
  onPress?: () => void;
  /** Diameter. §5 uses 34 in headers and 30 where a row is tight. */
  circle?: number;
  /** Glyph size inside the circle. */
  glyph?: number;
  color?: string;
  /** Circle fill. `'none'` draws no circle — a bare glyph that still has a 44pt target. */
  background?: string | 'none';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function IconButton({
  name,
  accessibilityLabel,
  onPress,
  circle = size.mark,
  glyph = size.stepperGlyph,
  color = colors.ink55,
  background = colors.surfaceAlt,
  disabled,
  style,
  testID,
}: IconButtonProps) {
  return (
    <Press
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitHeight={circle}
      hitWidth={circle}
      style={[
        {
          width: circle,
          height: circle,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: background === 'none' ? 'transparent' : background,
        },
        style,
      ]}
    >
      {/*
        The glyph must not swallow the press.

        `style.pointerEvents`, not the prop: react-native-web deprecated the prop form and warns
        once per render on every screen that draws an icon button — which is nearly all of them.
      */}
      <View style={{ pointerEvents: 'none' }}>
        <Icon name={name} size={glyph} color={color} />
      </View>
    </Press>
  );
}

/**
 * A screen header: a back circle, a title, and an optional trailing control.
 *
 * Every pushed screen opens with this shape. Keeping it here is what stops each screen from
 * re-deriving the same row and drifting by a couple of points.
 */
export function HeaderBar({
  onBack,
  backLabel = 'Back',
  title,
  right,
  style,
  testID,
}: {
  onBack?: () => void;
  backLabel?: string;
  title?: React.ReactNode;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.s14,
          minHeight: size.mark,
        },
        style,
      ]}
    >
      {onBack ? <IconButton name="back" accessibilityLabel={backLabel} onPress={onBack} /> : null}
      <View style={{ flex: 1 }}>{title}</View>
      {right}
    </View>
  );
}
