/**
 * The symbols this build can actually place an order for.
 *
 * Mirrors `TOKENS` in server/src/venues/oneinch.ts, and `tradable.live.test.ts` fails if the two
 * ever drift. It exists because the market list and the tradable set are genuinely different
 * things: the app shows nine crypto instruments plus stocks, commodities and indices, and on Base
 * only a handful of those can be routed and settled. Offering a Buy on the rest would put a
 * strategy in the database that no signed transaction could ever fill.
 */
export const TRADABLE = [
  // Crypto the delegation can route on Base.
  'ETH',
  'WETH',
  'USDC',
  'CBBTC',
  // Tokenized equities. Ordinary ERC-20s to the swap path — see server/src/venues/stocks.ts.
  'NVDAc',
  'AAPLc',
  'TSLAc',
  'METAc',
  'MSFTc',
  'AMZNc',
  'GOOGLc',
  'MSTRc',
] as const;

export type TradableSymbol = (typeof TRADABLE)[number];

/**
 * What a market symbol settles into on Base.
 *
 * Buying "BTC" here means buying cbBTC, and buying "ETH" means buying WETH — the market is real,
 * and the instrument that represents it on this chain has a different ticker. Telling someone
 * "BTC is not tradable" when the app can and does buy cbBTC for them would be true in the most
 * useless way.
 */
export const SETTLES_AS: Record<string, string> = {
  BTC: 'CBBTC',
  ETH: 'WETH',
};

/** The token a market symbol actually trades as, or the symbol itself. */
export function settlementSymbol(symbol: string): string {
  const upper = symbol.toUpperCase();
  return SETTLES_AS[upper] ?? symbol;
}

/** Case-insensitive: the markets fixtures spell it `cbBTC`, the token registry `CBBTC`. */
export function isTradable(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  const settled = (SETTLES_AS[upper] ?? upper).toUpperCase();
  return (TRADABLE as readonly string[]).some((t) => t.toUpperCase() === settled);
}

/** What the default buy is when a screen has to pick one. */
export const DEFAULT_BUY: string = 'WETH';

/**
 * What the SERVER says can be settled, which is not always what this list says.
 *
 * `TRADABLE` above is a compile-time mirror of the token registry — it answers "is this a symbol we
 * know how to route". That is a different question from "can this deployment settle it", and the
 * two came apart on the tokenized equities: their addresses are real on Base, they do not function
 * on a fork of Base, and the app offered a Buy button for all eight regardless. Live price, unit
 * conversion, an enabled "Buy $250 of NVDAc", and a fill that reverts.
 *
 * So the order path asks the executor rather than a constant. `/market/tradable` now filters by
 * whether the token actually answers on the running chain.
 *
 * The pre-answer default is the static list — the same behaviour as before — because the alternative
 * is refusing trades that are perfectly fine for the second before the fetch lands. On a deployment
 * where equities do not work that leaves a brief window; the order ticket closes it by awaiting the
 * real answer rather than rendering from the default.
 */
let settleable: Set<string> | undefined;
let settleableInFlight: Promise<Set<string>> | undefined;

export async function settleableSymbols(): Promise<Set<string>> {
  if (settleable) return settleable;
  settleableInFlight ??= (async () => {
    try {
      const { api } = await import('./api');
      const rows = await api.get<{ symbol: string }[]>('/market/tradable');
      settleable = new Set(rows.map((r) => r.symbol.toUpperCase()));
      return settleable;
    } catch {
      settleableInFlight = undefined;
      // Unknown, not empty. An empty set here would refuse every trade on one failed request.
      return new Set((TRADABLE as readonly string[]).map((t) => t.toUpperCase()));
    }
  })();
  return settleableInFlight;
}

/** Testing only. */
export function resetSettleable(): void {
  settleable = undefined;
  settleableInFlight = undefined;
}

/** Can this deployment actually settle it — asked of the executor, not of a constant. */
export async function isSettleable(symbol: string): Promise<boolean> {
  const upper = symbol.toUpperCase();
  const settled = (SETTLES_AS[upper] ?? upper).toUpperCase();
  return (await settleableSymbols()).has(settled);
}
