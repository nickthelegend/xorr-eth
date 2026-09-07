/**
 * Tokenized equities on Base.
 *
 * The design handoff listed nine stocks with an `x` suffix as a placeholder for "tokenized". They
 * are real: Ondo Global Markets issues them on Base under the `0xb2000…` vanity prefix with a `c`
 * suffix, and 1inch routes USDC into every one of them. So a "Buy $250 of NVDA" in this app is a
 * real swap into a real token that tracks a real share — not a paper position in a database.
 *
 * Every address here was resolved from the 1inch Base token list and confirmed routable with a
 * live quote; `stocks.live.test.ts` re-confirms that, so a delisting fails the suite rather than
 * silently turning a Buy button into a dead end.
 */
import type { Address } from 'viem';

export type StockToken = {
  /** The on-chain symbol. What the app shows, so the screen matches the block explorer. */
  symbol: string;
  /** The underlying listed company. */
  name: string;
  address: Address;
  decimals: number;
};

export const STOCKS: Record<string, StockToken> = {
  NVDAc: {
    symbol: 'NVDAc',
    name: 'NVIDIA Corporation',
    address: '0xb20000000000000000000078ee7ce2fE4908108C',
    decimals: 8,
  },
  AAPLc: {
    symbol: 'AAPLc',
    name: 'Apple Inc.',
    address: '0xb200000000000000000000C2e324d24d7eEcd1fb',
    decimals: 8,
  },
  TSLAc: {
    symbol: 'TSLAc',
    name: 'Tesla Inc.',
    address: '0xb2000000000000000000001e800a7f5189430cD0',
    decimals: 8,
  },
  METAc: {
    symbol: 'METAc',
    name: 'Meta Platforms Inc.',
    address: '0xb2000000000000000000008bC8786B856E61707C',
    decimals: 8,
  },
  MSFTc: {
    symbol: 'MSFTc',
    name: 'Microsoft Corporation',
    address: '0xB200000000000000000000Ab99cFa739E253872B',
    decimals: 8,
  },
  AMZNc: {
    symbol: 'AMZNc',
    name: 'Amazon.com Inc.',
    address: '0xb200000000000000000000d9192b6B456483C2E8',
    decimals: 8,
  },
  GOOGLc: {
    symbol: 'GOOGLc',
    name: 'Alphabet Inc.',
    address: '0xb2000000000000000000002D0BA3164cc74f58B7',
    decimals: 8,
  },
  MSTRc: {
    symbol: 'MSTRc',
    name: 'MicroStrategy Inc.',
    address: '0xb2000000000000000000004884b426556b92883d',
    decimals: 8,
  },
};

export function isStock(symbol: string): boolean {
  return symbol in STOCKS;
}

/**
 * What a tokenized equity is worth, from the venue that would actually fill it.
 *
 * There is no CoinGecko feed for these and the NYSE print would be the wrong number anyway: what a
 * user pays is what 1inch routes on Base right now. So the price is derived from a real quote —
 * swap a fixed amount of USDC in, see how many tokens come out.
 *
 * This lived inside the `/market/stocks` route handler, which meant the SERVER could not price an
 * equity for itself. `priceOf` keys into CoinGecko's id table and threw `No price feed for NVDAc`,
 * so the executor could not size, cap-check or record any equity trade — found by running tier 7,
 * whose entire remit is equities, and watching its first real entry fail. The UI had the number all
 * along; the executor could not reach it.
 */
import { quote } from './oneinch.js';

/** Big enough that the route is representative, small enough not to move the pool it is measuring. */
const PROBE_USD = 1_000;

const cache = new Map<string, { at: number; price: number }>();
const TTL_MS = 30_000;

/** Testing only — the 30s cache otherwise carries one case's price into the next. */
export function clearStockPriceCache(): void {
  cache.clear();
}

export async function stockPriceUsd(symbol: string): Promise<number | null> {
  if (!isStock(symbol)) return null;
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.price;

  const q = await quote({ inSymbol: 'USDC', outSymbol: symbol, amount: PROBE_USD }).catch(() => null);
  if (!q || !(q.outAmount > 0)) return null;
  const price = PROBE_USD / q.outAmount;
  cache.set(symbol, { at: Date.now(), price });
  return price;
}
