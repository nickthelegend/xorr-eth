/**
 * Button.tsx
 *
 * design.md §5:
 *   height 52–56 · radius 30 · 15.5–16/600
 *   default      #fff on #000
 *   destructive  #EF3B36 on #fff
 *   disabled     #1B1C1E on ink35
 *   confirmed    #2BD87A on #04160C
 *   secondary    #1B1C1E on white
 *   ghost        ghostBorder · height 46–48 · label ink65
 *
 * **One primary button per screen.** Two-button rows are `flex:1` / `flex:1.3` with the
 * affirmative action wider and on the right — `ButtonRow` is that rule, so a screen can't
 * put "Cancel" on the right by accident.
 *
 * There is no hover variant. design.md lists one (`rgba(255,255,255,.88)`) because the
 * prototype ran in a browser; on a phone the press state is the feedback, and it is the
 * global `opacity: .85` from `Press`.
 *
 * `success` is not a selection colour. It is the state of an order that filled — a P&L
 * fact — which is the only reason a button is ever green.
 */
import React from 'react';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';
import { Press } from './Press';
import { Text } from './Text';
import { border, colors, radius, size, space } from './tokens';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'destructive'
  | 'success'
  | 'sheetPrimary';

interface Skin {
  bg: string;
  fg: string;
  bordered: boolean;
  height: number;
}

const SKINS: Readonly<Record<ButtonVariant, Skin>> = Object.freeze({
  primary: { bg: colors.ink, fg: colors.bg, bordered: false, height: size.button },
  secondary: { bg: colors.control, fg: colors.ink, bordered: false, height: size.button },
  ghost: { bg: 'transparent', fg: colors.ink65, bordered: true, height: size.ghost },
  destructive: { bg: colors.candleDown, fg: colors.ink, bordered: false, height: size.buttonLg },
  success: { bg: colors.up, fg: colors.upInk, bordered: false, height: size.button },
  /** A primary CTA sitting on the light sheet: the ink inverts. */
  sheetPrimary: { bg: colors.sheet.ink, fg: colors.sheet.bg, bordered: false, height: size.button },
});

const DISABLED: Pick<Skin, 'bg' | 'fg'> = { bg: colors.control, fg: colors.ink35 };

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /**
   * The action is in flight. The button stops accepting presses and announces `busy` —
   * without this a user who taps "Create wallet" twice gets two wallets, and the second
   * one silently replaces the first.
   */
  loading?: boolean;
  /** §5: 52–56 primary, 46–48 ghost. Defaults per variant. */
  height?: number;
  /** Overrides the fill — the gold "Long gold" CTA takes the instrument's own colour. */
  backgroundColor?: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  height,
  backgroundColor,
  color,
  style,
  testID,
}: ButtonProps) {
  const skin = SKINS[variant];
  const bg = disabled ? DISABLED.bg : (backgroundColor ?? skin.bg);
  const fg = disabled ? DISABLED.fg : (color ?? skin.fg);
  const h = height ?? skin.height;

  return (
    <Press
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading || !onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={[
        {
          height: h,
          borderRadius: radius.sheet,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.s8,
          paddingHorizontal: space.s20,
          backgroundColor: bg,
        },
        skin.bordered && !disabled ? border.ghost : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : null}
      <Text variant="button" color={fg} numberOfLines={1}>
        {label}
      </Text>
    </Press>
  );
}

export interface ButtonRowProps {
  /** The dismissive action. Narrower, and on the left. */
  secondary: React.ReactElement;
  /** The affirmative action. Wider (flex 1.3), and on the right. */
  primary: React.ReactElement;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ButtonRow({ secondary, primary, style, testID }: ButtonRowProps) {
  return (
    <View
      testID={testID}
      style={[{ flexDirection: 'row', gap: space.s12 }, style]}
    >
      <View style={{ flex: 1 }}>{secondary}</View>
      <View style={{ flex: 1.3 }}>{primary}</View>
    </View>
  );
}

/**
 * A two-button row where neither action is affirmative — Short / Long, Sell / Buy. Both
 * halves are equal because neither is the safe one.
 */
export function ButtonPair({
  left,
  right,
  style,
  testID,
}: {
  left: React.ReactElement;
  right: React.ReactElement;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View testID={testID} style={[{ flexDirection: 'row', gap: space.s12 }, style]}>
      <View style={{ flex: 1 }}>{left}</View>
      <View style={{ flex: 1 }}>{right}</View>
    </View>
  );
}
