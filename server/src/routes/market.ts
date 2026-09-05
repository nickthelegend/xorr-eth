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

/**
 * Stale-while-revalidate.
 *
 * The public price tier rate-limits, and `http/get.ts` answers that with spaced retries and
 * exponential backoff — correct for a scheduled buy, far too slow for a chart. A cold `days=1`
 * request measured 26s, which is longer than any client is willing to wait, so the app timed out
 * on data the server was about to have.
 *
 * So: if there is a value inside the staleness window, return it now and refresh in the
 * background. Only a request with nothing cached at all waits, and even that falls back to the
 * last good body before failing. A price a minute old beats a spinner; a price nobody has ever
 * fetched is the only case worth blocking on.
 */
const FRESH_MS = 30_000;
const refreshing = new Set<string>();

async function getWithStale<T>(url: string, timeoutMs = 12_000): Promise<T> {
  const cached = staleValue<T>(url, STALE_TOLERANCE_MS);
  const fresh = staleValue<T>(url, FRESH_MS);
  if (fresh) return fresh;

  if (cached) {
    if (!refreshing.has(url)) {
      refreshing.add(url);
      void getJson<T>(url, 0, timeoutMs)
        .catch(() => undefined)
        .finally(() => refreshing.delete(url));
    }
    return cached;
  }

  // Nothing cached at all: start the fetch, but do not let a UI request sit through the whole
  // retry ladder. Under a rate limit that ladder has measured over a minute, and no screen should
  // block for that. Give up at the deadline and let the fetch finish in the background, so the
  // next request — a retry, a refresh, another viewer — is instant.
  const fetching = getJson<T>(url, 0, timeoutMs);
  void fetching.catch(() => undefined);

  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ColdFetchPending(url)), COLD_DEADLINE_MS);
  });
  try {
    return await Promise.race([fetching, deadline]);
  } catch (e) {
    const last = staleValue<T>(url, STALE_TOLERANCE_MS);
    if (last) return last;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Not an error in the upstream — just "not yet". The route turns it into a 503 with a Retry-After. */
class ColdFetchPending extends Error {
  constructor(url: string) {
    super(`Still fetching ${url}`);
    this.name = 'ColdFetchPending';
  }
}

/** How long a first-ever request will wait before telling the client to come back. */
const COLD_DEADLINE_MS = 8_000;

/**
 * Every symbol we have a feed for, in ONE upstream call.
 *
 * The cache is keyed by URL, so asking for {BTC,ETH} and {BTC,ETH,SOL} used to be two different
 * URLs, two cache entries and two trips through the rate limiter — and every new combination a
 * screen asked for started cold. One URL for the whole list means the first request warms every
 * subsequent one, whatever subset it wants.
 */
const ALL_IDS_URL =
  `${COINGECKO}/simple/price` +
  `?ids=${[...new Set(Object.values(COINGECKO_IDS))].join(',')}` +
  `&vs_currencies=usd&include_24hr_change=true`;

/** GET /market/quotes?symbols=BTC,ETH — spot + 24h change. Unknown symbols are omitted. */
market.get('/market/quotes', async (c) => {
  try {
  const symbols = (c.req.query('symbols') ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => COINGECKO_IDS[s]);
  if (symbols.length === 0) return c.json({});

  const data = await getWithStale<Record<string, { usd?: number; usd_24h_change?: number }>>(
    ALL_IDS_URL,
  );

  const out: Record<string, { price: number; change24h: number; source: string }> = {};
  for (const sym of symbols) {
    const row = data[COINGECKO_IDS[sym]!];
    if (row && typeof row.usd === 'number') {
      out[sym] = { price: row.usd, change24h: row.usd_24h_change ?? 0, source: 'coingecko' };
    }
  }
    return c.json(out);
  } catch (e) {
    // Not yet fetched is "come back", not "broken". A 500 would make the app show an error for
    // data that is thirty seconds away.
    if (e instanceof ColdFetchPending) {
      c.header('retry-after', '3');
      return c.json({ error: 'warming', detail: 'Prices are being fetched; retry shortly.' }, 503);
    }
    throw e;
  }
});

/** GET /market/ohlc?symbol=BTC&days=30 — raw OHLC rows; the client folds them to 12 candles. */
market.get('/market/ohlc', async (c) => {
  const symbol = (c.req.query('symbol') ?? '').toUpperCase();
  const id = COINGECKO_IDS[symbol];
  if (!id) return c.json({ error: `no feed for ${symbol}` }, 404);

  const days = Number(c.req.query('days') ?? 30);
  if (!Number.isFinite(days) || days <= 0) return c.json({ error: 'bad days' }, 400);

  try {
    const rows = await getWithStale<[number, number, number, number, number][]>(
      `${COINGECKO}/coins/${id}/ohlc?vs_currency=usd&days=${days}`,
    );
    return c.json({ symbol, days, rows });
  } catch (e) {
    if (e instanceof ColdFetchPending) {
      c.header('retry-after', '3');
      return c.json({ error: 'warming', detail: 'History is being fetched; retry shortly.' }, 503);
    }
    throw e;
  }
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

/**
 * Warm the windows every screen opens on.
 *
 * The public price tier is slow to serve a cold request under load, and the first person to open
 * the app should not be the one who pays for it. This fetches the quote list and the five chart
 * windows once at boot, in the background, so the cache is populated before anyone asks.
 *
 * Failures are ignored on purpose: a warm-up that cannot reach the upstream is not a reason to
 * refuse to start, and the request path already handles a cold cache.
 */
export function warmMarketCache(): void {
  // Ordered by what a cold user hits first: the market list, then the default 1D chart, then the
  // rest of the timeframe pills. The upstream serves these one at a time behind a rate limit, so
  // the order is the difference between a fast first screen and a fast last one.
  const urls = [ALL_IDS_URL];
  for (const days of [1, 30, 7, 90]) {
    for (const symbol of ['BTC', 'ETH', 'WETH']) {
      const id = COINGECKO_IDS[symbol];
      if (id) urls.push(`${COINGECKO}/coins/${id}/ohlc?vs_currency=usd&days=${days}`);
    }
  }

  // Keep trying until each one lands. A single pass is not enough on a rate-limited tier: the
  // first sweep can exhaust its retries while the queue is backed up, and then the endpoint stays
  // cold until a user happens to ask for it — which is precisely the request that should be fast.
  const pending = new Set(urls);
  const sweep = async () => {
    for (const url of [...pending]) {
      if (staleValue(url, FRESH_MS)) {
        pending.delete(url);
        continue;
      }
      try {
        await getJson(url, FRESH_MS);
        pending.delete(url);
      } catch {
        // Leave it pending; the next sweep tries again.
      }
    }
    if (pending.size > 0) setTimeout(() => void sweep(), WARM_RETRY_MS).unref?.();
  };
  void sweep();
}

/** How long to wait before another go at whatever has not warmed yet. */
const WARM_RETRY_MS = 20_000;

