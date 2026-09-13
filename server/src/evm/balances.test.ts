/**
 * USDC supplied to Aave, as part of the balance (PLAN.md 2.4).
 *
 * The reserve was read from Base mainnet before anything asked whether this chain has a pool, so
 * every Sepolia balance paid a throttled public read to learn the answer was 0.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getCode: vi.fn(),
  readContract: vi.fn(),
  multicall: vi.fn(),
  poolHere: vi.fn(),
  usdcReserve: vi.fn(),
}));

vi.mock('./client.js', () => ({ publicClient: { getCode: h.getCode, readContract: h.readContract, multicall: h.multicall } }));
vi.mock('../market/yield.js', () => ({ aavePoolIsDeployedHere: h.poolHere, usdcReserve: h.usdcReserve }));
vi.mock('../market/prices.js', () => ({ priceOf: vi.fn() }));
vi.mock('../venues/oneinch.js', () => ({
  TOKENS: {
    WETH: { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    cbBTC: { address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8 },
    USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  },
  canonicalSymbol: (raw: string) => ({ CBBTC: 'cbBTC', WETH: 'WETH', USDC: 'USDC' })[raw.toUpperCase()] ?? raw,
}));

const { chainUnitsOf, clearReadableTokenCache, suppliedUsd } = await import('./balances.js');

const OWNER = '0x95A0b368588713011a15f4b1041423f31B08e615';

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  clearReadableTokenCache();
});

describe('units held, for holding a ledger to the chain (PLAN.md 2.7)', () => {
  it('asks each token once under its registry name and answers under the spelling it was asked with', async () => {
    h.getCode.mockResolvedValue('0x6080604052');
    h.multicall.mockResolvedValue([0n, 449_116n]);
    const held = await chainUnitsOf(OWNER, ['WETH', 'CBBTC', 'NOPE', 'USDC']);
    expect(h.multicall).toHaveBeenCalledTimes(1);
    expect(held.get('WETH')).toBe(0);
    expect(held.get('CBBTC')).toBe(0.00449116);
    // Not in the registry, and the settlement token: not checked, which is not the same as none held.
    expect(held.get('NOPE')).toBeNull();
    expect(held.get('USDC')).toBeNull();
  });

  it('asks nothing at all when no symbol is in the registry', async () => {
    expect([...(await chainUnitsOf(OWNER, ['CHAINPROBE'])).values()]).toEqual([null]);
    expect(h.getCode).not.toHaveBeenCalled();
    expect(h.multicall).not.toHaveBeenCalled();
  });

  it('a balance read that fails throws rather than answering with zeros', async () => {
    h.getCode.mockResolvedValue('0x6080604052');
    h.multicall.mockRejectedValue(new Error('rpc timeout'));
    await expect(chainUnitsOf(OWNER, ['WETH'])).rejects.toThrow('rpc timeout');
  });
});

describe('supplied USDC', () => {
  it('is 0 on a chain with no pool, without asking mainnet for the reserve', async () => {
    h.poolHere.mockResolvedValue(false);
    expect(await suppliedUsd(OWNER)).toBe(0);
    expect(h.usdcReserve).not.toHaveBeenCalled();
    expect(h.readContract).not.toHaveBeenCalled();
  });

  it('is the aToken balance where there is a pool', async () => {
    h.poolHere.mockResolvedValue(true);
    h.usdcReserve.mockResolvedValue({
      apy: 0.04,
      aToken: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    });
    h.getCode.mockResolvedValue('0x6080604052');
    h.readContract.mockResolvedValue(1_234_560_000n);
    expect(await suppliedUsd(OWNER)).toBe(1234.56);
  });

  it('a pool check that fails is an error, not "nothing supplied"', async () => {
    h.poolHere.mockRejectedValue(new Error('rpc down'));
    await expect(suppliedUsd(OWNER)).rejects.toThrow('rpc down');
  });
});
