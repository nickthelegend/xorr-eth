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

/** Seeded with the two entries screen 20 already claims exist. */
const SEED: AllowlistEntry[] = [
  { label: 'My exchange account', address: '7xKXtg2CW3xN2b1a9pQe6nWZ5rY8vJ4kL1mD3sT6uH9c', addedAt: 0 },
  { label: 'Cold storage', address: '4bQpZ8sV1nR7yT2wE5uL9kM3aC6dF0gH8jX4vB2nQ7rS', addedAt: 0 },
];

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
    setAddresses((prev) => {
      const next = [...prev, { label, address, addedAt: Date.now() }];
      void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const pendingFor = useCallback((entry: AllowlistEntry) => !isUsable(entry), []);

  return { addresses, add, pendingFor };
}
