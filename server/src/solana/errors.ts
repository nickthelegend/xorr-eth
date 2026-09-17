/**
 * Solana humanFailure error mapping — PLAN.md §8.3.
 */

export function mapSolanaError(error: unknown): { error: string; raw: string } {
  const raw = error instanceof Error ? error.message : String(error);

  if (raw.includes('Attempt to debit an account but found no record of a prior credit') || raw.includes('insufficient lamports')) {
    return { error: 'Insufficient SOL to pay for transaction fees.', raw };
  }
  if (raw.includes('insufficient funds') || raw.includes('Insufficient funds')) {
    return { error: 'Insufficient balance to complete the trade.', raw };
  }
  if (raw.includes('account is not rent exempt')) {
    return { error: 'Token account requires rent exemption.', raw };
  }
  if (raw.includes('custom program error: 0x1') || raw.includes('custom program error: 0x6')) {
    return { error: 'Delegation authority was exceeded or invalid.', raw };
  }
  if (raw.includes('blockhash not found') || raw.includes('BlockhashNotFound')) {
    return { error: 'Network transaction timed out or blockhash expired. Retry.', raw };
  }
  if (raw.includes('Network request failed') || raw.includes('fetch failed')) {
    return { error: 'Solana RPC network request failed.', raw };
  }

  return { error: raw.length > 200 ? `${raw.slice(0, 200)}...` : raw, raw };
}
