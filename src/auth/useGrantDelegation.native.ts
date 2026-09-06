/**
 * Granting the bot permission — signed by the USER, with their own Privy wallet. (native)
 *
 * This is the heart of the product's safety claim, so it matters who signs. The executor never
 * holds the owner key and therefore cannot grant itself permission: it can only tell the app what
 * to sign, and read the result back off the chain.
 *
 * The same applies to revoking. The kill switch is a transaction the user signs, which is why
 * "takes effect in under a second across every device" is true without any server being reachable.
 */
import { useCallback, useState } from 'react';
import { useEmbeddedEthereumWallet } from '@privy-io/expo';
import { encodeFunctionData, parseUnits, type Address, type Hex } from 'viem';
import { api } from '@/data/api';

const DELEGATION_ABI = [
  {
    type: 'function',
    name: 'grant',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'delegate', type: 'address' },
      { name: 'dailyCap', type: 'uint256' },
      { name: 'expiresAt', type: 'uint64' },
      { name: 'venues', type: 'address[]' },
    ],
    outputs: [],
  },
  { type: 'function', name: 'revoke', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

type DelegationParams = {
  contract: Address;
  delegate: Address;
  venues: Address[];
  /** The settlement token. Approved to the cap, because that IS what the bot may spend. */
  token: Address;
  /** Every token the delegation may need to pull, including the ones it only ever sells. */
  tokens?: { symbol: string; address: Address }[];
  chain: string;
};

const USDC_DECIMALS = 6;

/** An allowance, not a limit. The daily cap on-chain is the limit, and the user set it. */
const MAX_UINT256 = (1n << 256n) - 1n;

export function useGrantDelegation() {
  const { wallets } = useEmbeddedEthereumWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const send = useCallback(
    async (to: Address, data: Hex) => {
      const wallet = wallets?.[0];
      if (!wallet) throw new Error('No wallet yet. Finish sign-in first.');
      const provider = await wallet.getProvider();
      return (await provider.request({
        method: 'eth_sendTransaction',
        params: [{ from: wallet.address, to, data }],
      })) as Hex;
    },
    [wallets],
  );

  const grant = useCallback(
    async (dailyCapUsd: number, durationMs: number) => {
      setBusy(true);
      setError(undefined);
      try {
        const params = await api.get<DelegationParams>('/delegation/params');
        const cap = parseUnits(dailyCapUsd.toFixed(USDC_DECIMALS), USDC_DECIMALS);
        const expiresAt = BigInt(Math.floor((Date.now() + durationMs) / 1000));

        /*
         * Approve EVERY tradable token, not only the one the bot spends.
         *
         * The approvals let the delegation contract pull funds at the moment of a trade, and the
         * grant is what bounds how much and where — approving without granting gives the bot
         * nothing. This used to approve USDC alone, which authorised the buy side and nothing
         * else: `closePosition` pulls the asset being SOLD, so with no allowance on it every exit
         * reverted at `transferFrom`. A user could be bought into WETH and then find that
         * take-profit, stop-loss, the panic flatten and the Close button all silently failed.
         *
         * The order matters — approvals first, grant last — so a run that stops half way leaves a
         * wallet the bot cannot touch rather than one it can spend from but not exit.
         *
         * `max uint256` on the non-settlement tokens on purpose: the amount that will need
         * selling is whatever the bot bought, which is not knowable here, and an allowance is not
         * a spending limit — the daily cap on-chain is, and it is the one the user set. A smaller
         * number here would not cap anything, it would just make some future exit fail.
         */
        const settlement = params.token.toLowerCase();
        const approvable = params.tokens?.length
          ? params.tokens
          : [{ symbol: 'USDC', address: params.token }];
        for (const t of approvable) {
          const amount = t.address.toLowerCase() === settlement ? cap * 30n : MAX_UINT256;
          await send(
            t.address,
            encodeFunctionData({
              abi: DELEGATION_ABI,
              functionName: 'approve',
              args: [params.contract, amount],
            }),
          );
        }

        const txHash = await send(
          params.contract,
          encodeFunctionData({
            abi: DELEGATION_ABI,
            functionName: 'grant',
            args: [params.delegate, cap, expiresAt, params.venues],
          }),
        );

        // The server re-reads the CHAIN before it records anything, so a client claiming to have
        // signed something is not enough.
        await api.post('/delegation/record', {
          txHash,
          dailyCapUsd,
          expiresAt: Number(expiresAt) * 1000,
        });
        return txHash;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [send],
  );

  const revoke = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      const params = await api.get<DelegationParams>('/delegation/params');
      const txHash = await send(
        params.contract,
        encodeFunctionData({ abi: DELEGATION_ABI, functionName: 'revoke', args: [] }),
      );
      await api.post('/delegation/revoke', { txHash });
      return txHash;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [send]);

  /*
   * `send` is exported too.
   *
   * Grant and revoke are the two transactions this hook was built for, but they are not the only
   * ones the USER signs — withdrawing from Aave is theirs alone, by design, because the bot was
   * deliberately never given the aToken. Rather than a second hook duplicating the provider
   * plumbing (which differs between web and native, and is the only part that does), the caller
   * gets the primitive.
   */
  return { grant, revoke, sendTransaction: send, busy, error };
}
