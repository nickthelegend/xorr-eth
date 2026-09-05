/**
 * Motion — animations.md. Read that file before adding anything here.
 *
 * The rules, verbatim:
 *  1. Never animate a price. Values snap.
 *  2. One property per transition.
 *  3. Durations: 150 / 180 / 250ms. Nothing else.
 *  4. Platform-default easing. No custom cubic-bezier, no bounce, no spring, no overshoot.
 *  5. No entrance animations.
 *  6. Respect reduced motion.
 */
/** animations.md §3: "Durations: 150 / 180 / 250ms. Nothing else." */
export const DURATION = {
  /** Segmented thumb background. Fastest in the app — selection must feel instant. */
  fast: 150,
  /** Switch knob + track, spend-cap marker, close fill, swap fill. */
  base: 180,
  /** Allocation bars (200 is a documented exception, see below). */
  bars: 200,
  /** Leaderboard bars, KYC/wallet progress, order-fill confirmation. */
  slow: 250,
  /**
   * The orb idle breathe. animations.md sanctions "a slow 3-4s scale breathe (1.0 -> 1.015) on
   * ACTIVE agents only". This is the half-cycle, because the animation reverses.
   */
  breatheHalf: 1750,
} as const;

export type Duration = (typeof DURATION)[keyof typeof DURATION];

/**
 * The complete sanctioned inventory — animations.md "Inventory" plus the two additions the doc
 * explicitly permits. Anything not listed here does not animate.
 */
export const MOTION_INVENTORY = {
  switchKnob: { property: 'transform', duration: DURATION.base },
  switchTrack: { property: 'background', duration: DURATION.base },
  segmentedThumb: { property: 'background', duration: DURATION.fast },
  spendCapMarker: { property: 'left', duration: DURATION.base },
  allocationBars: { property: 'width', duration: DURATION.bars },
  leaderboardBars: { property: 'width', duration: DURATION.slow },
  closeFill: { property: 'width', duration: DURATION.base },
  swapFill: { property: 'width', duration: DURATION.base },
  onboardingProgress: { property: 'width', duration: DURATION.slow },
  /** animations.md "If you add motion" #1 — active agents only, off when paused. */
  orbBreathe: { property: 'transform', duration: 3500 },
  /** animations.md "If you add motion" #2 — once, on arrival. */
  fillConfirm: { property: 'transform', duration: DURATION.slow },
} as const;

/** animations.md "Not animated, on purpose". Referenced by the motion audit test. */
export const NEVER_ANIMATED = [
  'candles',
  'prices',
  'deltas',
  'pnl',
  'orderTotals',
  'keypadAmount',
  'tpSlMarkers',
  'screenTransitions',
  'agentStatusDot',
] as const;
