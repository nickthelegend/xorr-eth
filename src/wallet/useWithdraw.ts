/**
 * Moving money OUT — signed by the user, never by us.
 *
 * The Send screen used to say withdrawals were not enabled because "the executor has no
 * transfer-out path". Half of that was a bug (it also claimed the executor held the key, which it
 * has never done since the Privy pivot) and half of it was the design working: an executor that
 * can move funds out is a custodian, and the whole product is an argument against being one.
 *
 * So the withdrawal is not a route to build — it is a transaction the OWNER signs with their own
 * embedded wallet, exactly like the grant. No server involvement, no delegation, no cap: this is
 * the user's own money leaving on their own signature, which is the one power the bot was never
 * given.
 *
 * The allowlist and its cooling-off period are the only gate, and they are enforced here rather
 * than trusted to the screen: a destination that is not on the list, or is still cooling off, is
 * refused before anything is signed.
 */
import { useCallback, useState } from 'react';
import type { Address, Hex } from 'viem';
import { useGrantDelegation } from '@/auth/useGrantDelegation';
import { isUsable, type AllowlistEntry } from './allowlist';
import { transferCall } from './transfer';
import { humanWalletError } from './walletError';
import { api } from '@/data/api';

export class NotAllowlisted extends Error {
  constructor() {
    super('That address is not on your allowlist.');
    this.name = 'NotAllowlisted';
  }
}

export class StillCoolingOff extends Error {
  constructor() {
    super('That address is still cooling off. It becomes usable once the period ends.');
    this.name = 'StillCoolingOff';
  }
}

export function useWithdraw() {
  const { sendTransaction } = useGrantDelegation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [txHash, setTxHash] = useState<Hex>();

  /**
   * Send a token to an allowlisted destination (PLAN.md 3.11).
   *
   * @param token   The token as this chain lists it — its own address and decimals, from `/market/watchable`.
   * @param entry   The chosen destination. Must be on the list and past its cooling-off.
   * @param amount  The amount as typed, in the token's own units.
   */
  const withdraw = useCallback(
    async (params: {
      token: { symbol: string; address: string; decimals: number };
      entry: AllowlistEntry | undefined;
      allowlist: AllowlistEntry[];
      amount: string;
    }) => {
      setBusy(true);
      setError(undefined);
      setTxHash(undefined);
      try {
        const { entry, allowlist, amount, token } = params;
        // Checked against the list itself, not against which card the screen had highlighted.
        if (!entry || !allowlist.some((a) => a.address === entry.address)) throw new NotAllowlisted();
        if (!isUsable(entry)) throw new StillCoolingOff();
        if (!(Number(amount) > 0)) throw new Error('Enter an amount above zero.');

        // In the token's own decimals, from the typed string — never through a float.
        const call = transferCall(token, entry.address as Address, amount);
        const hash = await sendTransaction(call.to, call.data);
        setTxHash(hash);
        // The portfolio history records the wallet once this send lands (PLAN.md 2.10). Not awaited: the
        // executor waits for the transaction itself, and a snapshot that fails is not the send failing.
        void api.post('/portfolio/snapshot', { txHash: hash }).catch(() => undefined);
        return hash;
      } catch (e) {
        /*
         * The wallet's own failure, translated. `e.message` from viem is a multi-line dump with
         * the useful sentence buried in a `Details:` line — and on a cancelled signature it reads
         * as an error when nothing went wrong at all. `humanWalletError` is what the grant path
         * already uses; a withdrawal is no place for a rawer message than that.
         */
        setError(humanWalletError(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [sendTransaction],
  );

  return { withdraw, busy, error, txHash };
}
