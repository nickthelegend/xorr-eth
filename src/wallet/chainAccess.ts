/**
 * The chain this build settles on, read directly (PLAN.md 4.1).
 *
 * The wallet's own provider answers through Privy's RPC for its chain id, and on a fork build that id is real Base's. So
 * what a person's signature commits to — the nonce, the gas, the fees — and the broadcast of the signed transaction come
 * from this client, pointed at the RPC the build names, and never from the wallet.
 */
import { createPublicClient, http } from 'viem';
import { activeChain } from '@/chain';

export const chainAccess = createPublicClient({
  chain: activeChain,
  transport: http(activeChain.rpcUrls.default.http[0]),
});
