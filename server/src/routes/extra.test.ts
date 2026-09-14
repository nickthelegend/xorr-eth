/**
 * The backtest, quote, comparison and decision routes, asked badly (docs/qa/ENDPOINTS.md E026, E083, E166, E183, E188).
 *
 * Each of these is a request only the caller can fix, so each is a named 400 or 404 given before any venue, feed or
 * index is asked: never a 502 that tells the app to retry an impossible request, and never a 200 carrying a result
 * nobody computed. These drive the real routes with every upstream stood in for.
 */
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ one: vi.fn(), query: vi.fn(), tx: vi.fn() }));
vi.mock('../audit/log.js', () => ({ append: vi.fn(async () => undefined) }));
vi.mock('../backtest/engine.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../backtest/engine.js')>()),
  backtestDca: vi.fn(),
  backtestGrid: vi.fn(),
  backtestMomentum: vi.fn(),
}));
vi.mock('../agents/leaderboard.js', () => ({ leaderboard: vi.fn() }));
vi.mock('../bot/llm.js', () => ({ speak: vi.fn() }));
vi.mock('../bot/tone.js', () => ({ TONE_INSTRUCTIONS: {} }));
vi.mock('../news/feed.js', () => ({ briefing: vi.fn() }));
vi.mock('../bot/propose.js', () => ({ propose: vi.fn() }));
vi.mock('../notifications/push.js', () => ({ send: vi.fn() }));
// The registry and its spelling rule are real; only the venue call is stood in for.
vi.mock('../venues/oneinch.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../venues/oneinch.js')>()),
  quote: vi.fn(),
}));
vi.mock('../evm/gas-price.js', () => ({ networkCost: vi.fn() }));
vi.mock('../executor/fill-measure.js', () => ({ estimateOutUnits: vi.fn() }));
vi.mock('../venues/compare.js', () => ({ compareVenues: vi.fn() }));
vi.mock('../auth/middleware.js', () => ({
  requireUser: vi.fn(() => ({ userId: 'did:privy:owner' })),
  WrongPrincipalError: class extends Error {},
}));
vi.mock('./wallet-context.js', () => ({
  currentWallet: vi.fn(),
  requireWallet: vi.fn(),
  NoWalletError: class extends Error {},
}));
vi.mock('../executor/order.js', () => ({ armExits: vi.fn(), money: (n: number) => `$${n}`, placeOrder: vi.fn() }));
vi.mock('../evm/delegation.js', () => ({ readPolicy: vi.fn() }));
vi.mock('../graph/decide.js', () => ({ decide: vi.fn() }));
vi.mock('../graph/client.js', () => ({
  health: vi.fn(),
  dailySpendFor: vi.fn(),
  indexDescription: vi.fn(),
  spendsFor: vi.fn(),
}));

const { one } = await import('../db/index.js');
const engine = await import('../backtest/engine.js');
const { quote } = await import('../venues/oneinch.js');
const { networkCost } = await import('../evm/gas-price.js');
const { compareVenues } = await import('../venues/compare.js');
const { currentWallet } = await import('./wallet-context.js');
const { readPolicy } = await import('../evm/delegation.js');
const { decide } = await import('../graph/decide.js');
const { extra } = await import('./extra.js');
const { errorResponse } = await import('../http/errors.js');

const app = new Hono();
app.onError(errorResponse);
app.route('/', extra);

const OWNER = '0x95A0b368588713011a15f4b1041423f31B08e615';

type Answer = { status: number; body: Record<string, unknown> };

