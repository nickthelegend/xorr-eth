/**
 * Load the wallet from the executor whenever the user is signed in.
 *
 * `setWallet` was called in exactly one place — the onboarding wallet screen — so the client only
 * knew about a wallet if you had walked through onboarding in THIS session, in THIS browser. Every
 * other entry point left it null:
 *
 *   - a returning user on a new device or after clearing site data
 *   - a deep link straight to any screen
 *   - a reload once the persisted store had been cleared
 *
 * And the consequences were not cosmetic. `/` redirects to `/welcome` when the store has no wallet,
 * so a user with an account, a granted on-chain permission and open positions was bounced back to
 * onboarding. Assets said "No wallet connected", Safety showed a dash where the two parties to the
 * permission should be, and Fund could not show the address to send USDC to — all while the server
 * knew every one of those things.
 *
 * So the wallet is fetched once per signed-in session, from the one place that actually knows.
 */
import { useEffect } from 'react';
import { useAuth } from '@/auth/useAuth';
import { repos } from '@/data';
import { useStore } from '@/state/store';
import { setAuthKnowledge } from '@/auth/authState';

export function useHydrateWallet(): void {
  const { ready, authenticated } = useAuth();
  const wallet = useStore((s) => s.wallet);
  const setWallet = useStore((s) => s.setWallet);
  const setWalletChecked = useStore((s) => s.setWalletChecked);

  /*
   * Publish what Privy knows, so `api` can tell "signed out" from "not ready yet".
   *
   * This hook already watches exactly the two flags that answer the question, and it is mounted at
   * the root, so it is the natural place to say it out loud.
   */
  useEffect(() => {
    setAuthKnowledge(!ready ? 'unknown' : authenticated ? 'signed-in' : 'signed-out');
  }, [ready, authenticated]);

  useEffect(() => {
    if (!ready) return;

    /*
     * Signed out is a real answer, and it has to be recorded.
     *
     * The entry gate waits for `walletChecked` before deciding, so leaving it unset here would
     * hold a signed-out visitor on a blank screen instead of sending them to the splash.
     */
    if (!authenticated) {
      setWallet(null);
      setWalletChecked(true);
      return;
    }

    // Already have it — the persisted store is the fast path, and re-fetching on every mount
    // would put a request on the critical path of every navigation for no new information.
    if (wallet) {
      setWalletChecked(true);
      return;
    }

    let alive = true;
    void repos.wallet
      .current()
      .then((w) => {
        if (!alive) return;
        if (w) setWallet(w);
        setWalletChecked(true);
      })
      .catch(() => {
        /*
         * A failed read must not be mistaken for "no wallet".
         *
         * Marking it checked anyway would redirect a signed-in user to onboarding because the
         * executor was briefly unreachable — destroying their session state to recover from a
         * network blip. Leaving it unchecked keeps the gate waiting, which is the honest state.
         */
        if (alive) setWalletChecked(false);
      });
    return () => {
      alive = false;
    };
  }, [ready, authenticated, wallet, setWallet, setWalletChecked]);
}
