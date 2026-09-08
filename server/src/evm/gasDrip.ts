/**
 * A new wallet cannot sign the thing this product is about.
 *
 * The whole flow turns on one action: the user signs an on-chain permission from their own embedded
 * wallet. Privy creates that wallet empty, and an empty wallet cannot pay gas — so on the hosted
 * deployment anyone could sign in, reach the delegate screen, press the button and watch it fail on
 * `insufficient funds`. Every screen behind that point was unreachable for a first-time visitor.
 *
 * So the executor drips a little testnet gas to a wallet it has just seen created. Not a feature —
 * a testnet affordance, and it is fenced accordingly:
 *
 *   - **Testnet only.** `IS_BASE_MAINNET_STATE` covers Base and any fork of it, and this refuses on
 *     both. Sending real ETH to an address because someone signed up is not a thing this should be
 *     able to do by accident.
 *   - **Only into an empty wallet.** A secondary net, not the primary one: measured against the
 *     public Sepolia RPC, a balance read immediately after `waitForTransactionReceipt` still
 *     returned zero, and a second call in the same breath sent again — 0.004 ETH into an address
 *     that should have had 0.002. Read-after-write on a public node is not a lock. The guarantee
 *     that this happens once per wallet is the `known` check in `/wallet/connect`, which asks the
 *     database before the upsert and cannot lag; this check only stops a wallet that already has
 *     gas from being topped up.
 *   - **Only while the delegate can still pay for its own work.** The bot's gas is what makes every
 *     other trade possible; a faucet that eats it has broken more than it fixed. `RESERVE` is the
 *     floor it will not spend below.
 *   - **Never blocking, and never fatal.** A failed drip is logged and swallowed: the wallet is
 *     already created and usable, and a user who funds it themselves must not be held up by this.
 *
 * The amount is small on purpose. It covers the three signatures the grant costs on an L2 with room
 * to spare, and nothing beyond that — this is not a funding rail, and /fund is still where money
 * comes from.
 */
import { parseEther, formatEther, type Address } from 'viem';
import { publicClient, walletClient, delegateAccount } from './client.js';
import { IS_BASE_MAINNET_STATE, CHAIN_KEY } from './chains.js';

/** Enough for the approvals and the grant on an L2, and not a penny of use beyond that. */
const DRIP_ETH = '0.002';
/** The delegate's own floor. Below this it stops giving and keeps working. */
const RESERVE_ETH = '0.01';

export type DripResult =
  | { sent: true; amountEth: string; hash: string }
  | { sent: false; reason: string };

export async function dripGasIfNeeded(to: Address): Promise<DripResult> {
  if (IS_BASE_MAINNET_STATE) {
    return { sent: false, reason: `refusing to send real ETH on ${CHAIN_KEY}` };
  }

  const [balance, delegateBalance] = await Promise.all([
    publicClient.getBalance({ address: to }),
    publicClient.getBalance({ address: delegateAccount.address }),
  ]);

  if (balance > 0n) return { sent: false, reason: 'wallet already has gas' };

  const drip = parseEther(DRIP_ETH);
  if (delegateBalance < parseEther(RESERVE_ETH) + drip) {
    return {
      sent: false,
      reason: `delegate holds ${formatEther(delegateBalance)} ETH, at or below its ${RESERVE_ETH} reserve`,
    };
  }

  const hash = await walletClient.sendTransaction({ to, value: drip });
  return { sent: true, amountEth: DRIP_ETH, hash };
}
