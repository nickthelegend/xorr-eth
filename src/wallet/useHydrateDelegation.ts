/**
 * Load the on-chain permission whenever the user is signed in.
 *
 * Exactly the bug `useHydrateWallet` was written for, one field over. `setDelegation` was called
 * from three screens — the grant, Safety, and a bot's settings — so the store held a permission
 * only if you had performed a grant or opened Safety in THIS session. Every other entry point saw
 * `null` and rendered it as fact.
 *
 * Settings is where that showed. Under a heading reading "What the bot may do" it said:
 *
 *   Status      Not granted
 *   Daily cap   —
 *
 * for a wallet the executor was, at that moment, refusing a strategy against with "That would
 * commit $5,530 a day against a $2,810 cap". Safety had already been fixed for itself with a local
 * effect; doing it once at the root fixes it for every screen that reads the store, including the
 * ones written next.
 *
 * The read is cheap and it is the truth: `/wallet/delegation` reads the chain.
 */
import { useEffect, useRef } from 'react';
import { useAuth } from '@/auth/useAuth';
import { repos } from '@/data';
import { useStore } from '@/state/store';

export function useHydrateDelegation(): void {
  const { ready, authenticated, address } = useAuth();
  const setDelegation = useStore((s) => s.setDelegation);

  /*
   * Fetch once per signed-in address, tracked in a ref.
   *
   * Depending on the store's `delegation` here would make this effect its own trigger — the loop
   * `useHydrateWallet` documents, which put thousands of requests through the executor in seconds.
   */
  const loadedFor = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!ready || !authenticated || !address) return;
    if (loadedFor.current === address) return;
    loadedFor.current = address;

    let alive = true;
    void repos.wallet
      .delegation()
      .then((d) => {
        if (alive) setDelegation(d);
      })
      .catch(() => {
        // A failed read is not "no permission". Leave the store alone and let the screens that
        // care — Safety — refetch; claiming `null` here would be the false negative above.
        loadedFor.current = undefined;
      });
    return () => {
      alive = false;
    };
  }, [ready, authenticated, address, setDelegation]);
}
