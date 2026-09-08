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

/**
 * Case-insensitively, because the suffix is the whole point and callers lose it.
 *
 * `symbol in STOCKS` missed `NVDAC` — and `/price/:symbol` uppercases its parameter, so every
 * equity price request answered "No price feed for NVDAC" for an asset the app lists on its own
 * markets screen. Same family as the `canonicalSymbol` fix: the lowercase `c` marks the tokenized
 * form, and anything that normalises it away is asking about a company that has no token.
 */
export function stockKey(symbol: string): string | undefined {
  const want = symbol.trim().toUpperCase();
  return Object.keys(STOCKS).find((k) => k.toUpperCase() === want);
}

export function isStock(symbol: string): boolean {
  return stockKey(symbol) !== undefined;
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
import { query } from '../db/index.js';

/** Big enough that the route is representative, small enough not to move the pool it is measuring. */
const PROBE_USD = 1_000;

const cache = new Map<string, { at: number; price: number }>();
const TTL_MS = 30_000;

/** Testing only — the 30s cache otherwise carries one case's price into the next. */
export function clearStockPriceCache(): void {
  cache.clear();
}

export async function stockPriceUsd(symbol: string): Promise<number | null> {
  // Resolve to the registry's own spelling first — the venue is asked with the symbol it knows.
  const key = stockKey(symbol);
  if (!key) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.price;

  /*
   * `skipPriceImpact` is load-bearing, not an optimisation.
   *
   * Price impact is measured against a mid from `priceOf`, and for an equity `priceOf` comes back
   * here. That cycle took the deployed executor to a 2GB heap and a fatal OOM fifty seconds after
   * boot. It is also meaningless here: this call is establishing what the price is.
   */
  const q = await quote({
    inSymbol: 'USDC',
    outSymbol: key,
    amount: PROBE_USD,
    skipPriceImpact: true,
  }).catch(() => null);
  if (!q || !(q.outAmount > 0)) return null;
  const price = PROBE_USD / q.outAmount;
  cache.set(key, { at: Date.now(), price });
  // Every fresh reading is a data point these assets have no other way of getting.
  recordObservation(key, price);
  return price;
}

/**
 * Record what we saw, so these assets can eventually have a shape.
 *
 * The tokenized equities have no CoinGecko series and no free candle source anywhere: the price is
 * derived from a live 1inch route, which is a spot reading. The asset screen therefore says "no
 * price history for this market" and shows a number with nothing around it — honest, and not much
 * use for deciding anything.
 *
 * Our own observations are the one real source available. `stockPriceUsd` already computes a price
 * from a real route; writing it down, timestamped, builds a genuine series. Short at first, and
 * true from the first row. It cannot reconstruct the past and does not pretend to: the chart starts
 * when we started watching, and the screen says so.
 *
 * Fire-and-forget on purpose. A price read must never fail because a write failed — the number is
 * what the caller asked for, and the history is a side effect.
 */
export function recordObservation(symbol: string, usd: number): void {
  if (!(usd > 0)) return;
  void query(`INSERT INTO price_observations (symbol, usd) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    symbol,
    usd,
  ]).catch(() => undefined);
}

/** The series we have actually seen, oldest first. Empty until something has looked. */
export async function observedHistory(
  symbol: string,
  hours = 24 * 30,
): Promise<{ at: number; usd: number }[]> {
  const key = stockKey(symbol);
  if (!key) return [];
  const rows = await query<{ at: Date; usd: string }>(
    `SELECT at, usd FROM price_observations
      WHERE symbol = $1 AND at > now() - ($2 || ' hours')::interval
      ORDER BY at ASC`,
    [key, String(hours)],
  ).catch(() => []);
  return rows.map((r) => ({ at: new Date(r.at).getTime(), usd: Number(r.usd) }));
}

/**
 * Do the tokenized equities actually WORK on the chain this executor is pointed at?
 *
 * They are listed in `STOCKS` because the addresses are real on Base. That is not the same question
 * as whether they can be traded here, and conflating the two produced the worst kind of bug this
 * codebase can have: `/market/tradable` returned all eight on a fork, so `isTradable('NVDAc')` was
 * true, so `/order/NVDAc` rendered a complete ticket — live price, unit conversion, an enabled
 * "Buy $250 of NVDAc" — and the fill reverted `TF`. The app made a confident offer it could not
 * honour.
 *
 * The test is the same one `/verify` uses, and it is a call rather than a code-length check for the
 * reason recorded there: these tokens carry a single byte of code and answer anyway on real Base,
 * while on an anvil fork of the same block the same call reverts. `eth_getCode` cannot tell those
 * apart; `totalSupply()` can.
 *
 * Cached for the process lifetime rather than by a timer. A chain does not stop serving a token
 * halfway through a deployment's life, and re-asking on every request would put an RPC round trip
 * in front of a route the market list calls on mount.
 */
let functional: Promise<boolean> | undefined;

export function equitiesFunctional(): Promise<boolean> {
  functional ??= (async () => {
    const probe = Object.values(STOCKS)[0];
    if (!probe) return false;
    try {
      const { publicClient } = await import('../evm/client.js');
      const { erc20Abi } = await import('viem');
      const supply = await publicClient.readContract({
        address: probe.address,
        abi: erc20Abi,
        functionName: 'totalSupply',
      });
      return supply > 0n;
    } catch {
      // A token that will not answer is a token that cannot be traded. Same answer either way.
      return false;
    }
  })();
  return functional;
}

/** Testing only — the process-lifetime cache would otherwise carry one case into the next. */
export function resetEquitiesFunctional(): void {
  functional = undefined;
}
