/**
 * Solana SPL Token Delegation seam (PLAN.md §0.1, §6, §8.1).
 *
 * Replaces EVM XorrDelegation with native SPL Token approve / revoke / delegate transfer.
 */
import {
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  createApproveInstruction,
  createRevokeInstruction,
  createTransferInstruction,
  getAccount,
} from '@solana/spl-token';
import { ataFor, toPublicKey } from './balances.js';
import { getConnection } from './connection.js';
import { getClusterConfig } from './clusters.js';

export interface DelegationState {
  hasDelegate: boolean;
  delegate: string | null;
  delegatedAmount: bigint;
  delegatedUsd: number;
  balanceUsd: number;
}

/**
 * Builds an SPL Token `approve` instruction that sets the delegate and delegated_amount.
 */
export function buildApproveInstruction(params: {
  owner: string | PublicKey;
  delegate: string | PublicKey;
  amountUnits: bigint;
  mint?: string | PublicKey;
}): TransactionInstruction {
  const ownerPk = toPublicKey(params.owner);
  const delegatePk = toPublicKey(params.delegate);
  const ata = ataFor(ownerPk, params.mint);

  return createApproveInstruction(
    ata,
    delegatePk,
    ownerPk,
    params.amountUnits,
  );
}

/**
 * Builds an SPL Token `revoke` instruction that clears the delegate.
 */
export function buildRevokeInstruction(params: {
  owner: string | PublicKey;
  mint?: string | PublicKey;
}): TransactionInstruction {
  const ownerPk = toPublicKey(params.owner);
  const ata = ataFor(ownerPk, params.mint);

  return createRevokeInstruction(
    ata,
    ownerPk,
  );
}

/**
 * Builds an SPL Token transfer instruction spending as the delegate.
 */
export function buildSpendAsDelegateInstruction(params: {
  owner: string | PublicKey;
  delegate: string | PublicKey;
  destination: string | PublicKey;
  amountUnits: bigint;
  mint?: string | PublicKey;
}): TransactionInstruction {
  const ownerPk = toPublicKey(params.owner);
  const delegatePk = toPublicKey(params.delegate);
  const destinationPk = toPublicKey(params.destination);
  const sourceAta = ataFor(ownerPk, params.mint);
  const destinationAta = ataFor(destinationPk, params.mint);

  return createTransferInstruction(
    sourceAta,
    destinationAta,
    delegatePk, // delegate signs as authority
    params.amountUnits,
  );
}

/**
 * Reads the SPL Token delegation status from the owner's ATA.
 */
export async function readDelegation(
  owner: string | PublicKey,
  mint?: string | PublicKey,
): Promise<DelegationState> {
  const ownerPk = toPublicKey(owner);
  const ata = ataFor(ownerPk, mint);
  const conn = getConnection();
  const decimals = getClusterConfig().decimals.usdc;

  try {
    const account = await getAccount(conn, ata);
    const balanceUsd = Number(account.amount) / Math.pow(10, decimals);
    const delegatedAmount = account.delegatedAmount;
    const delegatedUsd = Number(delegatedAmount) / Math.pow(10, decimals);
    const delegate = account.delegate ? account.delegate.toBase58() : null;

    return {
      hasDelegate: delegate !== null && delegatedAmount > 0n,
      delegate,
      delegatedAmount,
      delegatedUsd,
      balanceUsd,
    };
  } catch {
    return {
      hasDelegate: false,
      delegate: null,
      delegatedAmount: 0n,
      delegatedUsd: 0,
      balanceUsd: 0,
    };
  }
}
