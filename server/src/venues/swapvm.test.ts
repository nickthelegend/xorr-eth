/**
 * `XorrSwapVMBook` was deployed, covered by ten fork tests, and never called by the running
 * executor — an artefact rather than a venue. These tests cover the module that changes that, and
 * specifically the two things that made the Aqua equivalent hard to get right.
 *
 * **Discovery is a filter on someone else's logs.** Aqua is shared liquidity: `Shipped`/`Docked`
 * carry every app's books. A SwapVM program is distinguished only by its `app` being the SwapVM
 * router. Filtering on the wrong thing returns `[]`, which is indistinguishable from "nothing is
 * shipped" — the failure that once hid a broken block window behind a working aggregator fill.
 *
 * **The last event for a hash decides.** A book can be shipped, docked and shipped again.
 */
process.env.ONEINCH_API_KEY ??= 'test-key';
process.env.XORR_CHAIN ??= 'base-sepolia';
process.env.SWAPVM_BOOK_ADDRESS ??= '0x6cc8379b893d0239392720368f901b56c0f51e53';

import { describe, expect, it, vi, beforeEach } from 'vitest';

const getLogs = vi.fn();
const readContract = vi.fn();
const getBlockNumber = vi.fn(async () => 1_000_000n);

vi.mock('../evm/client.js', () => ({
  publicClient: {
    getLogs: (...a: unknown[]) => getLogs(...a),
    readContract: (...a: unknown[]) => readContract(...a),
    getBlockNumber: () => getBlockNumber(),
  },
}));

const { openPrograms, buildSwapVmFill, encodeOrder, decodeOrder, swapVmBookAddress } = await import(
  './swapvm.js'
);

const SWAP_VM = '0x111111338c5091E8440b67B168bAe16a668AC0De';
const OTHER_APP = '0xff0845130ca2b077c0cdf964d162fb00e869c199';
const MAKER = '0x02a54677000000000000000000000000000000aa';

const order = (program: `0x${string}` = '0xdeadbeef') => ({
  maker: MAKER as `0x${string}`,
  receiver: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  makerTraits: 1n,
  program,
});

/** A `Shipped`/`Docked` log as viem decodes it: every parameter non-indexed. */
const evt = (app: string, hash: string, strategy: string, block: bigint, logIndex: number) => ({
  args: { maker: MAKER, app, strategyHash: hash, strategy },
  blockNumber: block,
  logIndex,
});

beforeEach(() => {
  getLogs.mockReset();
  readContract.mockReset();
});

describe('the order round-trips through the wire format', () => {
  it('encodes and decodes without losing the program', () => {
    const o = order('0xc0ffee');
    const back = decodeOrder(encodeOrder(o));
    expect(back.maker.toLowerCase()).toBe(MAKER.toLowerCase());
    expect(back.program).toBe('0xc0ffee');
    expect(back.makerTraits).toBe(1n);
  });
});

describe('discovery filters on the SwapVM app, not ours', () => {
  it('finds a shipped program', async () => {
    const enc = encodeOrder(order());
    getLogs.mockResolvedValueOnce([evt(SWAP_VM, '0xaa', enc, 10n, 0)]).mockResolvedValueOnce([]);
    const found = await openPrograms();
    expect(found).toHaveLength(1);
    expect(found[0]!.hash).toBe('0xaa');
    expect(found[0]!.order.program).toBe('0xdeadbeef');
  });

  it('ignores books shipped under another app — Aqua is shared liquidity', async () => {
    const enc = encodeOrder(order());
    getLogs.mockResolvedValueOnce([evt(OTHER_APP, '0xbb', enc, 10n, 0)]).mockResolvedValueOnce([]);
    expect(await openPrograms()).toHaveLength(0);
  });

  it('the LAST event for a hash decides, so a docked book is closed', async () => {
    const enc = encodeOrder(order());
    getLogs
      .mockResolvedValueOnce([evt(SWAP_VM, '0xcc', enc, 10n, 0)])
      .mockResolvedValueOnce([evt(SWAP_VM, '0xcc', enc, 20n, 0)]);
    expect(await openPrograms()).toHaveLength(0);
  });

  it('a re-shipped book is open again', async () => {
    const enc = encodeOrder(order());
    getLogs
      .mockResolvedValueOnce([evt(SWAP_VM, '0xdd', enc, 10n, 0), evt(SWAP_VM, '0xdd', enc, 30n, 0)])
      .mockResolvedValueOnce([evt(SWAP_VM, '0xdd', enc, 20n, 0)]);
    expect(await openPrograms()).toHaveLength(1);
  });

  it('an undecodable payload is skipped, not thrown', async () => {
    // Another version, or another app's encoding. Not an error.
    getLogs.mockResolvedValueOnce([evt(SWAP_VM, '0xee', '0x1234', 10n, 0)]).mockResolvedValueOnce([]);
    expect(await openPrograms()).toHaveLength(0);
  });
});

describe('building the fill', () => {
  const params = {
    owner: '0x95A0b368588713011a15f4b1041423f31B08e615' as `0x${string}`,
    tokenIn: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
    tokenOut: '0x4200000000000000000000000000000000000006' as `0x${string}`,
    amountIn: 100_000_000n,
    slippage: 0.003,
    quotedOut: 1_000_000_000_000_000_000n,
  };

  it('asks the BOOK to compute the call, and applies the minimum out', async () => {
    getLogs.mockResolvedValueOnce([evt(SWAP_VM, '0xaa', encodeOrder(order()), 10n, 0)]).mockResolvedValueOnce([]);
    readContract.mockResolvedValue([params.tokenIn, swapVmBookAddress(), params.amountIn, '0xcafe']);

    const fill = await buildSwapVmFill(params);
    expect(fill?.data).toBe('0xcafe');
    // 0.3% below the quote — computed here, enforced inside the VM.
    const call = readContract.mock.calls[0]![0] as { args: unknown[] };
    expect(call.args[5]).toBe(997_000_000_000_000_000n);
    // Encoding the calldata in TypeScript would be a second implementation free to drift from the
    // contract that has to accept it.
    expect(call.args[1]).toBe(params.owner);
  });

  it('returns undefined when nothing is shipped — the ordinary case, not an error', async () => {
    getLogs.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect(await buildSwapVmFill(params)).toBeUndefined();
  });

  it('returns undefined when discovery itself fails, and says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getLogs.mockRejectedValue(new Error('rpc exploded'));
    expect(await buildSwapVmFill(params)).toBeUndefined();
    // "Nothing shipped" and "the query broke" are the same answer to the caller unless one speaks.
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('refuses a zero minimum rather than filling at any price', async () => {
    getLogs.mockResolvedValueOnce([evt(SWAP_VM, '0xaa', encodeOrder(order()), 10n, 0)]).mockResolvedValueOnce([]);
    expect(await buildSwapVmFill({ ...params, quotedOut: 0n })).toBeUndefined();
  });
});
