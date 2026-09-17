/**
 * GET /market/xstocks, through the route.
 *
 * `venues/xstocks-catalog.test.ts` pins how a row is built. This pins the envelope around it: the
 * sectors the filter is offered, the count of what could not be priced, and — the part that would
 * silently break the screen — that a catalog nothing would price is still a 200 with every row in
 * it, not an error and not a short list.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

const h = vi.hoisted(() => ({ getJson: vi.fn(), staleValue: vi.fn() }));

vi.mock('../http/get.js', () => ({ getJson: h.getJson, staleValue: h.staleValue }));

const NVDAX = 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh';
const SPYX = 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W';

async function call(): Promise<{ status: number; body: any }> {
  const { xstockRoutes } = await import('./xstocks.js');
  const app = new Hono().route('/', xstockRoutes);
  const res = await app.request('/market/xstocks');
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.resetModules();
  h.getJson.mockReset();
  h.staleValue.mockReset().mockReturnValue(undefined);
});

describe('with prices', () => {
  beforeEach(() => {
    h.getJson.mockResolvedValue({
      [NVDAX]: { usdPrice: 215.92, priceChange24h: 1.08, stockData: { price: 215.68 } },
      [SPYX]: { usdPrice: 759.95, priceChange24h: 0.31 },
    });
  });

  it('returns every catalogued mint, priced or not', async () => {
    const { status, body } = await call();
    const { XSTOCKS } = await import('../venues/xstocks.js');

    expect(status).toBe(200);
    expect(body.rows).toHaveLength(Object.keys(XSTOCKS).length);
    expect(body.rows.find((r: any) => r.symbol === 'NVDAx').price).toBeCloseTo(215.92, 2);
  });

  it('counts what it could not price', async () => {
    const { body } = await call();
    const { XSTOCKS } = await import('../venues/xstocks.js');

    // Two of eleven answered, so nine did not, and the screen is told rather than made to count.
    expect(body.unpriced).toBe(Object.keys(XSTOCKS).length - 2);
    expect(body.rows.filter((r: any) => r.feed === 'unavailable')).toHaveLength(body.unpriced);
  });

  it('publishes the sectors the filter offers, the ETF bucket last', async () => {
    const { body } = await call();

    expect(body.sectors).toContain('Technology');
    expect(body.sectors.at(-1)).toBe('Index funds');
    // Derived from the tokens: no sector is offered that nothing is filed under.
    const used = new Set(body.rows.map((r: any) => r.sector));
    for (const s of body.sectors) expect(used.has(s)).toBe(true);
  });
});

describe('with no prices at all', () => {
  it('is still a full catalog and still a 200', async () => {
    h.getJson.mockRejectedValue(new Error('ENOTFOUND lite-api.jup.ag'));

    const { status, body } = await call();
    const { XSTOCKS } = await import('../venues/xstocks.js');

    /*
     * The screen renders this. An error here would put a retry button where the answer belongs —
     * and the answer, on a cluster whose mints this feed does not know, is that these exist and
     * cannot be priced. That is information, not a failure.
     */
    expect(status).toBe(200);
    expect(body.rows).toHaveLength(Object.keys(XSTOCKS).length);
    expect(body.unpriced).toBe(body.rows.length);
    expect(body.rows.every((r: any) => r.price === null)).toBe(true);
    // The facts about each listing are not market data and survive the outage.
    expect(body.rows.every((r: any) => r.name && r.sector && r.address)).toBe(true);
  });
});
