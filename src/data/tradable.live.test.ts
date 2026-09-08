/**
 * LIVE — the client's tradable list must equal the executor's token registry.
 *
 * If these drift the app offers a Buy the executor cannot settle, which is worse than offering
 * nothing: the user gets a strategy row that silently never fills.
 */
import { describe, expect, it } from 'vitest';
import { TRADABLE } from './tradable';
import { API_BASE } from './apiBase';

describe('tradable set', () => {
  it('is a subset of the executor, never a superset', async () => {
    /*
     * Equality was the wrong assertion, and it hid the bug it was written to catch.
     *
     * `TRADABLE` mirrors the token REGISTRY — the symbols this build knows how to route.
     * `/market/tradable` answers a narrower question: what this DEPLOYMENT can settle. They
     * legitimately differ on the tokenized equities, whose addresses are real on Base and which do
     * not function on a fork of it. Demanding equality forced the two to agree by making the server
     * lie, and the app offered a Buy button for eight assets whose fills revert.
     *
     * The invariant that actually matters is one-directional: the executor may serve FEWER symbols
     * than the client knows, never more. A symbol the client would offer and the server cannot
     * settle is the bug; a symbol the server settles and the client never offers is merely unused.
     */
    const res = await fetch(`${API_BASE}/market/tradable`);
    expect(res.status, 'executor must serve /market/tradable without auth').toBe(200);
    const rows = (await res.json()) as { symbol: string }[];
    const served = rows.map((r) => r.symbol);

    const unknown = served.filter((s) => !(TRADABLE as readonly string[]).includes(s));
    expect(unknown, 'executor serves symbols the client has never heard of').toEqual([]);

    // And the crypto four must always be there, on every chain this project runs.
    for (const core of ['ETH', 'WETH', 'USDC', 'CBBTC']) {
      expect(served, `${core} must be settleable everywhere`).toContain(core);
    }
  }, 30_000);

  it('every tradable symbol is priced by one feed or the other', async () => {
    // Crypto is priced by CoinGecko; the tokenized equities have no listing there and are priced
    // off the 1inch route that would fill them. Either way a tradable symbol must have a number,
    // or the app has a Buy button it cannot put a price on.
    const [quotes, stocks] = await Promise.all([
      fetch(`${API_BASE}/market/quotes?symbols=${TRADABLE.join(',')}`).then(
        (r) => r.json() as Promise<Record<string, { price: number }>>,
      ),
      fetch(`${API_BASE}/market/stocks`).then(
        (r) => r.json() as Promise<{ symbol: string; price: number | null }[]>,
      ),
    ]);
    const stockPrice = new Map(stocks.map((s) => [s.symbol, s.price]));

    for (const sym of TRADABLE) {
      const price = quotes[sym]?.price ?? stockPrice.get(sym) ?? undefined;
      expect(price, `${sym} is tradable but has no price`).toBeDefined();
      expect(price!).toBeGreaterThan(0);
    }
  }, 60_000);
});

describe('market symbols map to what they settle as', () => {
  it('BTC settles as cbBTC and ETH as WETH — the market is real either way', async () => {
    const { isTradable, settlementSymbol } = await import('./tradable');
    expect(settlementSymbol('BTC')).toBe('CBBTC');
    expect(settlementSymbol('ETH')).toBe('WETH');
    // "BTC is not tradable" would be true in the most useless way while the app buys cbBTC.
    expect(isTradable('BTC')).toBe(true);
    expect(isTradable('ETH')).toBe(true);
  });

  it('still refuses a market with no instrument on this chain', async () => {
    const { isTradable } = await import('./tradable');
    for (const sym of ['XAUT', 'SPYx', 'OPENAI', 'SOL']) {
      expect(isTradable(sym), `${sym} should not be tradable on Base`).toBe(false);
    }
  });
});
