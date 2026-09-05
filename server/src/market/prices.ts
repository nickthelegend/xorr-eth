/**
 * Prices for the executor. The same real source the app uses (CoinGecko), so a quote shown to the
 * user and a fill recorded by the executor come from the same place.
 */
import { getJson, staleValue } from '../http/get.js';

const COINGECKO = 'https://api.coingecko.com/api/v3';

const IDS: Record<string, string> = {
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

/** A price this old is still better than a missed scheduled buy. */
const STALE_TOLERANCE_MS = 10 * 60_000;

export async function priceOf(symbol: string): Promise<number> {
  const id = IDS[symbol];
  if (!id) throw new Error(`No price feed for ${symbol}`);
  const url = `${COINGECKO}/simple/price?ids=${id}&vs_currencies=usd`;

  let json: Record<string, { usd?: number }>;
  try {
    json = await getJson<Record<string, { usd?: number }>>(url, 30_000);
  } catch (e) {
    // Every retry failed. Fall back to the last good value within a bounded window, rather than
    // dropping a scheduled buy because a public price tier was busy.
    const stale = staleValue<Record<string, { usd?: number }>>(url, STALE_TOLERANCE_MS);
    if (!stale) throw e;
    json = stale;
  }
  const price = json[id]?.usd;
  if (typeof price !== 'number') throw new Error(`No price returned for ${symbol}`);
  return price;
}

export function knownSymbols(): string[] {
  return Object.keys(IDS);
}
