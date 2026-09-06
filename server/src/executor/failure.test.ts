/**
 * What the user is told when a trade does not go through.
 *
 * This table used to map Solana Anchor program codes, which cannot occur on an EVM chain, so every
 * real revert fell through to "the transaction did not go through" — the one message that tells a
 * user nothing about whether their money is safe or their limits worked.
 */
import { describe, expect, it } from 'vitest';
import { humanFailure } from './failure.js';

describe('revert reasons, in plain language', () => {
  it('names the daily cap when the cap is what stopped it', () => {
    expect(humanFailure('execution reverted: custom error 0x3e814127')).toMatch(/cap is used up/i);
  });

  it('names revocation, which is the user asking it to stop', () => {
    expect(humanFailure('reverted with signature 0x430f7460')).toMatch(/revoked/i);
  });

  it('names the venue allowlist', () => {
    expect(humanFailure('execution reverted: custom error 0x2114fba2')).toMatch(/allowlist/i);
  });

  it('reads a decoded error name when the RPC gives one', () => {
    expect(humanFailure('Error: DailyCapExceeded(1000, 500)')).toMatch(/cap is used up/i);
  });

  it('does not confuse one selector for another that shares a prefix', () => {
    // 0x1db3b859 (NotDelegate) and 0x1f2a2005 (ZeroAmount) both begin 0x1; a substring match here
    // would tell a user their permission was wrong when the size was.
    expect(humanFailure('custom error 0x1f2a2005')).toMatch(/zero/i);
    expect(humanFailure('custom error 0x1db3b859')).toMatch(/not the one you gave permission/i);
  });

  it('explains a testnet that cannot settle, rather than blaming the trade', () => {
    expect(humanFailure('Cannot fill on base-sepolia: 1inch has no deployment there.')).toMatch(
      /cannot settle/i,
    );
  });

  it('falls back to something true rather than something specific and wrong', () => {
    expect(humanFailure('some upstream nonsense')).toBe(
      'The transaction did not go through, so nothing was placed.',
    );
  });
});
