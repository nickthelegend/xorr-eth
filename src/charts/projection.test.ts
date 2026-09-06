/**
 * The two projections, and the P&L colour law.
 *
 * design.md §6: "Using one projection for both is a bug — the wide scale flattens the candles, the
 * tight scale clips the take-profit band." Both are in use (the pro chart is tight, Auto Close is
 * wide) and nothing asserted they actually differ, so a refactor that collapsed them would have
 * passed every test while quietly ruining both screens.
 */
import { describe, expect, it } from 'vitest';
import { projectCandles, tight, wide } from './project';
import { pnl } from '../design/colors';
import type { Bar } from '../data/types';

/** Twelve bars that alternate up and down, so both colours are exercised. */
const BARS: Bar[] = Array.from({ length: 12 }, (_, i) =>
  i % 2 === 0
    ? ([100 + i, 108 + i, 98 + i, 106 + i] as const)
    : ([106 + i, 107 + i, 96 + i, 99 + i] as const),
);

describe('tight and wide are genuinely different projections', () => {
  it('produce different geometry for the same bars', () => {
    const t = projectCandles(BARS, tight(BARS));
    const w = projectCandles(BARS, wide(BARS, 200, 50));
    expect(t).not.toEqual(w);
  });

  it('the wide scale accommodates a take-profit far above the highs', () => {
    // A TP well outside the price range must still land on the chart, which is what "wide" is for.
    const w = wide(BARS, 400, 20);
    const t = tight(BARS);
    expect(w.hi).toBeGreaterThan(t.hi);
    expect(w.lo).toBeLessThan(t.lo);
  });

  it('the tight scale hugs the price, which is what makes the candles readable', () => {
    const t = tight(BARS);
    const maxHigh = Math.max(...BARS.map((b) => b[1]));
    const minLow = Math.min(...BARS.map((b) => b[2]));
    expect(t.hi - maxHigh).toBeLessThan(w0(minLow, maxHigh));
    expect(minLow - t.lo).toBeLessThan(w0(minLow, maxHigh));
  });
});

/** A generous bound: the padding must be small relative to the range it is padding. */
function w0(lo: number, hi: number): number {
  return Math.max(hi - lo, 1) * 20;
}

describe('the P&L colour law', () => {
  it('marks every rising candle up and every falling candle down', () => {
    const candles = projectCandles(BARS, tight(BARS));
    candles.forEach((c, i) => {
      const [open, , , close] = BARS[i]!;
      expect(c.up, `bar ${i} (${open} -> ${close})`).toBe(close >= open);
    });
  });

  it('never inverts: up is green and down is red, and the two are distinct', () => {
    // The one colour rule this codebase cannot get wrong. Green for a fall would be a lie told in
    // the most glanceable form the app has.
    expect(pnl.candleUp).not.toBe(pnl.candleDown);
    expect(pnl.candleUp.toUpperCase()).toBe('#16C060');
    expect(pnl.candleDown.toUpperCase()).toBe('#EF3B36');
  });

  it('projects every bar it is given — no silent truncation', () => {
    expect(projectCandles(BARS, tight(BARS))).toHaveLength(BARS.length);
  });
});
