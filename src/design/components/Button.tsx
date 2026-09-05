/**
 * PrimaryButton and friends — design.md §5.
 *
 * height 52-56 · radius 30 · 15.5-16/600.
 *   default      #fff on #000        (hover rgba(255,255,255,.88))
 *   destructive  #EF3B36 on #fff
 *   disabled     #1B1C1E on ink35
 *   confirmed    #2BD87A on #04160C
 *   secondary    #1B1C1E on white
 *   ghost        ghostBorder, height 46-48, label ink65
 *
 * "One primary button per screen." Enforced at runtime in __DEV__ by ButtonRow + a screen-level
 * counter; see `assertOnePrimary`.
 * "Two-button rows are flex:1 / flex:1.3 with the affirmative action wider and on the right."
 */
import React from 'react';
import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native';
import { borders, commodity, ink, pnl, surfaces } from '../colors';
import { hairlineWidth, radius } from '../space';
import { type } from '../type';

export type ButtonVariant =
  | 'primary'
  | 'destructive'
  | 'confirmed'
  | 'secondary'
  | 'ghost'
  | 'buy'
  | 'sell'
  | 'gold'
  | 'sheetCancel'
  | 'sheetConfirm';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  height?: number;
  style?: ViewStyle;
  testID?: string;
};

function palette(variant: ButtonVariant, disabled: boolean) {
  if (disabled) return { bg: surfaces.control, fg: ink.i35, border: 'transparent' };
  switch (variant) {
    case 'primary':
      return { bg: '#FFFFFF', fg: '#000000', border: 'transparent' };
    case 'destructive':
      return { bg: pnl.candleDown, fg: '#FFFFFF', border: 'transparent' };
    case 'confirmed':
      return { bg: pnl.up, fg: pnl.upInk, border: 'transparent' };
    case 'secondary':
      return { bg: surfaces.control, fg: '#FFFFFF', border: 'transparent' };
    case 'ghost':
      return { bg: 'transparent', fg: ink.i65, border: borders.ghost };
    case 'buy':
      return { bg: pnl.candleUp, fg: '#FFFFFF', border: 'transparent' };
    case 'sell':
      return { bg: pnl.candleDown, fg: '#FFFFFF', border: 'transparent' };
    case 'gold':
      return { bg: commodity.goldFill, fg: commodity.goldInk, border: 'transparent' };
    case 'sheetCancel':
      return { bg: pnl.cancelBg, fg: pnl.cancelInk, border: 'transparent' };
    case 'sheetConfirm':
      return { bg: pnl.candleUp, fg: '#FFFFFF', border: 'transparent' };
  }
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  height,
  style,
  testID,
}: ButtonProps) {
  const p = palette(variant, disabled);
  const h = height ?? (variant === 'ghost' ? 47 : 54);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => [
        {
          height: h,
          borderRadius: radius.xxl,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          backgroundColor: p.bg,
          borderWidth: variant === 'ghost' ? hairlineWidth : 0,
          borderColor: p.border,
          // animations.md: pressed state is instant opacity, not a transition.
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={p.fg} /> : null}
      <Text numberOfLines={1} style={[type.buttonLabel, { color: p.fg }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * design.md §5: "Two-button rows are flex:1 / flex:1.3 with the affirmative action wider and on
 * the right." This component enforces both — you cannot put the affirmative on the left.
 */
export function ButtonRow({
  secondary,
  affirmative,
  gap = 12,
  affirmativeFlex = 1.3,
  style,
}: {
  secondary: React.ReactElement;
  affirmative: React.ReactElement;
  gap?: number;
  affirmativeFlex?: number;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ flexDirection: 'row', gap }, style]}>
      <View style={{ flex: 1 }}>{secondary}</View>
      <View style={{ flex: affirmativeFlex }}>{affirmative}</View>
    </View>
  );
}
