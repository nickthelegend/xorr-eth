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
  // Base-native assets the delegation actually trades.
  WETH: 'weth',
  USDC: 'usd-coin',
  CBBTC: 'coinbase-wrapped-btc',
};

export function knownSymbols(): string[] {
  return Object.keys(COINGECKO_IDS);
}
