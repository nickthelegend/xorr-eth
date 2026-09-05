/**
 * Chain configuration.
 *
 * Base is the target: 1inch routes there, and the same deployment is what goes to Base Build Camp.
 * `localnet` is an anvil fork of Base Sepolia — a real EVM running real contracts, so enforcement
 * is genuinely proven without waiting on a faucet.
 *
 * `base-fork` is an anvil fork of Base MAINNET. It is the only environment where the whole thesis
 * can actually run end to end: the real 1inch router, real USDC, real Aave, and the real Ondo
 * tokenized equities all exist there with real liquidity, and none of them exist on Sepolia. Fills
 * are genuine EVM execution against genuine pool state — the only thing that is not real is that
 * the chain is a local copy.
 */
import { base, baseSepolia, foundry } from 'viem/chains';
import type { Chain } from 'viem';
import 'dotenv/config';

export type ChainKey = 'localnet' | 'base-fork' | 'base-sepolia' | 'base';

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
  'base-fork': process.env.FORK_RPC ?? 'http://127.0.0.1:8545',
  'base-sepolia': process.env.BASE_SEPOLIA_RPC ?? 'https://sepolia.base.org',
  base: process.env.BASE_RPC ?? 'https://mainnet.base.org',
};

const CHAINS: Record<ChainKey, Chain> = {
  localnet: { ...foundry, id: baseSepolia.id, name: 'Base Sepolia (local fork)' },
  'base-fork': { ...foundry, id: base.id, name: 'Base (local mainnet fork)' },
  'base-sepolia': baseSepolia,
  base,
};

export const chain = CHAINS[CHAIN_KEY];
export const rpcUrl = RPCS[CHAIN_KEY];

/** The chain id 1inch is asked about. A local fork of Base Sepolia still quotes against Base. */
export const ONEINCH_CHAIN_ID = 8453;

/**
 * Canonical addresses, per chain.
 *
 * These used to be a single flat object of Base MAINNET addresses used on every network. On Base
 * Sepolia that meant the app asked for the balance of a USDC contract that does not exist there,
 * got back `0x`, and the whole delegation flow died on a decode error before the user could sign
 * anything. A token address is a property of a chain, not of a product.
 *
 * Circle deploys USDC to a different address on Sepolia; WETH is at the same predeploy on both.
 * cbBTC and the tokenized equities are mainnet-only, and are absent here rather than pointed at an
 * address with no code — code that reads them must handle absence, not discover it at runtime.
 */
const BASE_MAINNET_ADDRESSES = {
  /** 1inch Aggregation Router v6 — the same address across every chain it supports. */
  oneInchRouter: '0x111111125421cA6dc452d289314280a0f8842A65',
  usdcBase: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  wethBase: '0x4200000000000000000000000000000000000006',
  /** Coinbase Wrapped BTC on Base — 8 decimals, the Base-native way to hold BTC exposure. */
  cbbtcBase: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
  /** 1inch's sentinel for native ETH. */
  nativeEth: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
} as const;

const BASE_SEPOLIA_ADDRESSES = {
  // 1inch does not run on Sepolia. The address is kept so the venue allowlist has a stable shape;
  // nothing routes there on a testnet, and the executor's own tests use the fork for real fills.
  oneInchRouter: '0x111111125421cA6dc452d289314280a0f8842A65',
  /** Circle's USDC on Base Sepolia — a different deployment from mainnet. */
  usdcBase: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  /** WETH is the same predeploy on every OP-stack chain. */
  wethBase: '0x4200000000000000000000000000000000000006',
  cbbtcBase: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
  nativeEth: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
} as const;

export const ADDRESSES =
  CHAIN_KEY === 'base-sepolia' ? BASE_SEPOLIA_ADDRESSES : BASE_MAINNET_ADDRESSES;

/** True where the tokenized equities and Aqua actually exist. */
export const IS_BASE_MAINNET_STATE = CHAIN_KEY === 'base' || CHAIN_KEY === 'base-fork';

export function explorerTx(hash: string): string {
  // A fork shares mainnet's history up to the fork block, so an explorer link is right for a
  // pre-fork tx and wrong for one we just mined. Label it rather than link to a 404.
  if (CHAIN_KEY === 'base-fork') return `fork:${hash}`;
  if (CHAIN_KEY === 'base') return `https://basescan.org/tx/${hash}`;
  if (CHAIN_KEY === 'base-sepolia') return `https://sepolia.basescan.org/tx/${hash}`;
  return `local:${hash}`;
}
