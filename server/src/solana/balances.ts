/**
 * Solana balance reads: Associated Token Account (ATA) for USDC + native SOL (PLAN.md §8.1).
 */
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, getAccount, TokenAccountNotFoundError, TokenInvalidAccountOwnerError } from '@solana/spl-token';
import { getConnection } from './connection.js';
import { getClusterConfig } from './clusters.js';

export interface TokenBalance {
  amount: number;
  raw: bigint;
  decimals: number;
}

export interface SolBalance {
  amount: number;
  lamports: bigint;
}

export interface WalletBalances {
  owner: string;
  usdc: TokenBalance;
  sol: SolBalance;
  usdcAta: string;
}

export function toPublicKey(key: string | PublicKey): PublicKey {
  if (typeof key === 'string') {
    return new PublicKey(key);
  }
  return key;
}

/** Compute the Associated Token Address (ATA) for an owner and mint. */
export function ataFor(owner: string | PublicKey, mint?: string | PublicKey): PublicKey {
  const ownerPk = toPublicKey(owner);
  const mintPk = mint ? toPublicKey(mint) : new PublicKey(getClusterConfig().usdcMint);
  return getAssociatedTokenAddressSync(mintPk, ownerPk);
}

/**
 * Reads token account balance for an owner and mint.
 * If the account does not exist or has zero balance, returns zeros rather than throwing.
 */
export async function readTokenBalance(
  owner: string | PublicKey,
  mint?: string | PublicKey,
  conn?: Connection,
): Promise<TokenBalance> {
  const connection = conn ?? getConnection();
  const mintPk = mint ? toPublicKey(mint) : new PublicKey(getClusterConfig().usdcMint);
  const ata = ataFor(owner, mintPk);

  try {
    const account = await getAccount(connection, ata);
    const decimals = getClusterConfig().decimals.usdc;
    const amount = Number(account.amount) / Math.pow(10, decimals);
    return {
      amount,
      raw: account.amount,
      decimals,
    };
  } catch (error: unknown) {
    if (error instanceof TokenAccountNotFoundError || error instanceof TokenInvalidAccountOwnerError) {
      return {
        amount: 0,
        raw: 0n,
        decimals: getClusterConfig().decimals.usdc,
      };
    }
    // Check if error message mentions could not find account
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('could not find account') || msg.includes('Account does not exist')) {
      return {
        amount: 0,
        raw: 0n,
        decimals: getClusterConfig().decimals.usdc,
      };
    }
    throw error;
  }
}

/**
 * Reads native SOL balance for an owner.
 */
export async function readSolBalance(
  owner: string | PublicKey,
  conn?: Connection,
): Promise<SolBalance> {
  const connection = conn ?? getConnection();
  const ownerPk = toPublicKey(owner);
  const lamports = await connection.getBalance(ownerPk);
  return {
    amount: lamports / LAMPORTS_PER_SOL,
    lamports: BigInt(lamports),
  };
}

/**
 * Reads both USDC ATA balance and native SOL balance for an owner.
 */
export async function readSolanaBalances(
  owner: string | PublicKey,
  conn?: Connection,
): Promise<WalletBalances> {
  const connection = conn ?? getConnection();
  const ownerPk = toPublicKey(owner);
  const [usdc, sol] = await Promise.all([
    readTokenBalance(ownerPk, undefined, connection),
    readSolBalance(ownerPk, connection),
  ]);

  return {
    owner: ownerPk.toBase58(),
    usdc,
    sol,
    usdcAta: ataFor(ownerPk).toBase58(),
  };
}
