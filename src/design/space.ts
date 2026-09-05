/**
 * Space, radius, shadow — design.md §3.
 */
import { StyleSheet, type ViewStyle } from 'react-native';
import { pnl } from './colors';

/** The 16-step spacing scale. design.md §3: nothing outside this list. */
export const space = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 26, 30, 34, 38, 44] as const;
export type Space = (typeof space)[number];

/** Screen gutter is 20px; sheet-edge screens use 16px so the card's padding makes up the rest. */
export const GUTTER = 20;
export const SHEET_GUTTER = 16;

/** design.md §4: top padding 54px, bottom 26px, or 22px when a tab bar is present. */
export const SCREEN_TOP = 54;
export const SCREEN_BOTTOM = 26;
export const SCREEN_BOTTOM_TABBED = 22;

/** design.md §7: hit targets >= 44px. Steppers stay 26px visually and expand via hitSlop. */
export const MIN_HIT = 44;

export const radius = {
  /** Tab icon glyph boxes. */
  xs: 4,
  xs2: 6,
  /** Asset squares, small icon buttons. */
  sm: 11,
  sm2: 12,
  /** Inline stat tiles, chat cards. */
  md: 14,
  md2: 16,
  /** Agent cards, alert cards, note strips. */
  lg: 18,
  lg2: 20,
  /** Content cards, radio cards, segmented tracks. */
  xl: 22,
  xl2: 24,
  xl3: 26,
  /** Sheets, primary buttons (pill), full-bleed panels. */
  xxl: 30,
  xxl2: 34,
  /** Avatars, orbs, steppers, circular icon buttons. */
  full: 9999,
} as const;

/** RN's true 1-device-pixel line. Pair with a `borders.*` color. */
export const hairlineWidth = StyleSheet.hairlineWidth;

/**
 * design.md §3: "Shadows — almost none. Two only."
 * Anything not in this object is not allowed to cast a shadow.
 */
export const shadows = {
  /** Switch knob: 0 1px 3px rgba(0,0,0,.4). */
  switchKnob: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 2,
  } satisfies ViewStyle,
  /** Floating chat pill: 0 8px 24px rgba(0,0,0,.55). */
  floatingPill: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 8,
  } satisfies ViewStyle,
} as const;

/**
 * Candle bloom — design.md §3: "Candle bodies carry a bloom, not a shadow ... This is what makes
 * the charts read as premium — keep it." 0 0 10px rgba(22,192,96,.35) up / rgba(239,59,54,.32) down.
 *
 * On iOS this is a real shadow with zero offset. On Android `elevation` cannot tint, so
 * `Candlestick` layers an SVG feGaussianBlur copy instead — see src/charts/Candlestick.tsx.
 */
export const candleBloom = {
  up: {
    shadowColor: pnl.candleUp,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  } satisfies ViewStyle,
  down: {
    shadowColor: pnl.candleDown,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
  } satisfies ViewStyle,
} as const;
