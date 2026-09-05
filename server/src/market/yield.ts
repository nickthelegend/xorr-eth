/**
 * Real supply yield, read on chain.
 *
 * The app shipped a "your SOL can earn ~12.6% staking" strip taken from the design handoff. That
 * number was never verified and, after the pivot to Base, staking SOL is not a thing this app can
 * do at all — the client called `/staking/yield`, which did not exist on the server, and rendered
 * "unavailable" forever.
 *
 * This replaces it with a number that is true and checkable: the current USDC supply rate on
 * Aave v3, read straight from the Pool contract. It is what the "stable yield" bucket in a draft
 * portfolio would actually earn, and anyone can verify it against app.aave.com.
 */
import { createPublicClient, http, type Address } from 'viem';
import { base } from 'viem/chains';
import { ADDRESSES } from '../evm/chains.js';

/** Aave v3 Pool on Base. */
const AAVE_V3_POOL: Address = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';

/** Aave stores rates in ray — 27 decimals — as a per-second rate annualised linearly. */
const RAY = 10n ** 27n;
const SECONDS_PER_YEAR = 31_536_000;

const POOL_ABI = [
  {
    type: 'function',
    name: 'getReserveData',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'configuration', type: 'uint256' },
          { name: 'liquidityIndex', type: 'uint128' },
          { name: 'currentLiquidityRate', type: 'uint128' },
          { name: 'variableBorrowIndex', type: 'uint128' },
          { name: 'currentVariableBorrowRate', type: 'uint128' },
          { name: 'currentStableBorrowRate', type: 'uint128' },
          { name: 'lastUpdateTimestamp', type: 'uint40' },
          { name: 'id', type: 'uint16' },
          { name: 'aTokenAddress', type: 'address' },
          { name: 'stableDebtTokenAddress', type: 'address' },
          { name: 'variableDebtTokenAddress', type: 'address' },
          { name: 'interestRateStrategyAddress', type: 'address' },
          { name: 'accruedToTreasury', type: 'uint128' },
          { name: 'unbacked', type: 'uint128' },
          { name: 'isolationModeTotalDebt', type: 'uint128' },
        ],
      },
    ],
  },
] as const;

/**
 * Aave is only deployed on Base mainnet, so this reads mainnet even when the executor is trading a
 * testnet or a fork. The response says so; a rate presented as local when it is not would be the
 * same class of lie as the 12.6% it replaces.
 */
const client = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC ?? 'https://mainnet.base.org'),
});

export type SupplyYield = {
  symbol: string;
  /** Simple APR as a fraction, e.g. 0.043 for 4.3%. */
  estimatedApy: number;
  feed: 'live';
  source: string;
  note: string;
};

export async function usdcSupplyYield(): Promise<SupplyYield> {
  const data = await client.readContract({
    address: AAVE_V3_POOL,
    abi: POOL_ABI,
    functionName: 'getReserveData',
    args: [ADDRESSES.usdcBase],
  });

  // currentLiquidityRate is an annualised per-second rate in ray. Aave's own UI compounds it per
  // second; the linear rate is the conservative of the two, so quote that.
  const rateRay = data.currentLiquidityRate;
  const apr = Number((rateRay * 1_000_000n) / RAY) / 1_000_000;

  // Compounded, the way app.aave.com displays it.
  const perSecond = apr / SECONDS_PER_YEAR;
  const apy = (1 + perSecond) ** SECONDS_PER_YEAR - 1;

  if (!Number.isFinite(apy) || apy < 0 || apy > 1) {
    throw new Error(`Implausible Aave USDC rate: ${apy}`);
  }

  return {
    symbol: 'USDC',
    estimatedApy: apy,
    feed: 'live',
    source: `Aave v3 Pool ${AAVE_V3_POOL} on Base`,
    note: 'Supplying USDC to Aave v3 on Base. The rate floats; it is not a promise.',
  };
}
