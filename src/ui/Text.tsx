/**
 * Text.tsx — the one text primitive.
 *
 * Nothing in the app renders RN's `Text` directly. Every string goes through here so that
 * `includeFontPadding: false`, tabular figures and a family-name-selected weight are not
 * things a screen can forget.
 *
 * `<Value>` and `<Price>` are the numeric wrappers. They re-assert `fontVariant` *after*
 * the caller's style, so a stray `fontVariant: []` further up can't turn proportional
 * figures back on in a price column.
 */
import React from 'react';
import {
  Text as RNText,
  type StyleProp,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';
import { type as typeScale, variantColor, type TypeVariant } from './type';
import { colors } from './tokens';

/** Forced tabular figures. Applied last so a caller's style cannot drop them. */
const lockTabular: TextStyle = { fontVariant: ['tabular-nums'] };

export type PriceTone = 'neutral' | 'up' | 'down';

const toneColor: Readonly<Record<PriceTone, string | undefined>> = {
  neutral: undefined,
  up: colors.up,
  down: colors.down,
};

export interface TextProps extends Omit<RNTextProps, 'style'> {
  /** Which role in design.md §2 this string plays. */
  variant?: TypeVariant;
  /** Overrides the variant's default ink. */
  color?: string;
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

export const Text = React.forwardRef<RNText, TextProps>(function Text(
  { variant = 'body', color, align, style, ...rest },
  ref,
) {
  return (
    <RNText
      ref={ref}
      {...rest}
      style={[
        typeScale[variant],
        { color: color ?? variantColor[variant] },
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
});

export type ValueProps = TextProps;

/**
 * A number the user reads as a quantity — stepper values, stat tiles, notionals.
 * design.md §5 puts these at 14.5/700; a taller variant can be passed explicitly.
 */
export const Value = React.forwardRef<RNText, ValueProps>(function Value(
  { variant = 'value', style, ...rest },
  ref,
) {
  return <Text ref={ref} variant={variant} {...rest} style={[style, lockTabular]} />;
});

export interface PriceProps extends TextProps {
  /** P&L tone. Green and red mean profit and loss — nothing else ever sets this. */
  tone?: PriceTone;
}

/**
 * The tone a P&L figure takes. Green means profit, red means loss, and **zero is neither**
 * — a flat position rendered in profit-green reads as a win that did not happen, which is
 * the one thing the colour law exists to prevent.
 *
 * Every screen that colours a signed figure goes through here, so "what does zero look
 * like" is answered once instead of per screen.
 */
export function pnlTone(value: number): PriceTone {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'neutral';
}

/**
 * A price or a P&L figure. `tone` is the only sanctioned way to colour text green or red.
 *
 * Pass an already-formatted string: state.md requires `toLocaleString('en-US')` with
 * explicit fraction digits, and U+2212 rather than a hyphen for negatives. This component
 * does not format — it would have to guess the fraction digits, and a guess in a price
 * column is worse than no help at all.
 */
export const Price = React.forwardRef<RNText, PriceProps>(function Price(
  { variant = 'rowPrimary', tone = 'neutral', color, style, ...rest },
  ref,
) {
  return (
    <Text
      ref={ref}
      variant={variant}
      color={color ?? toneColor[tone]}
      {...rest}
      style={[style, lockTabular]}
    />
  );
});
