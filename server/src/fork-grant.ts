/**
 * Grant a delegation on the fork, on behalf of a wallet whose key we do not have.
 *
 * On a real chain the USER signs this — that is the entire safety story and it is not negotiable.
 * On a fork we can impersonate the account, which is what makes the fork useful as a demo: the
 * same `grant` transaction, the same contract, the same enforcement, without needing the user's
 * embedded wallet to be present.
 *
 * Run: npx tsx server/src/fork-grant.ts <ownerAddress> [capUsd]
 */
import 'dotenv/config';
import { createPublicClient, createWalletClient, http, parseUnits, erc20Abi, type Address } from 'viem';
import { base } from 'viem/chains';

const RPC = process.env.FORK_RPC ?? 'http://127.0.0.1:8545';
const USDC: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ROUTER: Address = '0x111111125421cA6dc452d289314280a0f8842A65';

const chain = { ...base, rpcUrls: { default: { http: [RPC] }, public: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });

const ABI = [
  { type: 'function', name: 'grant', stateMutability: 'nonpayable',
    inputs: [{ name: 'delegate', type: 'address' }, { name: 'dailyCap', type: 'uint256' },
             { name: 'expiresAt', type: 'uint64' }, { name: 'venues', type: 'address[]' }], outputs: [] },
  { type: 'function', name: 'remainingToday', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

const rpc = (m: string, p: unknown[]) =>
  fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) }).then((r) => r.json());

async function main() {
  const owner = process.argv[2] as Address;
  const capUsd = Number(process.argv[3] ?? 2_000);
  const delegation = process.env.DELEGATION_ADDRESS as Address;
  const delegate = process.env.XORR_DELEGATE_ADDRESS as Address | undefined;
  if (!owner || !delegation) throw new Error('usage: fork-grant.ts <owner> [capUsd]; DELEGATION_ADDRESS must be set');

  const { delegatePublicKey } = await import('./evm/delegation.js');
  const bot = delegate ?? (delegatePublicKey as Address);

  await rpc('anvil_impersonateAccount', [owner]);
  await rpc('anvil_setBalance', [owner, '0x8AC7230489E80000']);
  const w = createWalletClient({ account: owner, chain, transport: http(RPC) });

  const cap = parseUnits(String(capUsd), 6);
  const h1 = await w.writeContract({
    address: delegation, abi: ABI, functionName: 'grant',
    args: [bot, cap, BigInt(Math.floor(Date.now() / 1000) + 7 * 86_400), [ROUTER]],
  });
  await pub.waitForTransactionReceipt({ hash: h1 });

  const h2 = await w.writeContract({
    address: USDC, abi: erc20Abi, functionName: 'approve', args: [delegation, cap * 30n],
  });
  await pub.waitForTransactionReceipt({ hash: h2 });
  await rpc('anvil_stopImpersonatingAccount', [owner]);

  const remaining = await pub.readContract({
    address: delegation, abi: ABI, functionName: 'remainingToday', args: [owner],
  });
  console.log(`granted on the fork`);
  console.log(`  owner     ${owner}`);
  console.log(`  delegate  ${bot}`);
  console.log(`  cap       $${capUsd}/day, ${Number(remaining) / 1e6} remaining today`);
  console.log(`  grant tx  ${h1}`);
}

await main();
