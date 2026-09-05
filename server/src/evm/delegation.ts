/**
 * The delegation adapter — reads and writes XorrDelegation.
 *
 * The chain is the source of truth for what the bot may spend. Our database caches it for display,
 * and every enforcement decision re-reads the contract rather than trusting that cache.
 */
import { parseUnits, formatUnits, type Address, type Hex } from 'viem';
import { publicClient, walletClient, delegateAccount } from './client.js';
import { ADDRESSES } from './chains.js';
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
export async function spendAsDelegate(params: {
  owner: Address;
  token?: Address;
  venue?: Address;
  usd: number;
  data: Hex;
}): Promise<Hex> {
  const { request } = await publicClient.simulateContract({
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
  });
  return walletClient.writeContract(request);
}

export const delegatePublicKey = delegateAccount.address;
