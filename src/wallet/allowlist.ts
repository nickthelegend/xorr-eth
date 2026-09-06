/**
 * The withdrawal allowlist — PLAN.md §3.4 / 12.21.
 *
 * "Withdrawals go only to a user-allowlisted destination with a cooling-off period."
 * The cooling-off is the whole point: a stolen phone cannot add an address and drain the wallet in
 * the same session.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const COOLING_OFF_HOURS = 24;
const KEY = 'xorr-allowlist';

export type AllowlistEntry = { label: string; address: string; addedAt: number };

/**
 * Empty until the user adds one.
 *
 * This was seeded with two addresses the design handoff had invented — and they were base58 Solana
 * addresses, left over from before the pivot, on a screen that describes them as the only places
 * funds may go. Two problems, either of which is disqualifying: they were fabricated, and on Base
 * they are not addresses at all. A user reading "Cold storage · Active" would reasonably believe
 * they had configured a destination they never chose.
 *
 * A new user's allowlist is empty. That is the honest state and the screen has an empty state for
 * it, which is a great deal better than two fake entries marked Active.
 */
const SEED: AllowlistEntry[] = [];

/**
 * A destination has to be an address on this chain.
 *
 * The add flow accepted any string. An allowlist whose entries cannot receive anything is not a
 * safety feature, it is a list — and the one moment it matters is the moment someone is trying to
 * get their money out.
 */
export function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address.trim());
}

export function isUsable(entry: AllowlistEntry, now: number = Date.now()): boolean {
  return now - entry.addedAt >= COOLING_OFF_HOURS * 3600_000;
}

export function useAllowlist() {
  const [addresses, setAddresses] = useState<AllowlistEntry[]>(SEED);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setAddresses(JSON.parse(raw) as AllowlistEntry[]);
      })
      .catch(() => undefined);
  }, []);

  const add = useCallback((label: string, address: string) => {
    if (!isValidAddress(address)) {
      throw new Error('That is not a Base address. It should start 0x and be 42 characters.');
    }
    const clean = address.trim();
    setAddresses((prev) => {
      /*
       * The duplicate check belongs HERE, where `prev` is authoritative.
       *
       * The screen checks too, and cannot be trusted to: it reads the rendered `addresses`, so two
       * taps in the same tick both see the list without the entry either of them is adding. Double
       * tapping "Add" produced two identical rows, a React duplicate-key error, and an allowlist
       * that disagreed with itself about how many destinations the user had approved.
       *
       * Returning `prev` unchanged also means a second press cannot restart the cooling-off clock
       * on an address already waiting — which would otherwise be a way to keep an entry pending
       * forever by accident.
       */
      if (prev.some((a) => a.address.toLowerCase() === clean.toLowerCase())) return prev;
      const next = [...prev, { label, address: clean, addedAt: Date.now() }];
      void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const pendingFor = useCallback((entry: AllowlistEntry) => !isUsable(entry), []);

  return { addresses, add, pendingFor };
}
