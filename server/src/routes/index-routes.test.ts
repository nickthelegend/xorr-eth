/**
 * Routes from `routes/index.ts` (docs/qa/ENDPOINTS.md E150), driven over HTTP with the database, the chain, the price
 * feed and the session stood in for.
 */
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.XORR_CHAIN ??= 'base-sepolia';

vi.mock('../db/index.js', () => ({ one: vi.fn(), query: vi.fn(), tx: vi.fn(), pool: { query: vi.fn() } }));
vi.mock('../evm/client.js', () => ({
  publicClient: {},
  walletClient: {},
  delegateAccount: { address: '0xC38f38f45463f77bD823FebE16b15714Eb98c8A5' },
  KEY_DIRECTORY: '/nonexistent',
}));
vi.mock('../auth/privy.js', () => ({
  UnauthorizedError: class extends Error {
    readonly status = 401;
  },
  verifyToken: vi.fn(),
  freshWallets: vi.fn(),
}));
vi.mock('./wallet-context.js', () => ({
  currentWallet: vi.fn(),
  requireWallet: vi.fn(),
  NoWalletError: class extends Error {},
}));
vi.mock('../market/prices.js', () => ({ priceOf: vi.fn() }));

const { priceOf } = await import('../market/prices.js');
const { routes } = await import('./index.js');
const { errorResponse } = await import('../http/errors.js');

const app = new Hono();
app.onError(errorResponse);
app.route('/', routes);

type Answer = { status: number; body: Record<string, unknown> };

async function call(path: string): Promise<Answer> {
  const res = await app.request(path);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /price/:symbol', () => {
  it('answers a symbol nothing prices with a named 404, and asks no feed', async () => {
    const r = await call('/price/NOPE');
    expect(r).toMatchObject({ status: 404, body: { error: 'no_feed', detail: expect.stringContaining('NOPE') } });
    expect(priceOf).not.toHaveBeenCalled();
  });

  it('prices a feed symbol and an equity, under the registry spelling and the source that priced it', async () => {
    vi.mocked(priceOf).mockResolvedValueOnce(64_000);
    expect(await call('/price/BTC')).toMatchObject({ status: 200, body: { symbol: 'BTC', price: 64_000, source: 'coingecko' } });
    vi.mocked(priceOf).mockResolvedValueOnce(181.5);
    expect(await call('/price/nvdac')).toMatchObject({ status: 200, body: { symbol: 'NVDAc', price: 181.5, source: '1inch' } });
  });

  it('keeps a feed that failed a 502, worth retrying, with a code rather than the upstream’s own words', async () => {
    vi.mocked(priceOf).mockRejectedValueOnce(new Error('429 after 5 attempts: https://api.coingecko.com/api/v3/simple/price'));
    const r = await call('/price/ETH');
    expect(r).toMatchObject({ status: 502, body: { error: 'price_unavailable' } });
    expect(JSON.stringify(r.body)).not.toContain('coingecko.com');
  });
});
