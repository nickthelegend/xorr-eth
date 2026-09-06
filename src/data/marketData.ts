/**
 * Live market data for the app — PLAN.md 12.12 / 12.14, closing part of [G22] and [G8].
 *
 * Everything here goes through the executor's public `/market/*` routes rather than straight to
 * CoinGecko. That is not indirection for its own sake: CoinGecko sends no
 * `access-control-allow-origin`, so the direct call failed the CORS preflight on web and every
 * quote and candle silently degraded to simulated. Behind the executor there is also one shared
 * rate-limit queue instead of one per open tab, and a stale-value fallback that keeps a slightly
 * old price on screen rather than a dash.
 *
 * PLAN.md §1.3 item 8: "Every price on screen is real, or labelled." Anything this module cannot
 * price comes back absent and the UI stamps a SIMULATED tag on it.
 */
import type { Bar, Candles, Timeframe } from './types';
import { API_BASE } from './apiBase';

/** The symbols with a real feed. Kept in sync with server/src/market/ids.ts, which is the source. */
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
  WETH: 'weth',
  USDC: 'usd-coin',
  CBBTC: 'coinbase-wrapped-btc',
};

export type Quote = { price: number; change24h: number; source: 'coingecko' };

/**
 * A short client-side cache on top of the server's own. Two components mounting on the same screen
 * should not produce two round trips for the same symbol list.
 */
const TTL_MS = 15_000;
/** How many times to wait out a "warming" 503 before handing the state to the screen. */
const WARMING_RETRIES = 4;

/**
 * The executor is fetching this from upstream and has not finished.
 *
 * Its own error type so a screen can say "fetching" rather than "there is nothing here" — the
 * difference between a wait and a dead end.
 */
export class StillWarming extends Error {
  constructor(path: string) {
    super(`still warming: ${path}`);
    this.name = 'StillWarming';
  }
}
const cache = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

async function getJson<T>(path: string, ttlMs = TTL_MS): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;

  const pending = inflight.get(path);
  if (pending) return pending as Promise<T>;

  const run = (async () => {
    try {
      // A 503 means the executor is still fetching this entry from the upstream, not that the
      // data does not exist. It arrives with a Retry-After, so wait it out — rendering "no chart"
      // for something a few seconds away is a worse lie than a brief spinner.
      for (let attempt = 0; attempt < WARMING_RETRIES; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15_000);
        try {
          const res = await fetch(`${API_BASE}${path}`, {
            signal: ctrl.signal,
            headers: { accept: 'application/json' },
          });
          // A 503 is always "still warming", on the last attempt as much as the first. Falling
          // through to the generic error on the final try meant the caller saw a plain Error, the
          // `instanceof StillWarming` check failed, and the screen said "no feed" for data that
          // was seconds away — the exact confusion this state exists to prevent.
          if (res.status === 503) {
            if (attempt === WARMING_RETRIES - 1) throw new StillWarming(path);
            const after = Number(res.headers.get('retry-after'));
            await new Promise((r) =>
              setTimeout(r, Number.isFinite(after) && after > 0 ? after * 1000 : 2_000),
            );
            continue;
          }
          if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
          const value = (await res.json()) as T;
          cache.set(path, { at: Date.now(), value });
          return value;
        } finally {
          clearTimeout(timer);
        }
      }
      // Unreachable: the loop either returns, throws, or continues.
      throw new StillWarming(path);
    } finally {
      inflight.delete(path);
    }
  })();
  inflight.set(path, run);
  return run;
}

/** Testing/diagnostics only. */
export function clearMarketDataCache(): void {
  cache.clear();
  inflight.clear();
}

/**
 * Spot quotes for any symbols we have a feed for. Unknown symbols are omitted.
 *
 * Throws `StillWarming` when the executor is fetching from upstream, so a caller can tell "not
 * yet" from "no feed" — the price is the number a user reads first, and labelling one that is
 * seconds away as unavailable is the more expensive of the two mistakes.
 */
export async function fetchQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const known = symbols.filter((s) => COINGECKO_IDS[s]);
  if (known.length === 0) return {};
  return getJson<Record<string, Quote>>(
    `/market/quotes?symbols=${encodeURIComponent(known.join(','))}`,
  );
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
  if (!COINGECKO_IDS[symbol]) return null;
  const plan = TIMEFRAME_PLAN[timeframe];
  const { rows } = await getJson<{ rows: [number, number, number, number, number][] }>(
    `/market/ohlc?symbol=${encodeURIComponent(symbol)}&days=${plan.days}`,
    60_000,
  );
  const raw: Bar[] = rows.map((r) => [r[1], r[2], r[3], r[4]] as Bar);
  const bars = aggregateBars(raw);
  if (bars.length === 0) return null;
  return { symbol, timeframe, bars, feed: 'live' };
}

export type StockQuote = {
  symbol: string;
  name: string;
  address: string;
  /** USD per share, derived from a real 1inch route. Null when nothing routes right now. */
  price: number | null;
  venues: string[];
  feed: 'live' | 'simulated';
};

/**
 * Tokenized equities, priced off the venue that would fill the trade.
 *
 * These have no CoinGecko feed, and the NYSE print would be the wrong number anyway: what a user
 * pays is what 1inch routes on Base. The executor derives the price from a real quote.
 */
export async function fetchStockQuotes(): Promise<Record<string, StockQuote>> {
  const rows = await getJson<StockQuote[]>('/market/stocks', 30_000);
  return Object.fromEntries(rows.map((r) => [r.symbol, r]));
}
