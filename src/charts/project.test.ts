/**
 * PLAN.md 4.1 / 4.11 — the projection math is the highest-risk piece in the app, and design.md
 * documents it exactly. These tests are the guard against a refactor silently moving a candle.
 */
import { describe, expect, it } from 'vitest';
import {
  BODY_MIN_PCT,
  axisPrices,
  projectCandles,
  projectVolume,
  tight,
  tpSlBands,
  volumeFromBars,
  wide,
} from './project';
import { btcBars } from '../data/fixtures/series';
import { slPrice, tpPrice } from '../state/derived';
import { axisLabel } from '../format';
import type { Bar } from '../data/types';

describe('4.1 the two projections', () => {
  it('tight pads the series by 120 either side', () => {
    const p = tight(btcBars);
    expect(p.hi).toBe(66620 + 120); // maxHigh + 120
    expect(p.lo).toBe(65180 - 120); // minLow - 120
    expect(p.kind).toBe('tight');
  });

  it('wide brackets the TP/SL prices with a 150 pad', () => {
    const tp = tpPrice(1.0); // 66660
    const sl = slPrice(-1.0); // 65340
    const p = wide(btcBars, tp, sl);
    expect(p.hi).toBe(Math.max(66620, tp) + 150);
    expect(p.lo).toBe(Math.min(65180, sl) - 150);
  });

  it('y maps hi->0% and lo->100%', () => {
    const p = tight(btcBars);
    expect(p.y(p.hi)).toBe(0);
    expect(p.y(p.lo)).toBe(100);
    expect(p.y((p.hi + p.lo) / 2)).toBeCloseTo(50, 10);
  });

  it('THE BUG design.md warns about: one projection cannot serve both', () => {
    // At the widest TP setting the tight scale pushes the marker off-canvas...
    const tp3 = tpPrice(3.0); // 67980, above maxHigh 66620
    const t = tight(btcBars);
    expect(t.y(tp3)).toBeLessThan(0); // off the top of the box

    // ...while the wide scale keeps it in frame at every setting.
    for (const tpPct of [0.5, 1.0, 1.5, 2.0, 2.5, 3.0]) {
      for (const slPct of [-0.5, -1.0, -1.5, -2.0, -2.5, -3.0]) {
        const w = wide(btcBars, tpPrice(tpPct), slPrice(slPct));
        expect(w.y(tpPrice(tpPct)), `tp ${tpPct}`).toBeGreaterThan(0);
        expect(w.y(slPrice(slPct)), `sl ${slPct}`).toBeLessThan(100);
      }
    }
  });

  it('and the wide scale really does flatten the candles — the other half of the bug', () => {
    const t = projectCandles(btcBars, tight(btcBars));
    const w = projectCandles(btcBars, wide(btcBars, tpPrice(3.0), slPrice(-3.0)));
    const span = (cs: { bodyH: number }[]) => cs.reduce((a, c) => a + c.bodyH, 0);
    expect(span(t)).toBeGreaterThan(span(w));
  });
});

describe('4.2 candle geometry', () => {
  const p = tight(btcBars);
  const candles = projectCandles(btcBars, p);

  it('projects all 12 candles', () => {
    expect(candles).toHaveLength(12);
    expect(candles[11]!.last).toBe(true);
    expect(candles[0]!.last).toBe(false);
  });

  it('direction follows close >= open', () => {
    btcBars.forEach((b, i) => {
      expect(candles[i]!.up, `bar ${i}`).toBe(b[3] >= b[0]);
    });
  });

  it('the wick always contains the body', () => {
    for (const c of candles) {
      expect(c.wickTop).toBeLessThanOrEqual(c.bodyTop + 1e-9);
      expect(c.wickTop + c.wickH).toBeGreaterThanOrEqual(c.bodyTop + c.bodyH - BODY_MIN_PCT - 1e-9);
      expect(c.wickH).toBeGreaterThanOrEqual(0);
    }
  });

  it('applies the 1.4% doji floor', () => {
    // A perfect doji: open === close.
    const doji: Bar[] = [[66000, 66200, 65800, 66000]];
    const [c] = projectCandles(doji, tight(doji));
    expect(c!.bodyH).toBe(BODY_MIN_PCT);
  });

  it('everything stays inside the plot box', () => {
    for (const c of candles) {
      expect(c.wickTop).toBeGreaterThanOrEqual(0);
      expect(c.wickTop + c.wickH).toBeLessThanOrEqual(100);
      expect(c.bodyTop).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('4.3 the price axis derives from the active projection', () => {
  it('produces 5 labels from hi to lo', () => {
    const p = tight(btcBars);
    const prices = axisPrices(p);
    expect(prices).toHaveLength(5);
    expect(prices[0]).toBe(p.hi);
    expect(prices[4]).toBe(p.lo);
    // hi 66740, lo 65060, span 1680 -> quarters at 66320 / 65900 / 65480.
    expect(prices.map(axisLabel)).toEqual(['66.7K', '66.3K', '65.9K', '65.5K', '65.1K']);
  });

  it('the wide projection yields DIFFERENT labels — proof they are not hardcoded', () => {
    const t = axisPrices(tight(btcBars)).map(axisLabel);
    const w = axisPrices(wide(btcBars, tpPrice(3.0), slPrice(-3.0))).map(axisLabel);
    expect(w).not.toEqual(t);
  });
});

describe('4.9 TP/SL bands', () => {
  it('washes run from the top to TP and from SL to the bottom', () => {
    const tp = tpPrice(1.0);
    const sl = slPrice(-1.0);
    const p = wide(btcBars, tp, sl);
    const b = tpSlBands(p, tp, sl);
    expect(b.tpZoneH).toBeCloseTo(p.y(tp), 10);
    expect(b.slZoneH).toBeCloseTo(100 - p.y(sl), 10);
    // The two washes never overlap: TP sits above SL.
    expect(b.tpZoneH + b.slZoneH).toBeLessThan(100);
  });

  it('markers move as the user steps TP/SL, and TP is always above SL', () => {
    for (const tpPct of [0.5, 1.5, 3.0]) {
      const tp = tpPrice(tpPct);
      const sl = slPrice(-1.0);
      const p = wide(btcBars, tp, sl);
      const b = tpSlBands(p, tp, sl);
      expect(b.tpLineTop).toBeLessThan(b.slLineTop);
    }
  });
});

describe('4.5 volume', () => {
  it('normalises against the largest bar', () => {
    expect(projectVolume([5, 10, 2])).toEqual([50, 100, 20]);
  });
  it('derives a plausible volume shape from OHLC when a feed gives none', () => {
    const v = volumeFromBars(btcBars);
    expect(v).toHaveLength(12);
    for (const x of v) expect(x).toBeGreaterThan(0);
  });
});
