/**
 * Withdrawing from Aave — the user's signature, never the bot's.
 *
 * Tier 4 supplies idle USDC and deliberately cannot take it back out. That is not an omission:
 * burning your own aTokens needs no permission from anyone, so granting the delegation the power
 * to move the receipt token would buy nothing and weaken the promise the app makes loudest — that
 * the bot cannot move your money out. The exit is one transaction from the wallet that owns it.
 *
 * The calldata is built by the executor rather than here, because the reserve's asset address is
 * read from the Pool, and a client that hardcoded it could quietly withdraw the wrong asset if
 * Aave ever migrated a reserve.
 */
import { useCallback, useState } from 'react';
import type { Address, Hex } from 'viem';
import { useGrantDelegation } from '@/auth/useGrantDelegation';
import { api } from '@/data/api';

export type YieldPosition = {
  /** What the user currently has supplied, in dollars. Rebasing, so this grows on its own. */
  suppliedUsd: number;
  apy: number;
  pool: Address;
  aToken: Address;
  asset: Address;
  /** True where Aave is actually deployed on the chain the app settles on. */
  available: boolean;
  reason?: string;
};

export function useAaveWithdraw() {
  const { sendTransaction } = useGrantDelegation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const withdraw = useCallback(
    async (usd: number): Promise<Hex> => {
      setBusy(true);
      setError(undefined);
      try {
        /*
         * The server encodes it, and returns the exact `to` and `data` this wallet should sign.
         *
         * `max` is a real case worth naming: aUSDC accrues every second, so a balance read a
         * moment ago is already stale by the time the transaction lands. Aave accepts
         * `type(uint256).max` to mean "all of it", which is the only way to actually empty the
         * position rather than leave dust behind.
         */
        const { to, data } = await api.post<{ to: Address; data: Hex }>('/yield/withdraw-calldata', {
          usd,
        });
        return await sendTransaction(to, data);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [sendTransaction],
  );

  return { withdraw, busy, error };
}
