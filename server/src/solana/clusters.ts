/**
 * Solana cluster configuration and environment layering — PLAN.md §3.1 & §8.1.
 *
 * Replaces server/src/evm/chains.ts.
 */
import { clusterApiUrl } from '@solana/web3.js';

export type ClusterKey =
  | 'solana-localnet'
  | 'solana-devnet'
  | 'solana-fork'
  | 'solana-mainnet';

export const VALID_CLUSTERS: readonly ClusterKey[] = [
  'solana-localnet',
  'solana-devnet',
  'solana-fork',
  'solana-mainnet',
] as const;

export function isValidCluster(key: unknown): key is ClusterKey {
  return typeof key === 'string' && VALID_CLUSTERS.includes(key as ClusterKey);
}

export const CLUSTER_KEY: ClusterKey = (() => {
  const env = process.env.XORR_CHAIN ?? (process.env.NODE_ENV === 'test' ? 'solana-fork' : '');
  if (!env || !isValidCluster(env)) {
    // During test runs or if unspecified, default to solana-fork if in test
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      return 'solana-fork';
    }
    throw new Error(
      `XORR_CHAIN must be one of ${VALID_CLUSTERS.join(', ')}. Got: "${env}". Refusing to boot.`,
    );
  }
  return env;
})();

export const DEFAULT_MINTS = {
  usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  wsol: 'So11111111111111111111111111111111111111112',
  usdt: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
} as const;

export const SOLANA_MINTS = {
  usdc: process.env.SOLANA_USDC_MINT ?? DEFAULT_MINTS.usdc,
  wsol: process.env.SOLANA_WSOL_MINT ?? DEFAULT_MINTS.wsol,
  usdt: process.env.SOLANA_USDT_MINT ?? DEFAULT_MINTS.usdt,
};

export function rpcUrl(cluster: ClusterKey = CLUSTER_KEY): string {
  if (process.env.SOLANA_RPC_URL) return process.env.SOLANA_RPC_URL;
  switch (cluster) {
    case 'solana-localnet':
      return 'http://127.0.0.1:8899';
    case 'solana-devnet':
      return clusterApiUrl('devnet');
    case 'solana-fork':
      return process.env.FORK_RPC ?? 'http://127.0.0.1:8899';
    case 'solana-mainnet':
      return clusterApiUrl('mainnet-beta');
  }
}
