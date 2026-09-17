/**
 * SPL Token delegation layer — PLAN.md §6 & §8.1.
 *
 * Implements non-custody via SPL Token approve/revoke delegation.
 * The SPL Token program is the final, authoritative cap and kill switch.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  createApproveInstruction,
  createRevokeInstruction,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { connection as defaultConnection } from './connection.js';
import { SOLANA_MINTS } from './clusters.js';
import { ataFor } from './balances.js';

export type DelegationState = {
  delegate: string | null;
  delegatedUnits: bigint;
  delegatedUsd: number;
  amountUnits: bigint;
  amountUsd: number;
  expiresAt?: number;
  revoked?: boolean;
};

export function usdToBaseUnits(usd: number, decimals: number = 6): bigint {
  return BigInt(Math.floor(usd * 10 ** decimals));
}

export function baseUnitsToUsd(units: bigint, decimals: number = 6): number {
  return Number(units) / 10 ** decimals;
}

/**
 * Reads on-chain delegation state for an owner's USDC ATA.
 */
export async function readDelegation(
  owner: PublicKey | string,
  conn: Connection = defaultConnection,
  programId: PublicKey = TOKEN_PROGRAM_ID,
): Promise<DelegationState | null> {
  const ownerPk = typeof owner === 'string' ? new PublicKey(owner) : owner;
  const ata = ataFor(ownerPk, SOLANA_MINTS.usdc, programId);

  try {
    const acc = await getAccount(conn, ata, 'confirmed', programId);
    const delegatedUnits = acc.delegatedAmount;
    const delegatedUsd = baseUnitsToUsd(delegatedUnits, 6);
    const amountUnits = acc.amount;
    const amountUsd = baseUnitsToUsd(amountUnits, 6);

    return {
      delegate: acc.delegate ? acc.delegate.toBase58() : null,
      delegatedUnits,
      delegatedUsd,
      amountUnits,
      amountUsd,
      revoked: !acc.delegate || delegatedUnits === 0n,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('could not find account') || msg.includes('TokenAccountNotFoundError')) {
      return null;
    }
    throw err;
  }
}

/**
 * Approves a delegate authority up to amountUnits.
 * Signed by the owner.
 */
export async function approveDelegate(
  ownerKeypair: Keypair,
  delegatePubkey: PublicKey,
  amountUnits: bigint,
  conn: Connection = defaultConnection,
  programId: PublicKey = TOKEN_PROGRAM_ID,
): Promise<string> {
  const ata = ataFor(ownerKeypair.publicKey, SOLANA_MINTS.usdc, programId);
  const ix = createApproveInstruction(
    ata,
    delegatePubkey,
    ownerKeypair.publicKey,
    amountUnits,
    [],
    programId,
  );
  const tx = new Transaction().add(ix);
  return await sendAndConfirmTransaction(conn, tx, [ownerKeypair], {
    commitment: 'confirmed',
  });
}

/**
 * Revokes delegation immediately on-chain (The Kill Switch!).
 * Signed by the owner.
 */
export async function revokeDelegate(
  ownerKeypair: Keypair,
  conn: Connection = defaultConnection,
  programId: PublicKey = TOKEN_PROGRAM_ID,
): Promise<string> {
  const ata = ataFor(ownerKeypair.publicKey, SOLANA_MINTS.usdc, programId);
  const ix = createRevokeInstruction(
    ata,
    ownerKeypair.publicKey,
    [],
    programId,
  );
  const tx = new Transaction().add(ix);
  return await sendAndConfirmTransaction(conn, tx, [ownerKeypair], {
    commitment: 'confirmed',
  });
}

/**
 * Spends delegated funds (Option 6.2-A).
 * Signed by the delegate, spending up to delegatedAmount.
 */
export async function spendAsDelegate(
  ownerPubkey: PublicKey,
  destinationAta: PublicKey,
  amountUnits: bigint,
  delegateKeypair: Keypair,
  conn: Connection = defaultConnection,
  programId: PublicKey = TOKEN_PROGRAM_ID,
): Promise<string> {
  const sourceAta = ataFor(ownerPubkey, SOLANA_MINTS.usdc, programId);
  const ix = createTransferInstruction(
    sourceAta,
    destinationAta,
    delegateKeypair.publicKey,
    amountUnits,
    [],
    programId,
  );
  const tx = new Transaction().add(ix);
  return await sendAndConfirmTransaction(conn, tx, [delegateKeypair], {
    commitment: 'confirmed',
  });
}
