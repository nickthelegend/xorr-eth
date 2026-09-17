/**
 * Solana Connection and Explorer helpers (PLAN.md §0.2, §8.1).
 */
import { Connection } from '@solana/web3.js';
import { activeClusterKey, getClusterConfig, rpcUrl, type SolanaClusterKey } from './clusters.js';

let cachedConnection: Connection | undefined;
let cachedRpc: string | undefined;

export function getConnection(target?: string | SolanaClusterKey): Connection {
  const cluster = typeof target === 'string' && target.startsWith('solana-')
    ? (target as SolanaClusterKey)
    : activeClusterKey();
  const config = getClusterConfig(cluster);

  if (config.money === 'real' && process.env.ALLOW_MAINNET !== 'yes') {
    throw new Error('Solana mainnet requires ALLOW_MAINNET=yes to operate with real funds.');
  }

  const endpoint = (typeof target === 'string' && !target.startsWith('solana-')) ? target : rpcUrl(cluster);

  if (cachedConnection && cachedRpc === endpoint) {
    return cachedConnection;
  }

  cachedConnection = new Connection(endpoint, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 30_000,
  });
  cachedRpc = endpoint;
  return cachedConnection;
}

export function explorerTx(signature: string, cluster: SolanaClusterKey = activeClusterKey()): string {
  const config = getClusterConfig(cluster);
  if (config.key === 'solana-mainnet') {
    return `https://explorer.solana.com/tx/${signature}`;
  }
  if (config.key === 'solana-devnet') {
    return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
  }
  // Fork or localnet: use custom RPC parameter
  const rpc = encodeURIComponent(config.defaultRpc);
  return `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${rpc}`;
}

export function explorerAddress(address: string, cluster: SolanaClusterKey = activeClusterKey()): string {
  const config = getClusterConfig(cluster);
  if (config.key === 'solana-mainnet') {
    return `https://explorer.solana.com/address/${address}`;
  }
  if (config.key === 'solana-devnet') {
    return `https://explorer.solana.com/address/${address}?cluster=devnet`;
  }
  const rpc = encodeURIComponent(config.defaultRpc);
  return `https://explorer.solana.com/address/${address}?cluster=custom&customUrl=${rpc}`;
}
