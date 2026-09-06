/**
 * Granting the bot permission — signed by the USER, with their own Privy wallet. (web)
 *
 * This is the heart of the product's safety claim, so it matters who signs. The executor never
 * holds the owner key and therefore cannot grant itself permission: it can only tell the app what
 * to sign, and read the result back off the chain.
 *
 * The same applies to revoking. The kill switch is a transaction the user signs, which is why
 * "takes effect in under a second across every device" is true without any server being reachable.
 */
import { useCallback, useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
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
  token: Address;
  chain: string;
};

const USDC_DECIMALS = 6;

export function useGrantDelegation() {
  const { wallets } = useWallets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const send = useCallback(
    async (to: Address, data: Hex) => {
      const wallet = wallets?.[0];
      if (!wallet) throw new Error('No wallet yet. Finish sign-in first.');
      const provider = await wallet.getEthereumProvider();
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

        // Two signatures, and the order matters: the ERC-20 approval lets the delegation contract
        // pull funds AT THE MOMENT OF A TRADE, and the grant is what bounds how much and where.
        // Approving without granting gives the bot nothing.
        await send(
          params.token,
          encodeFunctionData({
            abi: DELEGATION_ABI,
            functionName: 'approve',
            args: [params.contract, cap * 30n],
          }),
        );

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
