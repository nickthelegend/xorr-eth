/**
 * Color tokens — ui/mobile-ui/design.md §1. Values are exact; do not round or "improve" them.
 *
 * THE ONE PRODUCT RULE (README.md): green and red mean profit and loss, nothing else.
 * Selection state is white-on-dark, never green. There is no accent color.
 * `up` / `down` / `candleUp` / `candleDown` live in `pnl` and may only be read through
 * the `pnl` namespace, so a grep for `colors.pnl` finds every P&L-colored pixel in the app.
 */

/** Surfaces — design.md §1 "Surfaces". */
export const surfaces = {
  /** Screen background. True black, never a dark grey. */
  bg: '#000000',
  /** Cards, sheets, panels sitting on `bg`. */
  surface: '#0C0C0D',
  /** Icon buttons, inactive tabs. */
  surfaceAlt: '#141516',
  /** Pills, steppers, secondary buttons. */
  control: '#1B1C1E',
  /** Hover/press on `control`. */
  controlHover: '#252629',
  /** Switch track, off. */
  switchOff: '#2A2B2E',
  /** Chat composer field. */
  inputBg: '#121213',
} as const;

/** Light sheet — Auto Close (screen 6) and Order ticket (screen 14) only. design.md §1. */
export const sheet = {
  bg: '#FFFFFF',
  ink: '#0B0B0B',
  muted: '#8A8A90',
  dim: '#9A9A9F',
  fill: '#F2F2F5',
  tick: '#E4E4E9',
} as const;

/** Ink on black — the opacity ladder. design.md §1 "Ink on black". */
export const ink = {
  /** Primary text, values, active labels. */
  full: '#FFFFFF',
  /** Secondary button labels. */
  i70: 'rgba(255,255,255,0.7)',
  /** Icon glyphs, chevrons. */
  i55: 'rgba(255,255,255,0.55)',
  /** Agent-note body copy. */
  i45: 'rgba(255,255,255,0.45)',
  /** Screen subtitles. */
  i40: 'rgba(255,255,255,0.4)',
  /** List row secondary line. */
  i38: 'rgba(255,255,255,0.38)',
  /** Placeholder text. */
  i35: 'rgba(255,255,255,0.35)',
  /** Eyebrow labels, disabled. */
  i32: 'rgba(255,255,255,0.32)',
  /** Inactive tab icon + label. */
  i30: 'rgba(255,255,255,0.3)',
  /** Footnotes, counts. */
  i28: 'rgba(255,255,255,0.28)',
  /** Unselected pill label (design.md §5 "unselected #141516 on ink50"). */
  i50: 'rgba(255,255,255,0.5)',
  /** Ghost button label (design.md §5). */
  i65: 'rgba(255,255,255,0.65)',
} as const;

/**
 * Hairlines & borders — design.md §1. React Native has no `border` shorthand, so these are
 * colors; pair each with `hairlineWidth` from `./space`.
 */
export const borders = {
  /** List row dividers. The most-used border in the app. */
  hairline: 'rgba(255,255,255,0.05)',
  /** Tab-bar top edge, section splits. */
  hairlineStrong: 'rgba(255,255,255,0.055)',
  /** Card and sheet outlines. */
  card: 'rgba(255,255,255,0.06)',
  /** Composer, segmented track. */
  input: 'rgba(255,255,255,0.07)',
  /** Ghost / outline buttons. */
  ghost: 'rgba(255,255,255,0.09)',
  /** Selected radio card (funding). */
  selected: 'rgba(255,255,255,0.55)',
  /** Unselected radio ring (screens.md screen 9). */
  radioUnselected: 'rgba(255,255,255,0.25)',
  /** Pending KYC/status ring (screens.md screen 8). */
  pending: 'rgba(255,255,255,0.18)',
} as const;

/**
 * Semantic — P&L ONLY. design.md §1.
 *
 * Never use these for selection, focus, branding or emphasis. Enforced by
 * `src/design/__lint__/pnl-color-law.test.ts`.
 */
export const pnl = {
  /** Gains, active agent status, positive delta. */
  up: '#2BD87A',
  /** Delta chip background. */
  upBg: 'rgba(43,216,122,0.14)',
  /** Text on a solid `up` fill. */
  upInk: '#04160C',
  /** Losses, negative delta, stop loss. */
  down: '#FF453A',
  /** Negative delta chip background. */
  downBg: 'rgba(255,69,58,0.14)',
  /** Caution: risk mid-band, unbacked recovery phrase. */
  warn: '#E8C64A',
  /** Bullish candle body + wick, TP band. Deeper than `up` so it holds against white. */
  candleUp: '#16C060',
  /** Bearish candle, SL band. */
  candleDown: '#EF3B36',
  /** Take-profit region wash. */
  tpZone: 'rgba(22,192,96,0.10)',
  /** Stop-loss region wash. */
  slZone: 'rgba(255,69,58,0.09)',
  /** Volume bar fills — candle direction at 50%. design.md §6 "Volume". */
  volUp: 'rgba(22,192,96,0.5)',
  volDown: 'rgba(239,59,54,0.5)',
  /** Hired pill background (screens.md screen 11). */
  hiredBg: 'rgba(43,216,122,0.15)',
  /** Auto Close cancel button (screens.md screen 6). */
  cancelBg: '#E4F7EC',
  cancelInk: '#16A254',
} as const;

/**
 * Pre-account blue — screen 1 (splash) ONLY. screens.md: "The only screen using blue — it's
 * pre-account, before the P&L color law applies." Do not reference this anywhere else.
 */
export const preAccount = { blue: '#29A3F5' } as const;

/** Gold long button — screen 25. screens.md: Long (`#F5CE5F` on `#1A1204`). */
export const commodity = { goldFill: '#F5CE5F', goldInk: '#1A1204' } as const;

/** Rank gold — leaderboard first place (screens.md screen 16). */
export const rank = { first: '#F0BE55' } as const;

export const colors = {
  ...surfaces,
  ink,
  sheet,
  borders,
  pnl,
  preAccount,
  commodity,
  rank,
} as const;

export type Colors = typeof colors;

/**
 * A palette hex at a given opacity, as an `rgba()` string.
 *
 * Needed because `boxShadow` — the only shadow API that keeps its tint on web now that the
 * `shadow*` props are deprecated — takes a CSS color, and the design's shadows are all
 * "this token at N%". Keeping the conversion here means a bloom still traces back to a token
 * rather than becoming a raw hex at the call site.
 */
export function alpha(hex: string, opacity: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${opacity})`;
}
