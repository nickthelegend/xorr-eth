/**
 * Where a leg settles, with every venue stood in for (PLAN.md 3.8, and the test half of 3.4).
 *
 * `chooseSettlement` is the ordering rule: Aqua when a book serves the size, then a maker's SwapVM program, then the
 * aggregator — a direct leg to its own venue, and never a book on a close. These cases prove which builder is asked,
 * with what, and which floor the leg is held to, including that "route to 1inch" skips the books only when an Aqua
 * index gave that answer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeFunctionData, parseAbi } from 'viem';
import type { AquaFill } from '../venues/aqua.js';
import type { SwapCalldata, SwapQuote } from '../venues/oneinch.js';
import type { SwapVmFill } from '../venues/swapvm.js';
import type { TradeIntent } from './kinds/index.js';

const TOKENS = vi.hoisted(
  () =>
    ({
      USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
      WETH: { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    }) as const,
);

vi.mock('../venues/oneinch.js', () => ({
  TOKENS,
  SLIPPAGE: { scheduled: 0.3, stop: 1, panic: 2 },
  // A spy: what settlement hands it, and that its answer is the tolerance the router gets, are the assertions.
  slippageFor: vi.fn(),
  quote: vi.fn(),
  buildSwap: vi.fn(),
}));
vi.mock('../venues/aqua.js', () => ({ buildAquaFill: vi.fn() }));
vi.mock('../venues/swapvm.js', () => ({ buildSwapVmFill: vi.fn() }));
vi.mock('../graph/aqua.js', () => ({ aquaIndexConfigured: vi.fn() }));

const { buildSwap, quote, slippageFor } = await import('../venues/oneinch.js');
const { buildAquaFill } = await import('../venues/aqua.js');
const { buildSwapVmFill } = await import('../venues/swapvm.js');
const { aquaIndexConfigured } = await import('../graph/aqua.js');
const { chooseSettlement } = await import('./settle.js');

const USDC = TOKENS.USDC.address;
const WETH = TOKENS.WETH.address;
/** The user whose capital is spent, and who receives what it buys. */
const OWNER = '0x95A0b368588713011a15f4b1041423f31B08e615';
/** Holds the tokens for the length of the venue call. */
const DELEGATION = '0x6c5528Fd8E74a047A85bAb413856A9239E73540e';
const ROUTER = '0x111111125421cA6dc452d289314280a0f8842A65';
const AQUA_BOOK = '0x74e1283711106a5844eb20760c7cb6405933c54f';
const SWAPVM_BOOK = '0x6cc8379b893d0239392720368f901b56c0f51e53';
const MAKER = '0x364d7Bbc139541e0e37450D527ae154B5C292581';
const AAVE_POOL = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
/** The receipt token a USDC supply mints. */
const A_USDC = '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB';

/** A scheduled buy: $100 of WETH, paid in USDC. */
const buy = (over: Partial<TradeIntent> = {}): TradeIntent => ({
  inSymbol: 'USDC',
  outSymbol: 'WETH',
  amountIn: 100,
  usd: 100,
  because: 'Scheduled buy of $100 of WETH.',
  ...over,
});

const settle = (intent: TradeIntent, opts: { preferred?: string; isClose?: boolean } = {}) =>
  chooseSettlement({
    intent,
    owner: OWNER,
    preferred: opts.preferred,
    isClose: opts.isClose ?? false,
    delegationFrom: DELEGATION,
  });

/** What 1inch quoted for the buy: 0.04 WETH, 0.42% under the mid. */
const QUOTE: SwapQuote = {
  inSymbol: 'USDC',
  outSymbol: 'WETH',
  inAmount: 100,
  outAmount: 0.04,
  minimumOut: 0.03988,
  slippagePct: 0.3,
  venues: ['Uniswap V3'],
  route: 'Uniswap V3',
  priceImpactPct: 0.42,
  estimatedGas: 184_000,
};

