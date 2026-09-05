/**
 * Chart projection — design.md §6 "Candlestick — the centerpiece".
 *
 * "Author OHLC in price space, then project to percentage of the plot box. Never hand-place pixels."
 *
 *   const y = v => ((hi - v) / (hi - lo)) * 100;
 *
 * TWO PROJECTIONS, DELIBERATELY. design.md:
 *   "Using one projection for both is a bug: the wide scale flattens the candles, the tight scale
 *    pushes the TP marker off-canvas."
 *
 *   tight — tHi = maxHigh + 120, tLo = minLow - 120     (screen 21, the pro chart)
 *   wide  — hi  = max(maxHigh, tpPrice) + 150,
 *           lo  = min(minLow,  slPrice) - 150            (screen 6, Auto Close)
 */
import type { Bar } from '../data/types';

export type Projection = {
  hi: number;
  lo: number;
  /** price -> % from the top of the plot box. */
  y: (v: number) => number;
  kind: 'tight' | 'wide';
};

/** design.md §6: the doji floor. A body never renders thinner than 1.4% of the box. */
export const BODY_MIN_PCT = 1.4;

const TIGHT_PAD = 120;
const WIDE_PAD = 150;

function maxHigh(bars: readonly Bar[]): number {
  return Math.max(...bars.map((b) => b[1]));
}
function minLow(bars: readonly Bar[]): number {
  return Math.min(...bars.map((b) => b[2]));
}

function make(hi: number, lo: number, kind: 'tight' | 'wide'): Projection {
  const span = hi - lo;
  return { hi, lo, kind, y: (v: number) => ((hi - v) / span) * 100 };
}

/** The pro chart. Candles fill the box. */
export function tight(bars: readonly Bar[]): Projection {
  return make(maxHigh(bars) + TIGHT_PAD, minLow(bars) - TIGHT_PAD, 'tight');
}

/**
 * Auto Close. The bounds follow the TP/SL prices so both markers stay in frame at any setting —
 * that is the entire reason this projection exists.
 */
export function wide(bars: readonly Bar[], tpPrice: number, slPrice: number): Projection {
  return make(
    Math.max(maxHigh(bars), tpPrice) + WIDE_PAD,
    Math.min(minLow(bars), slPrice) - WIDE_PAD,
    'wide',
  );
}

export type ProjectedCandle = {
  up: boolean;
  /** % from the top. */
  wickTop: number;
  wickH: number;
  bodyTop: number;
  bodyH: number;
  last: boolean;
};

/** Project a series into the percentage geometry design.md §6 specifies, per candle. */
export function projectCandles(bars: readonly Bar[], p: Projection): ProjectedCandle[] {
  return bars.map((b, i) => {
    const [open, high, low, close] = b;
    const up = close >= open;
    const bodyTop = p.y(Math.max(open, close));
    const bodyBottom = p.y(Math.min(open, close));
    return {
      up,
      wickTop: p.y(high),
      wickH: p.y(low) - p.y(high),
      bodyTop,
      // design.md: Math.max(1.4, ...) — the 1.4% floor is what makes a doji visible.
      bodyH: Math.max(BODY_MIN_PCT, bodyBottom - bodyTop),
      last: i === bars.length - 1,
    };
  });
}

/**
 * Price-axis labels — design.md §6:
 *   [0,.25,.5,.75,1].map(t => (tHi - t*(tHi-tLo))/1000)
 * "Price axis labels derive from the active projection — never hardcode them."
 */
export function axisPrices(p: Projection): number[] {
  return [0, 0.25, 0.5, 0.75, 1].map((t) => p.hi - t * (p.hi - p.lo));
}

/**
 * TP/SL wash bands — state.md:
 *   tpZoneH = y(tpPrice)          (wash from the top down to TP)
 *   slZoneH = 100 - y(slPrice)    (wash from SL down to the bottom)
 */
export function tpSlBands(p: Projection, tpPrice: number, slPrice: number) {
  return {
    tpLineTop: p.y(tpPrice),
    slLineTop: p.y(slPrice),
    tpZoneH: p.y(tpPrice),
    slZoneH: 100 - p.y(slPrice),
  };
}

/** Volume bars are normalised against the largest bar in the window. */
export function projectVolume(volumes: readonly number[]): number[] {
  const max = Math.max(...volumes, 1);
  return volumes.map((v) => (v / max) * 100);
}

/**
 * Synthetic volume from OHLC, used when a feed gives no volume: range x direction weight.
 * Labelled honestly — the caller stamps feed:'simulated' if it uses this.
 */
export function volumeFromBars(bars: readonly Bar[]): number[] {
  return bars.map(([o, h, l, c]) => (h - l) * (1 + Math.abs(c - o) / Math.max(h - l, 1e-9)));
}
