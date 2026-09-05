/**
 * The symbols this build can actually place an order for.
 *
 * Mirrors `TOKENS` in server/src/venues/oneinch.ts, and `tradable.live.test.ts` fails if the two
 * ever drift. It exists because the market list and the tradable set are genuinely different
 * things: the app shows nine crypto instruments plus stocks, commodities and indices, and on Base
 * only a handful of those can be routed and settled. Offering a Buy on the rest would put a
 * strategy in the database that no signed transaction could ever fill.
 */
export const TRADABLE = ['ETH', 'WETH', 'USDC', 'CBBTC'] as const;

export type TradableSymbol = (typeof TRADABLE)[number];

/** Case-insensitive: the markets fixtures spell it `cbBTC`, the token registry `CBBTC`. */
export function isTradable(symbol: string): boolean {
  return (TRADABLE as readonly string[]).includes(symbol.toUpperCase());
}

/** What the default buy is when a screen has to pick one. */
export const DEFAULT_BUY: string = 'WETH';
