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
import { encodeFunctionData, parseUnits, type Address, type Hex } from 'viem';
import { useGrantDelegation } from '@/auth/useGrantDelegation';
import { isUsable, type AllowlistEntry } from './allowlist';

const ERC20_TRANSFER = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const USDC_DECIMALS = 6;

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
   * Send USDC to an allowlisted destination.
   *
   * @param token   The USDC contract on the chain the app is pointed at, from `/delegation/params`.
   * @param entry   The chosen destination. Must be on the list and past its cooling-off.
   * @param amount  A dollar figure, as the screen shows it.
   */
  const withdraw = useCallback(
    async (params: {
      token: Address;
      entry: AllowlistEntry | undefined;
      allowlist: AllowlistEntry[];
      amountUsd: number;
    }) => {
      setBusy(true);
      setError(undefined);
      setTxHash(undefined);
      try {
        const { entry, allowlist, amountUsd, token } = params;
        // Checked against the list itself, not against which card the screen had highlighted.
        if (!entry || !allowlist.some((a) => a.address === entry.address)) throw new NotAllowlisted();
        if (!isUsable(entry)) throw new StillCoolingOff();
        if (!(amountUsd > 0)) throw new Error('Enter an amount above zero.');

        const hash = await sendTransaction(
          token,
          encodeFunctionData({
            abi: ERC20_TRANSFER,
            functionName: 'transfer',
            args: [entry.address as Address, parseUnits(amountUsd.toFixed(USDC_DECIMALS), USDC_DECIMALS)],
          }),
        );
        setTxHash(hash);
        return hash;
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

  return { withdraw, busy, error, txHash };
}
