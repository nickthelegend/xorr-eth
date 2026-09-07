/**
 * The standing allowances, and a way to take them back.
 *
 * Granting approves every tradable token to the delegation for MAX_UINT256. That is what lets a
 * fill happen without a second signature per trade, and it is also an unlimited standing allowance
 * that nothing in the product ever showed and nothing could withdraw.
 *
 * It matters most at the moment a user thinks they have disengaged. Revoking the delegation stops
 * the bot — `spend` checks the policy before it moves anything — but ERC-20 allowances are a
 * separate grant to the same contract and they survive it untouched. "I revoked everything" was
 * true of the part the screen showed and false of the part it did not.
 *
 * The revoke is signed by the USER, like every other transaction that changes what may happen to
 * their money. The executor cannot do this on their behalf and should not be able to.
 */
import { useCallback, useState } from 'react';
import { encodeFunctionData, erc20Abi, type Address, type Hex } from 'viem';
import { useGrantDelegation } from '@/auth/useGrantDelegation';
import { api } from '@/data/api';
import { useAsync } from '@/data/useAsync';

export type TokenApproval = {
  symbol: string;
  address: Address;
  /** A uint256 as a decimal string — JSON has no integer wide enough. */
  allowance: string;
  unlimited: boolean;
  none: boolean;
};

export type ApprovalsView = { spender: Address; tokens: TokenApproval[] };

export function useApprovals() {
  const { sendTransaction } = useGrantDelegation();
  const [revoking, setRevoking] = useState<string>();
  const [error, setError] = useState<string>();
  const { data, loading, reload } = useAsync(
    () => api.get<ApprovalsView>('/approvals').catch(() => undefined),
    [],
  );

  const revoke = useCallback(
    async (token: TokenApproval, spender: Address) => {
      setRevoking(token.symbol);
      setError(undefined);
      try {
        /*
         * `approve(spender, 0)` — the only way an ERC-20 allowance comes back.
         *
         * There is no "unapprove". Setting zero is the withdrawal, and it is a normal transaction
         * the owner signs; the token contract does not care who asked for it, only who signed.
         */
        const hash = await sendTransaction(
          token.address,
          encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [spender, 0n],
          }) as Hex,
        );
        // Re-read from the chain rather than assuming. A transaction that was broadcast is not a
        // transaction that landed, and this screen's whole job is saying what is actually true.
        await reload();
        return hash;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return undefined;
      } finally {
        setRevoking(undefined);
      }
    },
    [sendTransaction, reload],
  );

  return { approvals: data, loading, reload, revoke, revoking, error };
}
