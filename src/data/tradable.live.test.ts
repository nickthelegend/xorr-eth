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
  it('matches the executor exactly', async () => {
    const res = await fetch(`${API_BASE}/market/tradable`);
    expect(res.status, 'executor must serve /market/tradable without auth').toBe(200);
    const rows = (await res.json()) as { symbol: string }[];
    expect([...rows.map((r) => r.symbol)].sort()).toEqual([...TRADABLE].sort());
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
