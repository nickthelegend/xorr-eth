/**
 * LIVE integration test — hits the real CoinGecko and Jupiter APIs, no mocks.
 * Run with: npm run test:live   (excluded from the default suite so CI stays hermetic)
 */
import { describe, expect, it } from 'vitest';
import { COINGECKO_IDS, aggregateBars, fetchCandles, fetchJupiterPrice, fetchQuotes } from './marketData';
import { assetClasses } from './fixtures/markets';
import type { Bar } from './types';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

describe('live market data', () => {
  it('prices all 9 crypto instruments for real', async () => {
    const crypto = assetClasses.find((c) => c.id === 'crypto')!;
    const symbols = crypto.instruments.map((i) => i.sym);
    expect(symbols).toHaveLength(9);
    const quotes = await fetchQuotes(symbols);
    for (const sym of symbols) {
      const q = quotes[sym];
      expect(q, `${sym} has no live quote`).toBeDefined();
      expect(q!.price).toBeGreaterThan(0);
      expect(Number.isFinite(q!.change24h)).toBe(true);
      expect(q!.source).toBe('coingecko');
    }
    // Sanity: BTC should be the most expensive of the nine.
    const btc = quotes.BTC!.price;
    for (const [sym, q] of Object.entries(quotes)) {
      if (sym !== 'BTC') expect(btc).toBeGreaterThan(q.price);
    }
  }, 90_000);

  it('prices SOL on-chain via the venue the executor trades against', async () => {
    const jup = await fetchJupiterPrice(SOL_MINT);
    expect(jup).not.toBeNull();
    expect(jup!.price).toBeGreaterThan(0);
    expect(jup!.source).toBe('jupiter');

    // The venue price and the aggregate should agree within a few percent, or one of them is wrong.
    const cg = await fetchQuotes(['SOL']);
    const drift = Math.abs(jup!.price - cg.SOL!.price) / cg.SOL!.price;
    expect(drift, `jupiter ${jup!.price} vs coingecko ${cg.SOL!.price}`).toBeLessThan(0.05);
  }, 90_000);

  it('returns real 12-candle OHLC for every timeframe [G8]', async () => {
    for (const tf of ['15m', '1H', '4H', '1D', '1W'] as const) {
      const c = await fetchCandles('BTC', tf);
      expect(c, `${tf} returned nothing`).not.toBeNull();
      expect(c!.feed).toBe('live');
      expect(c!.bars.length).toBeGreaterThan(0);
      expect(c!.bars.length).toBeLessThanOrEqual(12);
      for (const [o, h, l, cl] of c!.bars) {
        expect(h).toBeGreaterThanOrEqual(Math.max(o, cl));
        expect(l).toBeLessThanOrEqual(Math.min(o, cl));
        expect(o).toBeGreaterThan(0);
      }
    }
  }, 90_000);

  it('different timeframes really do return different series — the pills are no longer decorative', async () => {
    const short = await fetchCandles('BTC', '1H');
    const long = await fetchCandles('BTC', '1W');
    expect(short!.bars).not.toEqual(long!.bars);
    // A 90-day window must span a wider price range than a 1-day window.
    const range = (b: Bar[]) => Math.max(...b.map((x) => x[1])) - Math.min(...b.map((x) => x[2]));
    expect(range(long!.bars)).toBeGreaterThan(range(short!.bars));
  }, 60_000);
});

describe('bar aggregation', () => {
  it('folds n raw bars into 12: first open, max high, min low, last close', () => {
    const raw: Bar[] = Array.from({ length: 48 }, (_, i) => [i, i + 2, i - 1, i + 1]);
    const out = aggregateBars(raw, 12);
    expect(out).toHaveLength(12);
    for (const [o, h, l, c] of out) {
      expect(h).toBeGreaterThanOrEqual(Math.max(o, c));
      expect(l).toBeLessThanOrEqual(Math.min(o, c));
    }
    expect(out[11]![3]).toBe(raw[47]![3]);
  });

  it('passes through when there are already 12 or fewer', () => {
    const raw: Bar[] = [[1, 2, 0, 1], [1, 3, 1, 2]];
    expect(aggregateBars(raw, 12)).toEqual(raw);
  });

  it('every mapped id is a non-empty string', () => {
    expect(Object.keys(COINGECKO_IDS)).toHaveLength(9);
    for (const v of Object.values(COINGECKO_IDS)) expect(v.length).toBeGreaterThan(0);
  });
});