/** A maker's book serving the whole size: its quote, 0.03995 WETH, less 0.3%. */
const AQUA_FILL: AquaFill = {
  token: USDC,
  venue: AQUA_BOOK,
  amount: 100_000_000n,
  data: '0xaaaa',
  quotedOut: 39_950_000_000_000_000n,
  tokenOut: WETH,
  minOut: 39_830_150_000_000_000n,
  strategy: {
    maker: MAKER,
    token0: WETH,
    token1: USDC,
    feeBps: 30n,
    maxDeviationBps: 200n,
    referencePrice: 2_500_000_000n,
    salt: `0x${'5a'.repeat(32)}`,
  },
  hash: `0x${'a1'.repeat(32)}`,
};

/** A maker's SwapVM program: the quote less 0.3%, compiled into the order. */
const SWAPVM_FILL: SwapVmFill = {
  token: USDC,
  venue: SWAPVM_BOOK,
  amount: 100_000_000n,
  data: '0x5555',
  tokenOut: WETH,
  order: { maker: MAKER, traits: 1n, data: '0xdeadbeef' },
  hash: `0x${'b2'.repeat(32)}`,
  minOut: 39_880_000_000_000_000n,
};

/** A recognisable tolerance: whatever the spy answers is what must reach the router. */
const WIDENED = 0.45;

/** The router call 1inch built: 0.04 WETH less the widened 0.45%. */
const ROUTER_CALL: SwapCalldata = { to: ROUTER, data: '0x1111', value: '0', minOut: 39_820_000_000_000_000n };

beforeEach(() => {
  vi.mocked(buildAquaFill).mockReset().mockResolvedValue(undefined);
  vi.mocked(buildSwapVmFill).mockReset().mockResolvedValue(undefined);
  vi.mocked(quote).mockReset().mockResolvedValue(QUOTE);
  vi.mocked(buildSwap).mockReset().mockResolvedValue(ROUTER_CALL);
  vi.mocked(slippageFor).mockReset().mockReturnValue(WIDENED);
  vi.mocked(aquaIndexConfigured).mockReset().mockReturnValue(false);
});

