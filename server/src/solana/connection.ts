/**
 * Solana RPC connection and explorer link helpers — PLAN.md §8.1.
 */
import { Connection } from '@solana/web3.js';
import { CLUSTER_KEY, rpcUrl } from './clusters.js';
import { assertMainnetAllowed } from './money.js';

assertMainnetAllowed();

export const connection = new Connection(rpcUrl(), 'confirmed');

export function explorerClusterSuffix(): string {
  switch (CLUSTER_KEY) {
    case 'solana-devnet':
      return '?cluster=devnet';
    case 'solana-localnet':
    case 'solana-fork':
      return '?cluster=custom&customUrl=' + encodeURIComponent(rpcUrl());
    case 'solana-mainnet':
      return '';
  }
}

export function explorerTx(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}${explorerClusterSuffix()}`;
}

export function explorerAddress(address: string): string {
  return `https://explorer.solana.com/address/${address}${explorerClusterSuffix()}`;
}
