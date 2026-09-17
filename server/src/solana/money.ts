/**
 * Money semantics per Solana cluster — PLAN.md §3.1, §8.1 & §15.
 *
 * Distinguishes real money from test/copy funds and guards mainnet-beta execution.
 */
import { CLUSTER_KEY, type ClusterKey, SOLANA_MINTS } from './clusters.js';

export type MoneyClass = 'real' | 'test' | 'copy';

export type MoneyFacts = {
  class: MoneyClass;
  settlementMint: string;
  settlementSymbol: string;
  settlementDecimals: number;
  solDecimals: number;
  stockDecimals: number;
  faucetAllowed: boolean;
};

export const FACTS: Record<ClusterKey, MoneyFacts> = {
  'solana-localnet': {
    class: 'copy',
    settlementMint: SOLANA_MINTS.usdc,
    settlementSymbol: 'USDC',
    settlementDecimals: 6,
    solDecimals: 9,
    stockDecimals: 8,
    faucetAllowed: true,
  },
  'solana-devnet': {
    class: 'test',
    settlementMint: SOLANA_MINTS.usdc,
    settlementSymbol: 'USDC',
    settlementDecimals: 6,
    solDecimals: 9,
    stockDecimals: 8,
    faucetAllowed: true,
  },
  'solana-fork': {
    class: 'copy',
    settlementMint: SOLANA_MINTS.usdc,
    settlementSymbol: 'USDC',
    settlementDecimals: 6,
    solDecimals: 9,
    stockDecimals: 8,
    faucetAllowed: true,
  },
  'solana-mainnet': {
    class: 'real',
    settlementMint: SOLANA_MINTS.usdc,
    settlementSymbol: 'USDC',
    settlementDecimals: 6,
    solDecimals: 9,
    stockDecimals: 8,
    faucetAllowed: false,
  },
};

export const CURRENT_FACTS = FACTS[CLUSTER_KEY];

// Mainnet guard invariant: server refuses to boot against real mainnet without ALLOW_MAINNET=yes
export function assertMainnetAllowed(): void {
  if (CURRENT_FACTS.class === 'real' && process.env.ALLOW_MAINNET !== 'yes') {
    throw new Error(
      'Cluster solana-mainnet holds real funds. Set ALLOW_MAINNET=yes to boot.',
    );
  }
}