describe('the venue order', () => {
  it("fills against an Aqua book that serves the size, at the book's own floor, and asks nothing after it", async () => {
    vi.mocked(buildAquaFill).mockResolvedValue(AQUA_FILL);

    expect(await settle(buy())).toEqual({
      payToken: { address: USDC, decimals: 6 },
      swap: { to: AQUA_BOOK, data: '0xaaaa' },
      venue: 'aqua',
      floor: { tokenOut: WETH, minOut: 39_830_150_000_000_000n },
    });
    // $100 in USDC's six decimals, and the scheduled 0.3% as a fraction.
    expect(buildAquaFill).toHaveBeenCalledWith({
      owner: OWNER,
      tokenIn: USDC,
      tokenOut: WETH,
      amountIn: 100_000_000n,
      slippage: 0.003,
    });
    expect(quote).not.toHaveBeenCalled();
    expect(buildSwapVmFill).not.toHaveBeenCalled();
    expect(buildSwap).not.toHaveBeenCalled();
  });

  it("with no book deep enough, fills a SwapVM program priced from the quote in the output token's own units", async () => {
    vi.mocked(buildSwapVmFill).mockResolvedValue(SWAPVM_FILL);

    expect(await settle(buy())).toEqual({
      payToken: { address: USDC, decimals: 6 },
      swap: { to: SWAPVM_BOOK, data: '0x5555' },
      venue: 'swapvm',
      floor: { tokenOut: WETH, minOut: 39_880_000_000_000_000n },
    });
    expect(buildAquaFill).toHaveBeenCalledTimes(1);
    expect(quote).toHaveBeenCalledWith({ inSymbol: 'USDC', outSymbol: 'WETH', amount: 100 });
    // The 0.04 WETH quoted, in WETH's eighteen decimals — not USDC's six.
    expect(buildSwapVmFill).toHaveBeenCalledWith({
      owner: OWNER,
      tokenIn: USDC,
      tokenOut: WETH,
      amountIn: 100_000_000n,
      slippage: 0.003,
      quotedOut: 40_000_000_000_000_000n,
    });
    expect(buildSwap).not.toHaveBeenCalled();
  });

  it("with neither book serving, the aggregator fills from the delegation to the owner, at the router's floor", async () => {
    expect(await settle(buy())).toEqual({
      payToken: { address: USDC, decimals: 6 },
      swap: { to: ROUTER, data: '0x1111' },
      venue: '1inch',
      floor: { tokenOut: WETH, minOut: 39_820_000_000_000_000n },
    });
    // The scheduled ceiling, widened by the impact the quote reported; that answer is the tolerance the router gets.
    expect(slippageFor).toHaveBeenCalledWith(0.3, 0.42);
    expect(buildSwap).toHaveBeenCalledWith({
      inSymbol: 'USDC',
      outSymbol: 'WETH',
      amount: 100,
      amountRaw: undefined,
      from: DELEGATION,
      receiver: OWNER,
      slippagePct: WIDENED,
    });
    // Aqua first, then the quote SwapVM needs, then SwapVM, then the aggregator.
    const asked = [
      vi.mocked(buildAquaFill).mock.invocationCallOrder[0],
      vi.mocked(quote).mock.invocationCallOrder[0],
      vi.mocked(buildSwapVmFill).mock.invocationCallOrder[0],
      vi.mocked(buildSwap).mock.invocationCallOrder[0],
    ];
    expect(asked.every((n) => typeof n === 'number')).toBe(true);
    expect(asked).toEqual([...asked].sort((a, b) => a! - b!));
  });

  it('does not try SwapVM when the quote failed, and the aggregator falls back to the urgency ceiling', async () => {
    vi.mocked(quote).mockRejectedValue(new Error('429 after 5 attempts'));

    const s = await settle(buy());

    expect(buildSwapVmFill).not.toHaveBeenCalled();
    expect(slippageFor).toHaveBeenCalledWith(0.3, null);
    expect(s.venue).toBe('1inch');
  });

  it('treats an Aqua builder that throws as "not served", and moves on to SwapVM', async () => {
    vi.mocked(buildAquaFill).mockRejectedValue(new Error('execution reverted: EmptyBook()'));
    vi.mocked(buildSwapVmFill).mockResolvedValue(SWAPVM_FILL);

    expect((await settle(buy())).venue).toBe('swapvm');
  });

  it('treats a SwapVM builder that throws as "not served", and moves on to the aggregator', async () => {
    vi.mocked(buildSwapVmFill).mockRejectedValue(new Error('fetch failed'));

    expect((await settle(buy())).venue).toBe('1inch');
    expect(buildSwap).toHaveBeenCalledTimes(1);
  });

  it('sends a direct leg to its own venue at its own floor, and asks no book and no aggregator', async () => {
    // Supplying $100 of idle USDC to Aave: the calldata is the whole trade, and the aToken is what the owner receives.
    const direct: NonNullable<TradeIntent['direct']> = {
      venue: AAVE_POOL,
      data: encodeFunctionData({
        abi: parseAbi(['function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)']),
        functionName: 'supply',
        args: [USDC, 100_000_000n, OWNER, 0],
      }),
      unitPriceUsd: 1,
      tokenOut: A_USDC,
      minOut: 99_990_000n,
    };

    const s = await settle(buy({ outSymbol: 'aUSDC', direct }));

    expect(s).toEqual({
      payToken: { address: USDC, decimals: 6 },
      swap: { to: AAVE_POOL, data: direct.data },
      venue: 'aave',
      floor: { tokenOut: A_USDC, minOut: 99_990_000n },
    });
    expect(buildAquaFill).not.toHaveBeenCalled();
    expect(buildSwapVmFill).not.toHaveBeenCalled();
    expect(buildSwap).not.toHaveBeenCalled();
  });

  it('never tries a book on a close, and gives the aggregator the stop ceiling widened by the quote', async () => {
    // Books that WOULD serve, and an index recommending one: a close still does not ask them.
    vi.mocked(buildAquaFill).mockResolvedValue(AQUA_FILL);
    vi.mocked(buildSwapVmFill).mockResolvedValue(SWAPVM_FILL);
    vi.mocked(quote).mockResolvedValue({
      ...QUOTE,
      inSymbol: 'WETH',
      outSymbol: 'USDC',
      inAmount: 0.04,
      outAmount: 99.7,
      minimumOut: 99.4009,
      priceImpactPct: 0.9,
    });
    vi.mocked(slippageFor).mockReturnValue(1.35);
    // 99.7 USDC less 1.35%.
    vi.mocked(buildSwap).mockResolvedValue({ ...ROUTER_CALL, minOut: 98_354_050n });
    // The whole position, in the wei the chain holds.
    const close: TradeIntent = {
      inSymbol: 'WETH',
      outSymbol: 'USDC',
      amountIn: 0.04,
      amountInRaw: 40_000_000_000_000_008n,
      usd: 99.7,
      because: 'WETH fell through the stop.',
    };

    const s = await settle(close, { preferred: 'aqua', isClose: true });

    expect(buildAquaFill).not.toHaveBeenCalled();
    expect(buildSwapVmFill).not.toHaveBeenCalled();
    expect(quote).toHaveBeenCalledWith({ inSymbol: 'WETH', outSymbol: 'USDC', amount: 0.04 });
    expect(slippageFor).toHaveBeenCalledWith(1, 0.9);
    expect(buildSwap).toHaveBeenCalledWith({
      inSymbol: 'WETH',
      outSymbol: 'USDC',
      amount: 0.04,
      amountRaw: 40_000_000_000_000_008n,
      from: DELEGATION,
      receiver: OWNER,
      slippagePct: 1.35,
    });
    expect(s).toEqual({
      payToken: { address: WETH, decimals: 18 },
      swap: { to: ROUTER, data: '0x1111' },
      venue: '1inch',
      floor: { tokenOut: USDC, minOut: 98_354_050n },
    });
  });

  it('throws on an input token with no registry entry, before any venue is asked', async () => {
    await expect(settle(buy({ inSymbol: 'DOGE' }))).rejects.toThrow('No token registry entry for DOGE');
    expect(buildAquaFill).not.toHaveBeenCalled();
    expect(quote).not.toHaveBeenCalled();
    expect(buildSwapVmFill).not.toHaveBeenCalled();
    expect(buildSwap).not.toHaveBeenCalled();
  });
});

