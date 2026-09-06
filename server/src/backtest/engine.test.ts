import { describe, expect, it } from 'vitest';
import { curvePoints, maxDrawdown, sharpeRatio } from './engine.js';

describe('12.22 backtest maths', () => {
  it('max drawdown is the worst peak-to-trough, as a negative percentage', () => {
    expect(maxDrawdown([100, 120, 60, 90])).toBeCloseTo(-50, 6);
    expect(maxDrawdown([100, 110, 120])).toBe(0);
    expect(maxDrawdown([100, 90, 95, 80])).toBeCloseTo(-20, 6);
  });

  it('sharpe is zero for a flat series and positive for a steady climb', () => {
    expect(sharpeRatio([0, 0, 0, 0])).toBe(0);
    expect(sharpeRatio([0.01, 0.011, 0.009, 0.01])).toBeGreaterThan(0);
    expect(sharpeRatio([-0.01, -0.011, -0.009])).toBeLessThan(0);
  });

  it('the curve downsamples to a readable length and keeps the real values', () => {
    const equity = Array.from({ length: 365 }, (_, i) => 1000 + i);
    const pts = curvePoints(equity);
    expect(pts.length).toBeGreaterThan(5);
    expect(pts.length).toBeLessThan(60); // downsampled to stay readable
    // Values, not viewBox coordinates: every point is one the series actually held.
    for (const v of pts) expect(equity).toContain(v);
    // A rising series still rises.
    expect(pts[pts.length - 1]!).toBeGreaterThan(pts[0]!);
  });

  it('the last point survives the downsample', () => {
    // The screen quotes the final equity beside the chart. A line that stops a stride short
    // of it disagrees with the number next to it.
    for (const n of [7, 40, 41, 100, 365]) {
      const equity = Array.from({ length: n }, (_, i) => 1000 + i * 3);
      expect(curvePoints(equity).at(-1)).toBe(equity.at(-1));
    }
  });

  it('a falling series ends lower', () => {
    const pts = curvePoints(Array.from({ length: 100 }, (_, i) => 1000 - i));
    expect(pts[pts.length - 1]!).toBeLessThan(pts[0]!);
  });

  it('an empty series gives no points rather than a fabricated one', () => {
    expect(curvePoints([])).toEqual([]);
  });
});
