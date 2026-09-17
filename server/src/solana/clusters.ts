/**
 * Solana clusters and cluster configuration (PLAN.md §0.2, §3.1, §8.1).
 *
 * Replaces EVM chain definitions for Solana deployments.
 * Master switch: XORR_CHAIN env var (e.g. 'solana-fork', 'solana-devnet', 'solana-localnet', 'solana-mainnet').
 */

export type SolanaClusterKey = 'solana-localnet' | 'solana-devnet' | 'solana-fork' | 'solana-mainnet';

export type MoneyClass = 'real' | 'test' | 'copy';

export interface ClusterConfig {
  key: SolanaClusterKey;
  name: string;
  money: MoneyClass;
  defaultRpc: string;
  usdcMint: string;
  wsolMint: string;
  decimals: {
    usdc: number;
    sol: number;
  };
}

export const SOLANA_MINTS = {
  // Mainnet / Fork USDC
  mainnetUsdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  // Devnet USDC (Circle official)
  devnetUsdc: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  // Native Wrapped SOL
  wsol: 'So11111111111111111111111111111111111111112',
} as const;

export const CLUSTERS: Record<SolanaClusterKey, ClusterConfig> = {
  'solana-localnet': {
    key: 'solana-localnet',
    name: 'Solana Localnet',
    money: 'copy',
    defaultRpc: 'http://127.0.0.1:8899',
    usdcMint: SOLANA_MINTS.mainnetUsdc,
    wsolMint: SOLANA_MINTS.wsol,
    decimals: { usdc: 6, sol: 9 },
  },
  'solana-devnet': {
    key: 'solana-devnet',
    name: 'Solana Devnet',
    money: 'test',
    defaultRpc: 'https://api.devnet.solana.com',
    usdcMint: SOLANA_MINTS.devnetUsdc,
    wsolMint: SOLANA_MINTS.wsol,
    decimals: { usdc: 6, sol: 9 },
  },
  'solana-fork': {
    key: 'solana-fork',
    name: 'Solana Fork',
    money: 'copy',
    defaultRpc: process.env.FORK_RPC ?? process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899',
    usdcMint: SOLANA_MINTS.mainnetUsdc,
    wsolMint: SOLANA_MINTS.wsol,
    decimals: { usdc: 6, sol: 9 },
  },
  'solana-mainnet': {
    key: 'solana-mainnet',
    name: 'Solana Mainnet',
    money: 'real',
    defaultRpc: 'https://api.mainnet-beta.solana.com',
    usdcMint: SOLANA_MINTS.mainnetUsdc,
    wsolMint: SOLANA_MINTS.wsol,
    decimals: { usdc: 6, sol: 9 },
  },
};

export function isSolanaCluster(chain: string): chain is SolanaClusterKey {
  return Object.prototype.hasOwnProperty.call(CLUSTERS, chain);
}

export function activeClusterKey(): SolanaClusterKey {
  const asked = process.env.XORR_CHAIN ?? process.env.EXPO_PUBLIC_XORR_CHAIN ?? 'solana-fork';
  if (isSolanaCluster(asked)) return asked;
  return 'solana-fork';
}

export function getClusterConfig(key: SolanaClusterKey = activeClusterKey()): ClusterConfig {
  const config = CLUSTERS[key];
  if (!config) throw new Error(`Unknown Solana cluster: ${key}`);
  const rpcOverride = process.env.SOLANA_RPC_URL ?? (key === 'solana-fork' ? process.env.FORK_RPC : undefined);
  if (rpcOverride) {
    return { ...config, defaultRpc: rpcOverride };
  }
  return config;
}

export function rpcUrl(key: SolanaClusterKey = activeClusterKey()): string {
  return getClusterConfig(key).defaultRpc;
}
