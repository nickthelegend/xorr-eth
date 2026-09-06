/**
 * The one place a symbol is mapped to a price feed.
 *
 * This used to be duplicated in three files (client marketData, server prices, backtest engine);
 * they drifted, so a symbol could be tradable on one side and unpriceable on the other.
 */
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
  /*
   * Gold, priced as gold.
   *
   * The contract screen used to map XAUT to BITCOIN to get a number out of a feed that had
   * no entry for it — so it read "XAUT/USDT $79,900" while gold traded near $4,400. Nothing
   * about Bitcoin's price, funding or open interest says anything about gold, and a "proxy
   * feed" label does not make another asset's number true. Both of these are one-ounce
   * gold-backed tokens and both have their own feed.
   */
  XAUT: 'tether-gold',
  PAXG: 'pax-gold',
  // Base-native assets the delegation actually trades.
  WETH: 'weth',
  USDC: 'usd-coin',
  CBBTC: 'coinbase-wrapped-btc',
};

export function knownSymbols(): string[] {
  return Object.keys(COINGECKO_IDS);
}