async function get(path: string): Promise<Answer> {
  const res = await app.request(path);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function post(path: string, body: unknown): Promise<Answer> {
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** A refusal as this API writes one: a code a client can branch on, and a sentence for a person. */
function refused(r: Answer, status: number, code: string) {
  expect(r.status, JSON.stringify(r.body)).toBe(status);
  expect(r.body.error).toBe(code);
  expect(r.body.detail).toEqual(expect.stringMatching(/\w+ \w+/));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(currentWallet).mockResolvedValue({ id: 'wallet-1', address: OWNER } as never);
  vi.mocked(one).mockResolvedValue({ address: OWNER } as never);
});

describe('GET /agents/:id/backtest', () => {
  it('refuses a lookback there is no window for, and replays nothing', async () => {
    const r = await get('/agents/momentum-scout/backtest?lookback=7d');
    refused(r, 400, 'invalid_lookback');
    expect(r.body.detail).toContain('30d, 90d, 6m, 1y');
    expect(engine.backtestMomentum).not.toHaveBeenCalled();
    expect(readPolicy).not.toHaveBeenCalled();
  });

  it('refuses a symbol with no price history as a 404, never as an upstream failure', async () => {
    vi.mocked(readPolicy).mockResolvedValue(null);
    refused(await get('/agents/momentum-scout/backtest?lookback=90d&symbol=NOPE'), 404, 'no_history');
    expect(engine.backtestMomentum).not.toHaveBeenCalled();
  });
});

describe('GET /swap/quote', () => {
  it('names a slippage outside 0.05–3, an amount that is not one and a token nothing trades — and quotes nothing', async () => {
    refused(await get('/swap/quote?in=USDC&out=WETH&amount=20&slippage=10'), 400, 'invalid_slippage');
    refused(await get('/swap/quote?in=USDC&out=WETH&amount=abc'), 400, 'invalid_amount');
    refused(await get('/swap/quote?in=USDC&out=WETH&amount=0'), 400, 'invalid_amount');
    const nope = await get('/swap/quote?in=NOPE&out=WETH&amount=20');
    refused(nope, 400, 'unknown_token');
    expect(nope.body.detail).toContain('NOPE');
    expect(quote).not.toHaveBeenCalled();
  });

  it('quotes a sound request under the registry spelling', async () => {
    vi.mocked(quote).mockResolvedValue({ inSymbol: 'USDC', outSymbol: 'NVDAc', outAmount: 0.55 } as never);
    vi.mocked(networkCost).mockRejectedValue(new Error('no gas price'));
    const r = await get('/swap/quote?in=usdc&out=nvdac&amount=100');
    expect(r).toMatchObject({ status: 200, body: { outSymbol: 'NVDAc', gas: null } });
    expect(quote).toHaveBeenCalledWith({ inSymbol: 'USDC', outSymbol: 'NVDAc', amount: 100, slippagePct: undefined });
  });
});

describe('GET /route/compare', () => {
  it('names a token nothing trades and an amount that is not a number, before any venue is asked', async () => {
    refused(await get('/route/compare?in=NOPE&out=WETH&amount=500'), 400, 'unknown_token');
    refused(await get('/route/compare?in=USDC&out=WETH&amount=abc'), 400, 'invalid_amount');
    refused(await get('/route/compare?in=USDC&out=WETH&amount=Infinity'), 400, 'invalid_amount');
    expect(compareVenues).not.toHaveBeenCalled();
  });
});

describe('GET /graph/decision', () => {
  it('refuses a size that is not dollars above zero, and decides nothing', async () => {
    for (const usd of ['abc', '0', '-5', 'Infinity', '']) {
      refused(await get(`/graph/decision?usd=${usd}`), 400, 'invalid_usd');
    }
    expect(decide).not.toHaveBeenCalled();
  });
});

describe('POST /strategies/backtest', () => {
  it('refuses a symbol with no price history as a 404, before fetching anything', async () => {
    const nope = await post('/strategies/backtest', { kind: 'dca', symbol: 'NOPE', lookback: '90d', params: { usd: 50 } });
    refused(nope, 404, 'no_history');
    expect(nope.body.detail).toContain('NOPE');
    // An equity has a route and no feed, so no history either.
    refused(
      await post('/strategies/backtest', {
        kind: 'grid',
        symbol: 'NVDAc',
        params: { lower: 100, upper: 200, steps: 4, usdPerStep: 25 },
      }),
      404,
      'no_history',
    );
    expect(engine.backtestDca).not.toHaveBeenCalled();
    expect(engine.backtestGrid).not.toHaveBeenCalled();
  });

  it('replays under the registry spelling, and keeps a fetch that failed a 502', async () => {
    vi.mocked(engine.backtestDca).mockRejectedValueOnce(new Error('429 after 5 attempts'));
    const r = await post('/strategies/backtest', { kind: 'dca', symbol: 'weth', params: { usd: 50 } });
    expect(r.status).toBe(502);
    expect(r.body.error).toBe('no_history');
    expect(vi.mocked(engine.backtestDca).mock.calls[0]![0]).toMatchObject({ symbol: 'WETH', lookback: '90d' });
  });

  it('refuses a lookback outside the four through its schema', async () => {
    expect(await post('/strategies/backtest', { kind: 'dca', symbol: 'WETH', lookback: '2y' })).toMatchObject({
      status: 400,
      body: { error: 'invalid_request' },
    });
  });
});
