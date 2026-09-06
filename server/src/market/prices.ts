/**
 * Prices for the executor. The same real source the app uses (CoinGecko), so a quote shown to the
 * user and a fill recorded by the executor come from the same place.
 */
import { getJson, staleValue } from '../http/get.js';
import { COINGECKO_IDS, COINGECKO_PRICE_URL, type CoingeckoPrices } from './ids.js';

const IDS = COINGECKO_IDS;

/** A price this old is still better than a missed scheduled buy. */
const STALE_TOLERANCE_MS = 10 * 60_000;

/**
 * One URL for every symbol, so a price is a cache hit rather than a queue slot.
 *
 * Asking per symbol meant each one was its own URL, its own cache entry and its own trip through
 * the rate limiter — the leaderboard prices a handful of symbols and took over thirty seconds from
 * cold.
 *
 * It now comes from `ids.ts`, and it is the same string `/market/quotes` uses — see the note
 * there for why having two of them cost the executor 8.4s a price.
 */
const ALL_IDS_URL = COINGECKO_PRICE_URL;

/**
 * @param deadlineMs How long the CALLER is willing to wait.
 *
 * The executor should wait: a scheduled buy that gives up because a price tier was busy is a
 * missed buy. A screen should not: the leaderboard blocked for sixty seconds on a cold cache while
 * the user looked at a spinner. Same function, different patience, stated at the call site.
 */
export async function priceOf(symbol: string, deadlineMs?: number): Promise<number> {
  const id = IDS[symbol];
  if (!id) throw new Error(`No price feed for ${symbol}`);
  const url = ALL_IDS_URL;

  // A value already in hand beats waiting, whatever the caller's patience.
  const warm = staleValue<CoingeckoPrices>(url, 30_000);
  if (warm?.[id]?.usd !== undefined) return warm[id]!.usd!;

  let json: CoingeckoPrices;
  // Cleared in `finally`. An uncleared reject-timer holds the event loop for the whole deadline
  // after the fetch has already won the race, which is a live handle per price call.
  let timer: NodeJS.Timeout | undefined;
  try {
    const fetching = getJson<CoingeckoPrices>(url, 30_000);
    // Let a raced-past fetch finish in the background so the next caller is instant. Attached
    // before the race, not after: if the deadline wins we never reach the line after `await`.
    if (deadlineMs) void fetching.catch(() => undefined);
    json = deadlineMs
      ? await Promise.race([
          fetching,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`price deadline for ${symbol}`)), deadlineMs);
          }),
        ])
      : await fetching;
  } catch (e) {
    // Every retry failed. Fall back to the last good value within a bounded window, rather than
    // dropping a scheduled buy because a public price tier was busy.
    const stale = staleValue<CoingeckoPrices>(url, STALE_TOLERANCE_MS);
    if (!stale) throw e;
    json = stale;
  } finally {
    clearTimeout(timer);
  }
  const price = json[id]?.usd;
  if (typeof price !== 'number') throw new Error(`No price returned for ${symbol}`);
  return price;
}

export function knownSymbols(): string[] {
  return Object.keys(IDS);
}