describe('"route to 1inch" skips the books only when an Aqua index gave that answer (PLAN.md 3.4)', () => {
  it('skips both books when the Aqua index is configured', async () => {
    vi.mocked(aquaIndexConfigured).mockReturnValue(true);
    vi.mocked(buildAquaFill).mockResolvedValue(AQUA_FILL);
    vi.mocked(buildSwapVmFill).mockResolvedValue(SWAPVM_FILL);

    const s = await settle(buy(), { preferred: '1inch' });

    expect(buildAquaFill).not.toHaveBeenCalled();
    expect(buildSwapVmFill).not.toHaveBeenCalled();
    expect(s.venue).toBe('1inch');
    expect(s.floor).toEqual({ tokenOut: WETH, minOut: 39_820_000_000_000_000n });
  });

  it('still asks Aqua when no Aqua index is configured, and a book there wins', async () => {
    vi.mocked(buildAquaFill).mockResolvedValue(AQUA_FILL);

    const s = await settle(buy(), { preferred: '1inch' });

    expect(buildAquaFill).toHaveBeenCalledTimes(1);
    expect(s.venue).toBe('aqua');
    expect(buildSwap).not.toHaveBeenCalled();
  });

  it('still asks SwapVM when no Aqua index is configured and Aqua cannot serve', async () => {
    vi.mocked(buildSwapVmFill).mockResolvedValue(SWAPVM_FILL);

    const s = await settle(buy(), { preferred: '1inch' });

    expect(buildAquaFill).toHaveBeenCalledTimes(1);
    expect(s.venue).toBe('swapvm');
    expect(buildSwap).not.toHaveBeenCalled();
  });

  it('leaves the books in play for any other recommendation, with or without an index', async () => {
    vi.mocked(aquaIndexConfigured).mockReturnValue(true);
    vi.mocked(buildAquaFill).mockResolvedValue(AQUA_FILL);

    expect((await settle(buy(), { preferred: 'aqua' })).venue).toBe('aqua');
    expect((await settle(buy(), { preferred: undefined })).venue).toBe('aqua');
    expect(buildAquaFill).toHaveBeenCalledTimes(2);
  });
});
