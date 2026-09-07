/**
 * The Privy control surface — what the wallet's own custodian will and will not do.
 *
 * Everything here is a read of Privy's API rather than a report of what we asked for. The point of
 * this project is that a claim you cannot check is not evidence, and a security control we merely
 * assert is the worst example of that.
 */
import { Hono } from 'hono';
import { requireUser } from '../auth/middleware.js';
import {
  allowedDestinations,
  ensurePolicy,
  policyStatus,
  proveAuthorizationKey,
  rpcAsWallet,
  demoWalletId,
} from '../auth/privyPolicy.js';
import { one } from '../db/index.js';

export const privyRoutes = new Hono();

/** What Privy enforces on the signed-in user's wallet, read from Privy. */
privyRoutes.get('/privy/policy', async (c) => {
  const { userId } = requireUser(c);
  const w = await one<{ address: string }>(`SELECT address FROM wallets WHERE user_id = $1 LIMIT 1`, [
    userId,
  ]);
  if (!w) return c.json({ error: 'no_wallet' }, 400);
  const [status, policy] = await Promise.all([
    policyStatus(w.address),
    ensurePolicy().catch(() => undefined),
  ]);
  return c.json({
    ...status,
    /*
     * What the policy WOULD allow, next to what it currently does.
     *
     * A wallet that predates the policy cannot have one attached by us: Privy makes the wallet's
     * owner authorise that, and for a user's embedded wallet the owner is the user. Reporting only
     * `enforced: false` would read as "this feature does not work", when the truth is "this
     * control exists and belongs to you, not to us" — which is the more interesting fact.
     */
    policyId: status.policyId ?? policy?.id,
    policyName: status.policyName ?? policy?.name,
    wouldAllow: allowedDestinations(),
    ownedByQuorum: policy?.owner_id ?? null,
  });
});

/**
 * Prove it, live.
 *
 * Two requests, both made with every credential this server holds:
 *  - one to an address the policy names, which Privy passes through;
 *  - one to an address it does not, which Privy refuses.
 *
 * The second is the whole point, and it is worth *doing* rather than describing. The transaction
 * is a zero-value call so nothing is spent either way — what is being tested is whether the
 * request survives the policy, not what it would do on the other side.
 */
privyRoutes.post('/privy/policy/prove', async (c) => {
  requireUser(c);
  const walletId = await demoWalletId();
  if (!walletId) {
    return c.json({ error: 'no_demo_wallet', message: 'No policy-bound wallet on this deployment.' }, 400);
  }
  const caip2 = `eip155:${process.env.XORR_CHAIN === 'base-sepolia' ? 84532 : 8453}`;
  const chainId = process.env.XORR_CHAIN === 'base-sepolia' ? 84532 : 8453;

  const attempt = async (to: string) => {
    try {
      await rpcAsWallet(walletId, {
        method: 'eth_sendTransaction',
        caip2,
        params: { transaction: { to, value: '0x0', chain_id: chainId } },
      });
      return { to, blockedByPolicy: false, detail: 'accepted by the policy' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      /*
       * Only a POLICY refusal counts as blocked.
       *
       * A call that gets past Privy and then reverts on chain is the policy having ALLOWED it —
       * the opposite result — and the two are easy to confuse because both arrive as an error.
       * Reading the reason is what makes this a test rather than a coin toss.
       */
      return { to, blockedByPolicy: /policy violation/i.test(msg), detail: msg.slice(0, 200) };
    }
  };

  const allowed = allowedDestinations()[0]!.address;
  const forbidden = '0x000000000000000000000000000000000000dEaD';
  const [onList, offList] = await Promise.all([attempt(allowed), attempt(forbidden)]);
  return c.json({
    walletId,
    onList,
    offList,
    // The claim only holds if BOTH halves behave: refusing everything would prove nothing either.
    proven: offList.blockedByPolicy && !onList.blockedByPolicy,
    authorizationKey: await proveAuthorizationKey(),
  });
});
