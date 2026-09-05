/**
 * Type scale — design.md §2. All 15 roles, exact size / weight / letter-spacing.
 *
 * System sans only. design.md: "No custom font — a trading UI needs the platform's numeral
 * metrics." Nothing below 9.5px. Tabular numerals on every price column and every stepper value.
 */
import { Platform, type TextStyle } from 'react-native';

/** design.md §2: "Tabular numerals on every price column and every stepper value." */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

const sys = Platform.select({ ios: undefined, default: 'sans-serif' });

const t = (s: TextStyle): TextStyle => ({ fontFamily: sys, ...s });

export const type = {
  /** Hero balance — screen 2. 46/700, -1.4px. */
  heroBalance: t({ fontSize: 46, fontWeight: '700', letterSpacing: -1.4, ...tabular }),
  /** Keypad amount — screen 14, funding amount screen 9. 52/700, -2px. */
  heroAmount: t({ fontSize: 52, fontWeight: '700', letterSpacing: -2, ...tabular }),
  /** Price large — screens 13 (42) / 21 (38). */
  priceLarge: t({ fontSize: 42, fontWeight: '700', letterSpacing: -1.2, ...tabular }),
  priceMedium: t({ fontSize: 38, fontWeight: '700', letterSpacing: -1.2, ...tabular }),
  /** P&L hero — screen 22. 46/700, -1.4px. */
  pnlHero: t({ fontSize: 46, fontWeight: '700', letterSpacing: -1.4, ...tabular }),
  /** Backtest projected value — screen 17. 30/700. */
  valueLarge: t({ fontSize: 30, fontWeight: '700', ...tabular }),
  /** Swap amount — screen 19. 32/700. */
  amountMedium: t({ fontSize: 32, fontWeight: '700', ...tabular }),
  /** Onboarding title — screen 7/9/10. 26/700, line-height 1.2. */
  onboardingTitle: t({ fontSize: 26, fontWeight: '700', lineHeight: 26 * 1.2 }),
  /** Screen title — "Markets", "Activity", "Alerts". 22/700. */
  screenTitle: t({ fontSize: 22, fontWeight: '700' }),
  /** Leverage multiplier — screen 25. 22/700. */
  statLarge: t({ fontSize: 22, fontWeight: '700', ...tabular }),
  /** Proposal action — screen 12. 21/700. */
  proposalAction: t({ fontSize: 21, fontWeight: '700' }),
  /** Sheet title — screens 6 / 14. 19/700. */
  sheetTitle: t({ fontSize: 19, fontWeight: '700' }),
  /** Card title. 16-17 / 600-700. */
  cardTitle: t({ fontSize: 17, fontWeight: '700' }),
  cardTitleSm: t({ fontSize: 16, fontWeight: '600' }),
  /** Primary button label. 15.5-16 / 600. */
  buttonLabel: t({ fontSize: 15.5, fontWeight: '600' }),
  buttonLabelLg: t({ fontSize: 16, fontWeight: '600' }),
  /** List row primary. 14.5-15.5 / 600. */
  rowPrimary: t({ fontSize: 14.5, fontWeight: '600' }),
  rowPrimaryLg: t({ fontSize: 15.5, fontWeight: '600' }),
  /** Row value — right-aligned price column. Always tabular. */
  rowValue: t({ fontSize: 14.5, fontWeight: '600', ...tabular }),
  /** Stepper value. 14.5/700, tabular, fixed minWidth (see Stepper). */
  stepperValue: t({ fontSize: 14.5, fontWeight: '700', ...tabular }),
  /** Body / row label. 13.5-14.5 / 500, line-height 1.5. */
  body: t({ fontSize: 14, fontWeight: '500', lineHeight: 14 * 1.5 }),
  bodySm: t({ fontSize: 13.5, fontWeight: '500', lineHeight: 13.5 * 1.5 }),
  /** Pill label. 13/600. */
  pill: t({ fontSize: 13, fontWeight: '600' }),
  /** Row delta — the +/- change beside a price. 12/500, tabular. */
  rowDelta: t({ fontSize: 12, fontWeight: '500', ...tabular }),
  /** Secondary line. 11.5-12.5 / 400-500, line-height 1.45. */
  secondary: t({ fontSize: 11.5, fontWeight: '400', lineHeight: 11.5 * 1.45 }),
  secondaryMd: t({ fontSize: 12.5, fontWeight: '500', lineHeight: 12.5 * 1.45 }),
  /** Note-strip body — design.md §5 "Note strip": 11.5px / 1.5. */
  noteBody: t({ fontSize: 11.5, fontWeight: '400', lineHeight: 11.5 * 1.5 }),
  /** Eyebrow. 10-11 / 600, letter-spacing .12em, uppercase. */
  eyebrow: t({
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 11 * 0.12,
    textTransform: 'uppercase',
  }),
  eyebrowSm: t({
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 10 * 0.12,
    textTransform: 'uppercase',
  }),
  /** Tag / badge. 9.5-10 / 700, letter-spacing .09em, uppercase. */
  tag: t({ fontSize: 10, fontWeight: '700', letterSpacing: 10 * 0.09, textTransform: 'uppercase' }),
  tagSm: t({
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 9.5 * 0.09,
    textTransform: 'uppercase',
  }),
  /** Tab label. 9.5/600, letter-spacing .03em. The floor — nothing below 9.5px. */
  tabLabel: t({ fontSize: 9.5, fontWeight: '600', letterSpacing: 9.5 * 0.03 }),
  /** Footnote. 10.5-11 / 400. */
  footnote: t({ fontSize: 11, fontWeight: '400' }),
  footnoteSm: t({ fontSize: 10.5, fontWeight: '400' }),
} as const;

export type TypeRole = keyof typeof type;

/** design.md §2: "Nothing below 9.5px." Asserted by src/design/type.test.ts. */
export const MIN_FONT_SIZE = 9.5;
