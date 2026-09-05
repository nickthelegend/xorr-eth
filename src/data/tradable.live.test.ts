/**
 * LIVE — the client's tradable list must equal the executor's token registry.
 *
 * If these drift the app offers a Buy the executor cannot settle, which is worse than offering
 * nothing: the user gets a strategy row that silently never fills.
 */
import { describe, expect, it } from 'vitest';
import { TRADABLE } from './tradable';
import { API_BASE } from './api';

describe('tradable set', () => {
  it('matches the executor exactly', async () => {
    const res = await fetch(`${API_BASE}/market/tradable`);
    expect(res.status, 'executor must serve /market/tradable without auth').toBe(200);
    const rows = (await res.json()) as { symbol: string }[];
    expect([...rows.map((r) => r.symbol)].sort()).toEqual([...TRADABLE].sort());
  }, 30_000);

  it('every tradable symbol also has a price feed', async () => {
    const res = await fetch(`${API_BASE}/market/quotes?symbols=${TRADABLE.join(',')}`);
    const quotes = (await res.json()) as Record<string, { price: number }>;
    // ETH and WETH share a feed under different keys; both must resolve.
    for (const sym of TRADABLE) {
      expect(quotes[sym], `${sym} is tradable but has no quote`).toBeDefined();
      expect(quotes[sym]!.price).toBeGreaterThan(0);
    }
  }, 30_000);
});
