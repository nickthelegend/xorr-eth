/**
 * Solana balance and Associated Token Account (ATA) readers — PLAN.md §8.1.
 */
import { PublicKey } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { connection } from './connection.js';
import { SOLANA_MINTS } from './clusters.js';

export function ataFor(
  owner: PublicKey | string,
  mint: PublicKey | string,
  programId: PublicKey = TOKEN_PROGRAM_ID,
): PublicKey {
  const ownerPk = typeof owner === 'string' ? new PublicKey(owner) : owner;
  const mintPk = typeof mint === 'string' ? new PublicKey(mint) : mint;
  return getAssociatedTokenAddressSync(mintPk, ownerPk, true, programId);
}

export type TokenBalance = {
  uiAmount: number;
  amount: bigint;
  decimals: number;
};

export async function getTokenAccountBalance(
  ata: PublicKey | string,
): Promise<TokenBalance | null> {
  const ataPk = typeof ata === 'string' ? new PublicKey(ata) : ata;
  try {
    const res = await connection.getTokenAccountBalance(ataPk);
    return {
      uiAmount: res.value.uiAmount ?? 0,
      amount: BigInt(res.value.amount),
      decimals: res.value.decimals,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('could not find account') || msg.includes('Invalid param: could not find account')) {
      return { uiAmount: 0, amount: 0n, decimals: 6 };
    }
    return null;
  }
}

export async function getSolBalance(owner: PublicKey | string): Promise<number> {
  const ownerPk = typeof owner === 'string' ? new PublicKey(owner) : owner;
  try {
    const lamports = await connection.getBalance(ownerPk);
    return lamports / 1e9;
  } catch {
    return 0;
  }
}

export async function getUsdcBalance(owner: PublicKey | string): Promise<number> {
  const ata = ataFor(owner, SOLANA_MINTS.usdc, TOKEN_PROGRAM_ID);
  const bal = await getTokenAccountBalance(ata);
  return bal?.uiAmount ?? 0;
}
