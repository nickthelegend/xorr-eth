/**
 * Public market data.
 *
 * The app used to call CoinGecko straight from the browser. CoinGecko sends no
 * `access-control-allow-origin`, so on web every quote and every candle died in a CORS preflight
 * and the whole market surface fell back to simulated numbers — the exact failure PLAN.md §1.3
 * item 8 is meant to prevent.
 *
 * Routing it through the executor fixes that and buys three things the client cannot have:
 * one shared rate-limit queue instead of one per open tab, the stale-value fallback in
 * `http/get.ts`, and a single definition of which symbols have a real feed.
 *
 * These two routes are deliberately public: a spot price is not user data, and gating it behind a
 * session would mean an unauthenticated visitor sees a market list of dashes.
 */
import { Hono } from 'hono';
import { getJson, staleValue } from '../http/get.js';
import { COINGECKO_IDS } from '../market/ids.js';
import { TOKENS, quote } from '../venues/oneinch.js';
import { STOCKS } from '../venues/stocks.js';
import { usdcSupplyYield } from '../market/yield.js';

export const market = new Hono();

const COINGECKO = 'https://api.coingecko.com/api/v3';
const STALE_TOLERANCE_MS = 10 * 60_000;

/** Retry-exhausted is not the same as no-feed: fall back to the last good body before failing. */
async function getWithStale<T>(url: string, timeoutMs = 12_000): Promise<T> {
  try {
    return await getJson<T>(url, timeoutMs);
  } catch (e) {
    const stale = staleValue<T>(url, STALE_TOLERANCE_MS);
    if (!stale) throw e;
    return stale;
  }
}

/** GET /market/quotes?symbols=BTC,ETH — spot + 24h change. Unknown symbols are omitted. */
market.get('/market/quotes', async (c) => {
  const symbols = (c.req.query('symbols') ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => COINGECKO_IDS[s]);
  if (symbols.length === 0) return c.json({});

  const ids = [...new Set(symbols.map((s) => COINGECKO_IDS[s]!))].join(',');
  const data = await getWithStale<Record<string, { usd?: number; usd_24h_change?: number }>>(
    `${COINGECKO}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
  );

  const out: Record<string, { price: number; change24h: number; source: string }> = {};
  for (const sym of symbols) {
    const row = data[COINGECKO_IDS[sym]!];
    if (row && typeof row.usd === 'number') {
      out[sym] = { price: row.usd, change24h: row.usd_24h_change ?? 0, source: 'coingecko' };
    }
  }
  return c.json(out);
});

/** GET /market/ohlc?symbol=BTC&days=30 — raw OHLC rows; the client folds them to 12 candles. */
market.get('/market/ohlc', async (c) => {
  const symbol = (c.req.query('symbol') ?? '').toUpperCase();
  const id = COINGECKO_IDS[symbol];
  if (!id) return c.json({ error: `no feed for ${symbol}` }, 404);

  const days = Number(c.req.query('days') ?? 30);
  if (!Number.isFinite(days) || days <= 0) return c.json({ error: 'bad days' }, 400);

  const rows = await getWithStale<[number, number, number, number, number][]>(
    `${COINGECKO}/coins/${id}/ohlc?vs_currency=usd&days=${days}`,
  );
  return c.json({ symbol, days, rows });
});

/** GET /market/symbols — which symbols have a real feed. */
market.get('/market/symbols', (c) => c.json(Object.keys(COINGECKO_IDS)));

/**
 * GET /market/tradable — the symbols the executor can actually settle on this chain.
 *
 * Public, and load-bearing: the app used to offer "Buy $50 of SOL weekly" on a Base build, which
 * would have created a strategy no signed transaction could ever fill. Anything not in this list
 * is a chart you can look at, not an order you can place.
 */
market.get('/market/tradable', (c) =>
  c.json(
    Object.entries(TOKENS).map(([symbol, t]) => ({
      symbol,
      address: t.address,
      decimals: t.decimals,
    })),
  ),
);

/**
 * GET /yield/supply — the real USDC supply rate on Aave v3, Base.
 *
 * Public: it is a published on-chain rate, identical for every visitor, and the home screen shows
 * it before a user has a wallet.
 */
market.get('/yield/supply', async (c) => c.json(await usdcSupplyYield()));

/**
 * GET /market/stocks — the tokenized equities, priced off the venue that would fill the trade.
 *
 * There is no CoinGecko feed for these, and quoting the underlying NYSE print would be the wrong
 * number anyway: what a user pays is what 1inch routes on Base right now. So the price is derived
 * from a real quote — swap $1,000 of USDC in, see how many tokens come out — which is the same
 * call the order ticket makes. A symbol whose route fails comes back with `feed: 'simulated'` and
 * no price, and the UI stamps it, rather than showing a plausible-looking invention.
 */
const STOCK_PROBE_USD = 1_000;

/**
 * One cached snapshot for everyone.
 *
 * Eight 1inch quotes take several seconds even in parallel, because the outbound queue in
 * `http/get.ts` spaces requests to stay inside the rate limit. Without this the markets screen
 * blocks on every mount and renders its empty state first. The prices are identical for every
 * user, so caching them is not a shortcut — it is the correct shape.
 */
let stockCache: { at: number; rows: unknown[] } | null = null;
const STOCK_TTL_MS = 30_000;

market.get('/market/stocks', async (c) => {
  if (stockCache && Date.now() - stockCache.at < STOCK_TTL_MS) return c.json(stockCache.rows);

  const rows = await Promise.all(
    Object.values(STOCKS).map(async (s) => {
      try {
        const q = await quote({ inSymbol: 'USDC', outSymbol: s.symbol, amount: STOCK_PROBE_USD });
        if (!(q.outAmount > 0)) throw new Error('no route');
        return {
          symbol: s.symbol,
          name: s.name,
          address: s.address,
          price: STOCK_PROBE_USD / q.outAmount,
          venues: q.venues,
          feed: 'live' as const,
        };
      } catch {
        return {
          symbol: s.symbol,
          name: s.name,
          address: s.address,
          price: null,
          venues: [] as string[],
          feed: 'simulated' as const,
        };
      }
    }),
  );
  stockCache = { at: Date.now(), rows };
  return c.json(rows);
});
