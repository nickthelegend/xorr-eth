/**
 * The delegation adapter — reads and writes XorrDelegation.
 *
 * The chain is the source of truth for what the bot may spend. Our database caches it for display,
 * and every enforcement decision re-reads the contract rather than trusting that cache.
 */
import { parseUnits, formatUnits, type Address, type Hex } from 'viem';
import { publicClient, walletClient, delegateAccount } from './client.js';
import { ADDRESSES, SETTLEMENT_VENUES } from './chains.js';
import 'dotenv/config';

export const DELEGATION_ADDRESS = (process.env.DELEGATION_ADDRESS ??
  '0x0000000000000000000000000000000000000000') as Address;

/** USDC has 6 decimals; the app's caps are dollar figures. */
export const USD_DECIMALS = 6;

export const DELEGATION_ABI = [
  {
    type: 'function',
    name: 'grant',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'delegate', type: 'address' },
      { name: 'dailyCap', type: 'uint256' },
      { name: 'expiresAt', type: 'uint64' },
      { name: 'venues', type: 'address[]' },
    ],
    outputs: [],
  },
  { type: 'function', name: 'revoke', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  {
    type: 'function',
    name: 'spend',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'venue', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [{ name: 'result', type: 'bytes' }],
  },
  {
    type: 'function',
    name: 'closePosition',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'venue', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [{ name: 'result', type: 'bytes' }],
  },
  {
    type: 'function',
    name: 'policyOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [
      { name: 'delegate', type: 'address' },
      { name: 'dailyCap', type: 'uint256' },
      { name: 'expiresAt', type: 'uint64' },
      { name: 'revoked', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'remainingToday',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'isVenueAllowed',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'venue', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'spentToday',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'isVenueAllowed',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'venue', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },

  /*
   * The contract's own errors, so a refusal arrives as a sentence.
   *
   * These were missing, and viem can only decode a revert it has the ABI for — so a policy whose
   * delegate is someone else came back as `reverted with the following signature: 0x1db3b859 …
   * Unable to decode`, four bytes and an apology, on the one path where the contract had already
   * said exactly what was wrong. `humanFailure` turns a named error into something a user can act
   * on; it cannot name what it was never given.
   */
  { type: 'error', name: 'NotDelegate', inputs: [] },
  { type: 'error', name: 'PolicyRevoked', inputs: [] },
  { type: 'error', name: 'PolicyExpired', inputs: [] },
  { type: 'error', name: 'VenueNotAllowed', inputs: [{ name: 'venue', type: 'address' }] },
  {
    type: 'error',
    name: 'DailyCapExceeded',
    inputs: [
      { name: 'requested', type: 'uint256' },
      { name: 'remaining', type: 'uint256' },
    ],
  },
  { type: 'error', name: 'ZeroAmount', inputs: [] },
  { type: 'error', name: 'VenueCallFailed', inputs: [] },
  /*
   * The VENUE's errors, so viem can decode what `spend` bubbles up.
   *
   * `spend` forwards a venue revert rather than masking it, which is right — but the ABI listed
   * only this contract's own errors, so viem answered a real 1inch slippage revert with
   *
   *   Unable to decode signature "0x064a4ec6" as it was not found on the provided ABI
   *
   * The information was on the wire and thrown away at the last step. These are 1inch's, not
   * ours; they belong here because this is the ABI the call is decoded against.
   */
  {
    type: 'error',
    name: 'ReturnAmountIsNotEnough',
    inputs: [
      { name: 'result', type: 'uint256' },
      { name: 'minReturn', type: 'uint256' },
    ],
  },
  { type: 'error', name: 'ZeroReturnAmount', inputs: [] },
  { type: 'error', name: 'SafeTransferFromFailed', inputs: [] },
] as const;

export type OnChainPolicy = {
  delegate: Address;
  dailyCapUsd: number;
  expiresAt: number;
  revoked: boolean;
  remainingTodayUsd: number;
  spentTodayUsd: number;
};

export function usdToUnits(usd: number): bigint {
  return parseUnits(usd.toFixed(USD_DECIMALS), USD_DECIMALS);
}
export function unitsToUsd(units: bigint): number {
  return Number(formatUnits(units, USD_DECIMALS));
}

/** Read the live policy. Never trust our own database for an enforcement decision. */
export async function readPolicy(owner: Address): Promise<OnChainPolicy | null> {
  const [policy, remaining, spent] = await Promise.all([
    publicClient.readContract({
      address: DELEGATION_ADDRESS,
      abi: DELEGATION_ABI,
      functionName: 'policyOf',
      args: [owner],
    }),
    publicClient.readContract({
      address: DELEGATION_ADDRESS,
      abi: DELEGATION_ABI,
      functionName: 'remainingToday',
      args: [owner],
    }),
    publicClient.readContract({
      address: DELEGATION_ADDRESS,
      abi: DELEGATION_ABI,
      functionName: 'spentToday',
      args: [owner],
    }),
  ]);

  const [delegate, dailyCap, expiresAt, revoked] = policy;
  if (delegate === '0x0000000000000000000000000000000000000000') return null;

  return {
    delegate,
    dailyCapUsd: unitsToUsd(dailyCap),
    expiresAt: Number(expiresAt) * 1000,
    revoked,
    remainingTodayUsd: unitsToUsd(remaining),
    spentTodayUsd: unitsToUsd(spent),
  };
}

export async function isVenueAllowed(owner: Address, venue: Address): Promise<boolean> {
  return publicClient.readContract({
    address: DELEGATION_ADDRESS,
    abi: DELEGATION_ABI,
    functionName: 'isVenueAllowed',
    args: [owner, venue],
  });
}

/**
 * Spend as the delegate. This is the ONLY thing the executor's key can do with user capital, and
 * the contract rejects it the moment it breaches the cap, the expiry or the venue allowlist.
 */
/**
 * Head-room on the gas limit for a delegated call.
 *
 * The estimate is taken against the state as it is NOW, and the transaction executes at least one
 * block later. That gap is not free: a lending pool accrues interest on the way through and writes
 * a slot the estimate never priced, and a router's route can touch a pool whose tick has since
 * moved. Measured on a Base fork, an Aave withdraw estimated at 172,488 and used 177,503 — a 3%
 * shortfall, which is an out-of-gas revert, not a slow trade.
 *
 * An out-of-gas revert is the worst failure this executor can have, because it looks exactly like
 * the venue refusing the trade and tells the user nothing true. Gas is refunded when unused, so
 * the only cost of the head-room is a slightly higher balance requirement on the bot's own wallet.
 */
const GAS_HEADROOM_PCT = 30n;

function withHeadroom(estimate: bigint): bigint {
  return (estimate * (100n + GAS_HEADROOM_PCT)) / 100n;
}

export async function spendAsDelegate(params: {
  owner: Address;
  token?: Address;
  venue?: Address;
  usd: number;
  data: Hex;
}): Promise<Hex> {
  const call = {
    account: delegateAccount,
    address: DELEGATION_ADDRESS,
    abi: DELEGATION_ABI,
    functionName: 'spend',
    args: [
      params.owner,
      params.token ?? ADDRESSES.usdcBase,
      params.venue ?? ADDRESSES.oneInchRouter,
      usdToUnits(params.usd),
      params.data,
    ],
  } as const;
  // Simulate first, so a policy violation is caught before anything is signed and surfaces as the
  // contract's own named error rather than as a mined failure.
  const { request } = await publicClient.simulateContract(call);
  const gas = withHeadroom(await publicClient.estimateContractGas(call));
  return walletClient.writeContract({ ...request, gas });
}

/**
 * Which of this chain's venues this owner has actually allowed.
 *
 * The mapping is not enumerable on chain — by design, since an unbounded array in storage is a gas
 * trap — so this asks about each venue we could possibly route through. That is the honest shape
 * of the question anyway: the safety screen is telling the user what THIS app can do with their
 * permission, not auditing every address they have ever allowed.
 */
export async function allowedVenues(owner: Address): Promise<Address[]> {
  const results = await publicClient.multicall({
    allowFailure: false,
    contracts: SETTLEMENT_VENUES.map((venue) => ({
      address: DELEGATION_ADDRESS,
      abi: DELEGATION_ABI,
      functionName: 'isVenueAllowed' as const,
      args: [owner, venue] as const,
    })),
  });
  return SETTLEMENT_VENUES.filter((_, i) => results[i] === true) as Address[];
}

export const delegatePublicKey = delegateAccount.address;

/**
 * Wait for a transaction the client says it sent.
 *
 * The app reports a hash the moment the wallet broadcasts it, which is before any block contains
 * it. Reading contract state at that instant sees the world as it was, so a grant that is on its
 * way looks like a grant that never happened. Bounded, because a hash the chain never accepts must
 * not hold a request open forever — the caller treats a timeout as "not confirmed", which is the
 * honest answer.
 */
export async function waitForTx(hash: Hex, timeoutMs = 30_000): Promise<boolean> {
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    timeout: timeoutMs,
    confirmations: 1,
  });
  return receipt.status === 'success';
}

/**
 * Close a position: sell a held asset back to the settlement token.
 *
 * Separate from `spendAsDelegate` because the contract treats it separately, and for the same
 * reason: the daily cap is denominated in the settlement token, so routing a sell through `spend`
 * would measure 0.3e18 wei of WETH against a cap of 2000e6 USDC units. Worse, it would let a
 * spending limit silence a stop-loss — and a stop a limit can silence is not a stop.
 *
 * `amount` is in the SOLD token's own units, not dollars, which is why this cannot share a
 * signature with the spend path.
 */
export async function closeAsDelegate(params: {
  owner: Address;
  token: Address;
  venue: Address;
  amount: bigint;
  data: Hex;
}): Promise<Hex> {
  const call = {
    account: delegateAccount,
    address: DELEGATION_ADDRESS,
    abi: DELEGATION_ABI,
    functionName: 'closePosition',
    args: [params.owner, params.token, params.venue, params.amount, params.data],
  } as const;
  const { request } = await publicClient.simulateContract(call);
  const gas = withHeadroom(await publicClient.estimateContractGas(call));
  return walletClient.writeContract({ ...request, gas });
}
