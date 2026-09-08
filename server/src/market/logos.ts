/**
 * Real logos for every market the app lists.
 *
 * The asset marks were radial gradients keyed off the symbol — pretty, and they told you nothing.
 * Nine crypto rows that differ only in hue is a list you have to read rather than scan, and on the
 * Stocks tab it is worse: eight tokenized equities whose entire point is that they represent real
 * companies, drawn as anonymous coloured circles.
 *
 * Two real sources, chosen because each is authoritative for what it covers:
 *
 *   - **1inch Token API** (`/token/v1.2/8453/custom/:address`) for anything with a Base address —
 *     WETH, USDC, cbBTC and all eight equities. It answers with the token's own `logoURI`, which
 *     for NVDAc is an SVG 1inch serves and a `name` of "NVIDIA Corporation". This is the token
 *     registry the aggregator itself routes against, so it is the right authority for a token's
 *     identity, and it is the only source that knows the equities at all.
 *   - **CoinGecko** for everything priced by a feed rather than held on Base — BTC, SOL, XRP,
 *     DOGE, HYPE, AAVE, LINK, TON, and the gold pair.
 *
 * A symbol neither source knows — the commodities, the indices, the pre-IPO names — gets no logo,
 * and the client keeps the gradient mark for it. That is the honest outcome: an invented logo for
 * an instrument nobody issues would be exactly the fabricated-identity problem the gradients were
 * innocent of.
 *
 * Resolved once and held for the process lifetime. Logos do not move, both upstreams are rate
 * limited, and the market list asks for all of them at once.
 */
import { getJson } from '../http/get.js';
import { COINGECKO_IDS } from './ids.js';
import { TOKENS } from '../venues/oneinch.js';
import { ONEINCH_CHAIN_ID } from '../evm/chains.js';

const ONEINCH_TOKEN_API = 'https://api.1inch.dev/token/v1.2';
const COINGECKO_COIN = 'https://api.coingecko.com/api/v3/coins';

/** Long, because a logo that resolved once is not going to change under us. */
const TIMEOUT_MS = 12_000;

export type Logo = {
  /** Absolute URL to a PNG or SVG, or null where neither source knows this symbol. */
  url: string | null;
  /** Which upstream answered. Rendered nowhere; it is here so `/verify` can say. */
  source: '1inch' | 'coingecko' | null;
};

const cache = new Map<string, Logo>();
const inflight = new Map<string, Promise<Logo>>();

const NONE: Logo = { url: null, source: null };

/** The token registry the aggregator routes against — and the only source that knows the equities. */
async function fromOneInch(symbol: string): Promise<Logo | undefined> {
  const token = TOKENS[symbol];
  if (!token) return undefined;
  const key = process.env.ONEINCH_API_KEY;
  if (!key) return undefined;
  try {
    const res = await getJson<{ logoURI?: string }>(
      `${ONEINCH_TOKEN_API}/${ONEINCH_CHAIN_ID}/custom/${token.address}`,
      TIMEOUT_MS,
      TIMEOUT_MS,
      { Authorization: `Bearer ${key}` },
    );
    return res.logoURI ? { url: res.logoURI, source: '1inch' } : undefined;
  } catch {
    // An upstream that will not answer is not evidence the token has no logo, so this falls
    // through to the next source rather than caching a null.
    return undefined;
  }
}

/** Everything priced by a feed rather than held on Base. */
async function fromCoingecko(symbol: string): Promise<Logo | undefined> {
  const id = COINGECKO_IDS[symbol];
  if (!id) return undefined;
  try {
    const res = await getJson<{ image?: { small?: string; thumb?: string } }>(
      `${COINGECKO_COIN}/${id}?localization=false&tickers=false&market_data=false` +
        '&community_data=false&developer_data=false&sparkline=false',
      TIMEOUT_MS,
      TIMEOUT_MS,
    );
    const url = res.image?.small ?? res.image?.thumb;
    return url ? { url, source: 'coingecko' } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The logo for one symbol.
 *
 * 1inch first: where a symbol has a Base address, the token that trades IS the thing on screen,
 * and the equities exist nowhere else.
 */
export async function logoFor(symbol: string): Promise<Logo> {
  const hit = cache.get(symbol);
  if (hit) return hit;

  const pending = inflight.get(symbol);
  if (pending) return pending;

  const run = (async (): Promise<Logo> => {
    try {
      const found = (await fromOneInch(symbol)) ?? (await fromCoingecko(symbol)) ?? NONE;
      // Cache a miss too. Most of the commodity and index names will never resolve, and asking
      // two rate-limited upstreams again on every market list render for a permanent "no" is how
      // a decoration becomes an outage.
      cache.set(symbol, found);
      return found;
    } finally {
      inflight.delete(symbol);
    }
  })();
  inflight.set(symbol, run);
  return run;
}

/** Every requested symbol, resolved in parallel. Unknown ones come back with a null url. */
export async function logosFor(symbols: readonly string[]): Promise<Record<string, Logo>> {
  const unique = [...new Set(symbols)];
  const resolved = await Promise.all(unique.map(async (s) => [s, await logoFor(s)] as const));
  return Object.fromEntries(resolved);
}

/** Testing only. */
export function resetLogoCache(): void {
  cache.clear();
  inflight.clear();
}
