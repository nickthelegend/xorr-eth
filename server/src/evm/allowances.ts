/**
 * Who may pull a token from this wallet, and how much (PLAN.md 3.12).
 *
 * Two spenders matter. The delegation contract is the one the app asks the user to approve, so the executor can
 * trade inside the cap. The 1inch router is the one the app never needs approved — the delegation approves it for
 * exactly one trade and resets it to zero — so an allowance from the wallet to the router was granted somewhere
 * else, and is worth seeing and taking back. On Base the router and its allowances come from 1inch's own Approve
 * API; anywhere else from the chain.
 */
import { erc20Abi, formatUnits, type Address } from 'viem';
import { publicClient } from './client.js';
import { ADDRESSES, CHAIN_KEY } from './chains.js';
import { oneinchApi } from '../venues/oneinch.js';

const MAX = (1n << 256n) - 1n;

export type TokenAllowance = {
  symbol: string;
  address: Address;
  decimals: number;
  /** The exact uint256, as a decimal string. Null when it could not be read. */
  allowance: string | null;
  display: string | null;
  unlimited: boolean;
  none: boolean;
  /** The read failed. Said so, rather than shown as "None" — an allowance nobody could read is not no allowance. */
  unread: boolean;
};

export function allowanceView(
  token: { symbol: string; address: Address; decimals: number },
  raw: bigint | undefined,
): TokenAllowance {
  return {
    ...token,
    allowance: raw === undefined ? null : raw.toString(),
    display: raw === undefined ? null : formatUnits(raw, token.decimals),
    unlimited: raw === MAX,
    none: raw === 0n,
    unread: raw === undefined,
  };
}

/** An allowance read from the token contract; undefined when the read failed. */
export async function chainAllowance(token: Address, owner: Address, spender: Address): Promise<bigint | undefined> {
  return publicClient
    .readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender] })
    .catch(() => undefined);
}

/** The 1inch router, and where its allowances are read from on this chain. */
export async function routerSpender(): Promise<{ address: Address; source: '1inch' | 'chain' }> {
  if (CHAIN_KEY === 'base') {
    const r = await oneinchApi<{ address: string }>('/swap/v6.0/8453/approve/spender', 3_600_000);
    return { address: r.address as Address, source: '1inch' };
  }
  return { address: ADDRESSES.oneInchRouter, source: 'chain' };
}

/** The wallet's allowance to the router — from 1inch's Approve API or the chain, as `routerSpender` said. */
export async function routerAllowance(
  token: Address,
  owner: Address,
  source: '1inch' | 'chain',
  router: Address,
): Promise<bigint | undefined> {
  if (source === '1inch') {
    return oneinchApi<{ allowance: string }>(
      `/swap/v6.0/8453/approve/allowance?tokenAddress=${token}&walletAddress=${owner}`,
      10_000,
    )
      .then((r) => BigInt(r.allowance))
      .catch(() => undefined);
  }
  return chainAllowance(token, owner, router);
}
