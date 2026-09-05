import { describe, expect, it } from 'vitest';
import { curveFrom, maxDrawdown, sharpeRatio } from './engine.js';

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

  it('the curve fits the 360x110 viewBox design.md specifies', () => {
    const curve = curveFrom(Array.from({ length: 365 }, (_, i) => 1000 + i));
    const pts = curve.split(' ').map((p) => p.split(',').map(Number));
    expect(pts.length).toBeGreaterThan(5);
    expect(pts.length).toBeLessThan(60); // downsampled to stay readable
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(360);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(110);
    }
    // A rising equity series must END higher on screen, i.e. at a LOWER y.
    expect(pts[pts.length - 1]![1]!).toBeLessThan(pts[0]![1]!);
  });

  it('a falling series ends lower on screen', () => {
    const pts = curveFrom(Array.from({ length: 100 }, (_, i) => 1000 - i))
      .split(' ')
      .map((p) => p.split(',').map(Number));
    expect(pts[pts.length - 1]![1]!).toBeGreaterThan(pts[0]![1]!);
  });
});
