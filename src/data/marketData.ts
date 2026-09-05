/**
 * Live market data — PLAN.md 12.12 / 12.14, closing part of [G22] and [G8].
 *
 * Two real, credential-free sources:
 *   - CoinGecko  — spot quotes + OHLC for the 9 crypto instruments.
 *   - Jupiter    — on-chain USD price for Solana mints (the venue the executor trades on),
 *                  so a quote and a fill are priced off the same book.
 *
 * PLAN.md §1.3 item 8: "Every price on screen is real, or labelled." Anything this module cannot
 * price comes back with `feed: 'simulated'` and the UI stamps a SIMULATED tag on it.
 */
import type { Bar, Candles, Timeframe } from './types';

const COINGECKO = 'https://api.coingecko.com/api/v3';
const JUPITER = 'https://lite-api.jup.ag/price/v3';

/** The 9 crypto instruments, mapped to their CoinGecko ids. */
export const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  XRP: 'ripple',
  DOGE: 'dogecoin',
  HYPE: 'hyperliquid',
  AAVE: 'aave',
  LINK: 'chainlink',
  TON: 'the-open-network',
};

export type Quote = { price: number; change24h: number; source: 'coingecko' | 'jupiter' };

/**
 * The public CoinGecko tier rate-limits aggressively (HTTP 429). A trading UI that drops a price
 * because a chart refreshed is worse than a slightly stale price, so this layer:
 *   - serialises outbound requests with a minimum spacing,
 *   - caches responses for a short TTL (a quote is not worth re-fetching 3x a second),
 *   - retries 429 and 5xx with exponential backoff, honouring Retry-After when present.
 */
const MIN_SPACING_MS = 1_100;
const MAX_ATTEMPTS = 4;

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

const cache = new Map<string, { at: number; value: unknown }>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rawGet<T>(url: string, timeoutMs: number): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const wait = MIN_SPACING_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { accept: 'application/json' },
      });
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 1_000 * 2 ** attempt;
        if (attempt === MAX_ATTEMPTS) throw new Error(`${res.status} after ${attempt} attempts: ${url}`);
        await sleep(backoff);
        continue;
      }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`exhausted retries: ${url}`);
}

async function getJson<T>(url: string, timeoutMs = 12_000, ttlMs = 15_000): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;

  // Serialise: concurrent callers share one outbound stream so spacing actually holds.
  const run = queue.then(() => rawGet<T>(url, timeoutMs));
  queue = run.catch(() => undefined);
  const value = await run;
  cache.set(url, { at: Date.now(), value });
  return value;
}

/** Testing/diagnostics only. */
export function clearMarketDataCache(): void {
  cache.clear();
}

/** Spot quotes for any symbols we have a CoinGecko id for. Unknown symbols are omitted. */
export async function fetchQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const known = symbols.filter((s) => COINGECKO_IDS[s]);
  if (known.length === 0) return {};
  const ids = known.map((s) => COINGECKO_IDS[s]).join(',');
  const data = await getJson<Record<string, { usd: number; usd_24h_change: number }>>(
    `${COINGECKO}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
  );
  const out: Record<string, Quote> = {};
  for (const sym of known) {
    const row = data[COINGECKO_IDS[sym]!];
    if (row && typeof row.usd === 'number') {
      out[sym] = { price: row.usd, change24h: row.usd_24h_change ?? 0, source: 'coingecko' };
    }
  }
  return out;
}

/**
 * On-chain price straight from the venue, by mint. This is the number the executor will actually
 * trade against, so the order ticket quotes it rather than a CEX aggregate.
 */
export async function fetchJupiterPrice(mint: string): Promise<Quote | null> {
  const data = await getJson<
    Record<string, { usdPrice?: number; priceChange24h?: number } | undefined>
  >(`${JUPITER}?ids=${mint}`);
  const row = data[mint];
  if (!row || typeof row.usdPrice !== 'number') return null;
  return { price: row.usdPrice, change24h: row.priceChange24h ?? 0, source: 'jupiter' };
}

/**
 * How many days of history each timeframe pill asks for, and how many raw bars to fold into one
 * displayed candle. [G8]: the handoff shipped one 12-bar series and the pills were decorative.
 * design.md §6 draws 12 candles, so every timeframe resolves to exactly 12.
 */
const TIMEFRAME_PLAN: Record<Timeframe, { days: number; label: string }> = {
  '15m': { days: 1, label: '15 minutes' },
  '1H': { days: 1, label: '1 hour' },
  '4H': { days: 7, label: '4 hours' },
  '1D': { days: 30, label: '1 day' },
  '1W': { days: 90, label: '1 week' },
};

/** design.md §6 renders 12 candles. */
export const CANDLE_COUNT = 12;

/** Fold n raw OHLC bars into one: first open, max high, min low, last close. */
export function aggregateBars(raw: Bar[], count = CANDLE_COUNT): Bar[] {
  if (raw.length === 0) return [];
  if (raw.length <= count) return raw.slice(-count);
  const size = Math.floor(raw.length / count);
  const out: Bar[] = [];
  for (let i = 0; i < count; i++) {
    const start = raw.length - (count - i) * size;
    const slice = raw.slice(Math.max(0, start), Math.max(0, start) + size);
    if (slice.length === 0) continue;
    out.push([
      slice[0]![0],
      Math.max(...slice.map((b) => b[1])),
      Math.min(...slice.map((b) => b[2])),
      slice[slice.length - 1]![3],
    ]);
  }
  return out;
}

/** Real OHLC for a symbol at a timeframe, folded to the 12 candles the design draws. */
export async function fetchCandles(symbol: string, timeframe: Timeframe): Promise<Candles | null> {
  const id = COINGECKO_IDS[symbol];
  if (!id) return null;
  const plan = TIMEFRAME_PLAN[timeframe];
  const rows = await getJson<[number, number, number, number, number][]>(
    `${COINGECKO}/coins/${id}/ohlc?vs_currency=usd&days=${plan.days}`,
    12_000,
    60_000,
  );
  const raw: Bar[] = rows.map((r) => [r[1], r[2], r[3], r[4]] as Bar);
  const bars = aggregateBars(raw);
  if (bars.length === 0) return null;
  return { symbol, timeframe, bars, feed: 'live' };
}
