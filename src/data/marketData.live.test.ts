/**
 * LIVE integration test — real prices, no mocks.
 *
 * These now go through the running executor's public /market routes, which is exactly what the app
 * does on web: a direct browser call to CoinGecko dies in a CORS preflight. So this test also
 * proves the proxy is up and the symbol map on both sides agrees.
 *
 * Run with: npm run test:live   (excluded from the default suite so CI stays hermetic)
 */
import { describe, expect, it } from 'vitest';
import { aggregateBars, fetchCandles, fetchQuotes, pricedSymbols } from './marketData';
import { assetClasses } from './fixtures/markets';
import type { Bar } from './types';

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

  it('prices the Base assets the delegation actually trades', async () => {
    // WETH and cbBTC are what a Base strategy holds; if they have no feed the order ticket and the
    // executor are pricing different things.
    const quotes = await fetchQuotes(['WETH', 'CBBTC', 'USDC']);
    for (const sym of ['WETH', 'CBBTC', 'USDC']) {
      expect(quotes[sym], `${sym} has no live quote`).toBeDefined();
      expect(quotes[sym]!.price).toBeGreaterThan(0);
    }
    // WETH must track ETH: same asset, one wrapped. Anything past a few percent is a broken map.
    const eth = await fetchQuotes(['ETH']);
    const drift = Math.abs(quotes.WETH!.price - eth.ETH!.price) / eth.ETH!.price;
    expect(drift, `WETH ${quotes.WETH!.price} vs ETH ${eth.ETH!.price}`).toBeLessThan(0.05);
    // A dollar stablecoin that is not within a cent of a dollar is a feed bug, not a market move.
    expect(Math.abs(quotes.USDC!.price - 1)).toBeLessThan(0.01);
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

  it('the priceable symbols come from the SERVER, and include the ones we trade', async () => {
    /*
     * The point of this test changed with the code it covers. It used to assert that a
     * client-side copy of the id map was well-formed — which it always was, right up to the
     * moment it drifted from the server's and started filtering gold out of its own price
     * request. There is no copy now, so what is worth asserting is that the real list arrives
     * and carries the assets the app actually trades.
     */
    const priced = await pricedSymbols();
    expect(priced.size).toBeGreaterThan(0);
    for (const sym of ['WETH', 'USDC', 'CBBTC', 'BTC', 'ETH']) expect(priced.has(sym)).toBe(true);
    // The two that drifted. A real gold feed exists; the commodities tab must be able to ask.
    for (const sym of ['XAUT', 'PAXG']) expect(priced.has(sym)).toBe(true);
  });
});
