/**
 * The strategy routes over HTTP (docs/qa/ENDPOINTS.md E169), with the database, the chain and the executor stood in for.
 */
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ one: vi.fn(), query: vi.fn() }));
vi.mock('../audit/log.js', () => ({ append: vi.fn(async () => undefined) }));
vi.mock('../auth/privy.js', () => ({
  UnauthorizedError: class extends Error {
    readonly status = 401;
  },
  verifyToken: vi.fn(),
}));
vi.mock('../executor/run.js', () => ({
  runStrategy: vi.fn(),
  CLOSE_ONLY_KINDS: new Set(['exit-rules']),
  EXECUTABLE_KINDS: new Set(['dca', 'momentum', 'exit-rules', 'rebalance', 'yield-rotation']),
  SELF_SIZING_KINDS: new Set(['exit-rules', 'rebalance']),
}));
vi.mock('../evm/delegation.js', () => ({ readPolicy: vi.fn() }));
vi.mock('../executor/order.js', () => ({ placeOrder: vi.fn() }));
vi.mock('../executor/swap.js', () => ({ placeSwap: vi.fn() }));
vi.mock('./wallet-context.js', () => ({
  currentWallet: vi.fn(),
  requireWallet: vi.fn(),
  NoWalletError: class extends Error {},
}));
vi.mock('../venues/stocks.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../venues/stocks.js')>()),
  equitiesFunctional: vi.fn(async () => true),
}));

const { query } = await import('../db/index.js');
const { currentWallet } = await import('./wallet-context.js');
const { strategyRoutes } = await import('./strategies.js');
const { errorResponse } = await import('../http/errors.js');

const app = new Hono();
app.onError(errorResponse);
app.route('/', strategyRoutes);

const WALLET = { id: 'wallet-1', address: '0x95A0b368588713011a15f4b1041423f31B08e615' };

async function call(path: string): Promise<{ status: number; body: unknown }> {
  const res = await app.request(path);
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(currentWallet).mockResolvedValue(WALLET as never);
  vi.mocked(query).mockResolvedValue([]);
});

describe('GET /runs', () => {
  it('refuses a limit that is not a number, by name and before reading anything', async () => {
    const r = await call('/runs?limit=abc');
    expect(r).toMatchObject({ status: 400, body: { error: 'bad_limit', detail: expect.stringContaining('200') } });
    expect(query).not.toHaveBeenCalled();
  });

  it('holds the limit to a whole number of runs from 1 to 200', async () => {
    for (const [path, limit] of [
      ['/runs', 100],
      ['/runs?limit=1.5', 1],
      ['/runs?limit=0', 1],
      ['/runs?limit=5000', 200],
    ] as const) {
      vi.mocked(query).mockClear();
      expect((await call(path)).status, path).toBe(200);
      expect(vi.mocked(query).mock.calls[0]![1], path).toEqual(['wallet-1', limit]);
    }
  });
});
