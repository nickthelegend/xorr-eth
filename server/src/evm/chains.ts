/**
 * Chain configuration.
 *
 * Base is the target: 1inch routes there, and the same deployment is what goes to Base Build Camp.
 * `localnet` is an anvil fork of Base Sepolia — a real EVM running real contracts, so enforcement
 * is genuinely proven without waiting on a faucet.
 */
import { base, baseSepolia, foundry } from 'viem/chains';
import type { Chain } from 'viem';
import 'dotenv/config';

export type ChainKey = 'localnet' | 'base-sepolia' | 'base';

// Named XORR_CHAIN, not CHAIN: Foundry auto-loads .env and treats CHAIN as its own --chain
// flag, which makes every cast/forge command in this repo fail with a confusing parse error.
export const CHAIN_KEY = (process.env.XORR_CHAIN ?? 'localnet') as ChainKey;

/** Guardrail: mainnet needs a deliberate, reviewed decision, never a default. */
if (CHAIN_KEY === 'base' && process.env.ALLOW_MAINNET !== 'yes') {
  throw new Error(
    'Refusing to start against Base mainnet. Set ALLOW_MAINNET=yes only with a deliberate decision.',
  );
}

const RPCS: Record<ChainKey, string> = {
  localnet: process.env.LOCAL_RPC ?? 'http://127.0.0.1:8545',
  'base-sepolia': process.env.BASE_SEPOLIA_RPC ?? 'https://sepolia.base.org',
  base: process.env.BASE_RPC ?? 'https://mainnet.base.org',
};

const CHAINS: Record<ChainKey, Chain> = {
  localnet: { ...foundry, id: baseSepolia.id, name: 'Base Sepolia (local fork)' },
  'base-sepolia': baseSepolia,
  base,
};

export const chain = CHAINS[CHAIN_KEY];
export const rpcUrl = RPCS[CHAIN_KEY];

/** The chain id 1inch is asked about. A local fork of Base Sepolia still quotes against Base. */
export const ONEINCH_CHAIN_ID = 8453;

/** Canonical addresses. */
export const ADDRESSES = {
  /** 1inch Aggregation Router v6 — the same address across every chain it supports. */
  oneInchRouter: '0x111111125421cA6dc452d289314280a0f8842A65' as const,
  /** USDC on Base. */
  usdcBase: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const,
  /** WETH on Base. */
  wethBase: '0x4200000000000000000000000000000000000006' as const,
  /** 1inch's sentinel for native ETH. */
  nativeEth: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as const,
};

export function explorerTx(hash: string): string {
  if (CHAIN_KEY === 'base') return `https://basescan.org/tx/${hash}`;
  if (CHAIN_KEY === 'base-sepolia') return `https://sepolia.basescan.org/tx/${hash}`;
  return `local:${hash}`;
}
