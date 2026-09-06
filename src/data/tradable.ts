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
