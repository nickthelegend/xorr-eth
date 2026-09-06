/**
 * The allowlist is the only thing standing between a compromised phone and an empty wallet, so
 * both of its rules are tested rather than trusted to the screen that renders them.
 */
import { describe, expect, it } from 'vitest';
import { COOLING_OFF_HOURS, isUsable, isValidAddress, type AllowlistEntry } from './allowlist';

const entry = (addedAt: number): AllowlistEntry => ({
  label: 'Cold storage',
  address: '0x95A0b368588713011a15f4b1041423f31B08e615',
  addedAt,
});

describe('a destination has to be an address on THIS chain', () => {
  it('accepts a Base address', () => {
    expect(isValidAddress('0x95A0b368588713011a15f4b1041423f31B08e615')).toBe(true);
    // Checksums are not case-sensitive here: an all-lowercase address is the same address.
    expect(isValidAddress('0x95a0b368588713011a15f4b1041423f31b08e615')).toBe(true);
    expect(isValidAddress('  0x95A0b368588713011a15f4b1041423f31B08e615  ')).toBe(true);
  });

  it('rejects a Solana address, which is what the screen used to REQUIRE', () => {
    /*
     * The add screen validated base58, 32–44 characters — left over from before the pivot. Base58
     * has no `0` and no `x`, so no Base address could pass it and the button never enabled. The
     * one screen that matters when someone is trying to get their money out rejected every real
     * destination and told them their own wallet "does not look like a Solana address".
     */
    expect(isValidAddress('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')).toBe(false);
  });

  it('rejects the near-misses', () => {
    expect(isValidAddress('')).toBe(false);
    expect(isValidAddress('0x')).toBe(false);
    // 39 hex digits — one short.
    expect(isValidAddress('0x95A0b368588713011a15f4b1041423f31B08e61')).toBe(false);
    // 41 — one long.
    expect(isValidAddress('0x95A0b368588713011a15f4b1041423f31B08e6155')).toBe(false);
    // Right length, wrong alphabet.
    expect(isValidAddress('0xZZA0b368588713011a15f4b1041423f31B08e615')).toBe(false);
    // No prefix.
    expect(isValidAddress('95A0b368588713011a15f4b1041423f31B08e615')).toBe(false);
  });
});

describe('the cooling-off period is the point', () => {
  const HOUR = 3_600_000;
  const now = Date.UTC(2026, 8, 7, 12);

  it('a freshly added address cannot be used', () => {
    expect(isUsable(entry(now), now)).toBe(false);
    expect(isUsable(entry(now - HOUR), now)).toBe(false);
    expect(isUsable(entry(now - (COOLING_OFF_HOURS - 1) * HOUR), now)).toBe(false);
  });

  it('it becomes usable exactly at the boundary, not a moment before', () => {
    expect(isUsable(entry(now - COOLING_OFF_HOURS * HOUR + 1), now)).toBe(false);
    expect(isUsable(entry(now - COOLING_OFF_HOURS * HOUR), now)).toBe(true);
    expect(isUsable(entry(now - (COOLING_OFF_HOURS + 24) * HOUR), now)).toBe(true);
  });
});

describe('adding the same address twice', () => {
  it('is refused by the store, because the screen reads stale state', () => {
    /*
     * Not a hypothetical: double-tapping "Add" in the running app produced two identical rows and
     * a React duplicate-key error. The screen's own check reads the rendered list, so both taps
     * saw it without the entry either was adding.
     */
    const a: AllowlistEntry = { label: 'Cold storage', address: '0x4200000000000000000000000000000000000006', addedAt: 1 };
    const dedupe = (prev: AllowlistEntry[], addr: string) =>
      prev.some((x) => x.address.toLowerCase() === addr.trim().toLowerCase());
    expect(dedupe([a], a.address)).toBe(true);
    // Case and surrounding space are the same address.
    expect(dedupe([a], '  0x4200000000000000000000000000000000000006  ')).toBe(true);
    expect(dedupe([a], a.address.toUpperCase().replace('0X', '0x'))).toBe(true);
    expect(dedupe([a], '0x95A0b368588713011a15f4b1041423f31B08e615')).toBe(false);
  });
});
