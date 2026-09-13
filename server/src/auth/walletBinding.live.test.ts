/**
 * A wallet row is never moved from one user to another — against a real Postgres.
 *
 * LIVE because it writes to the database at DATABASE_URL: `LIVE=1 npx vitest run walletBinding.live`.
 * It uses addresses and user ids it generates itself and deletes exactly those rows afterwards.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { getAddress } from 'viem';
import { pool, query } from '../db/index.js';
import { bindWallet } from './walletBinding.js';

const address = getAddress(`0x${randomBytes(20).toString('hex')}`);
const alice = `did:privy:live-test-${randomUUID()}`;
const mallory = `did:privy:live-test-${randomUUID()}`;

afterAll(async () => {
  await query(`DELETE FROM wallets WHERE address = $1`, [address]);
  await pool.end();
});

describe('bindWallet', () => {
  it('inserts a wallet the first time and reports it as new', async () => {
    const first = await bindWallet({ id: randomUUID(), userId: alice, address, kind: 'embedded', cluster: 'live-test' });
    expect(first.status).toBe('bound');
    expect(first.status === 'bound' && first.inserted).toBe(true);
  });

  it('touches the same row for the same user, and says it was not new', async () => {
    const again = await bindWallet({ id: randomUUID(), userId: alice, address, kind: 'embedded', cluster: 'live-test' });
    expect(again.status).toBe('bound');
    expect(again.status === 'bound' && again.inserted).toBe(false);
  });

  it('refuses to move the row to a different user — the takeover', async () => {
    const taken = await bindWallet({ id: randomUUID(), userId: mallory, address, kind: 'connected', cluster: 'live-test' });
    expect(taken.status).toBe('owned_by_another_user');
    const rows = await query<{ user_id: string; kind: string }>(`SELECT user_id, kind FROM wallets WHERE address = $1`, [
      address,
    ]);
    expect(rows).toEqual([{ user_id: alice, kind: 'embedded' }]);
  });
});
