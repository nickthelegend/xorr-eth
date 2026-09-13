/**
 * The venues a grant names (PLAN.md 3.1).
 *
 * `SETTLEMENT_VENUES` is what the app asks the user to sign and what the safety screen shows. The SwapVM book
 * was missing from it, so no grant made through the app could ever reach the venue settlement tries second.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const BOOK = '0x74e1283711106a5844eb20760c7cb6405933c54f';
const PROGRAMS = '0x2fbae90b836545d6a0cb947ff701c27d7b627bd1';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const venues = async () => (await import('./chains.js')).SETTLEMENT_VENUES.map((v) => v.toLowerCase());

describe('the venues a grant names', () => {
  it('include both books when this deployment has them, after the aggregator', async () => {
    vi.stubEnv('XORR_CHAIN', 'base-fork');
    vi.stubEnv('AQUA_BOOK_ADDRESS', BOOK);
    vi.stubEnv('SWAPVM_BOOK_ADDRESS', PROGRAMS);
    const list = await venues();
    expect(list).toContain(BOOK);
    expect(list).toContain(PROGRAMS);
    expect(list[0]).toBe('0x111111125421ca6dc452d289314280a0f8842a65');
  });

  it('leave out a book that is not configured, or not an address', async () => {
    vi.stubEnv('XORR_CHAIN', 'base-fork');
    vi.stubEnv('AQUA_BOOK_ADDRESS', '');
    vi.stubEnv('SWAPVM_BOOK_ADDRESS', 'not-an-address');
    const list = await venues();
    expect(list).not.toContain(BOOK);
    expect(list.some((v) => v === 'not-an-address')).toBe(false);
  });
});
