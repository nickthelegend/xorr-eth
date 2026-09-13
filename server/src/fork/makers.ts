/**
 * Makers for a fork: an Aqua book and a SwapVM program, each shipped from a maker's own wallet (PLAN.md 3.2).
 *
 * A rebuilt fork had our contracts and no liquidity in them. `fork-bootstrap` deployed `XorrAquaBook` and
 * `XorrSwapVMBook` and never shipped to either, so settlement found no book, fell through to the aggregator,
 * and the Aqua and SwapVM paths went unexercised on the deployment being judged until someone ran
 * `live-aqua.ts` and `live-swapvm.ts` by hand — which ship as part of a proof, not as setup. This is the
 * shipping half of those two scripts on its own, so a rebuild does it every time.
 *
 * The makers are real wallets holding real Base tokens — USDC moved from a real holder by impersonation, WETH
 * wrapped from their own ETH — and shipping moves none of it: Aqua takes an allowance, the maker keeps custody.
 */
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Address, type Hex } from 'viem';
import { base } from 'viem/chains';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { BOOK_ABI, encodeStrategy, strategyHash, type AquaStrategy } from '../venues/aqua.js';

export const AQUA: Address = '0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a';
export const USDC: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const WETH: Address = '0x4200000000000000000000000000000000000006';
/** Aave v3's aUSDC reserve on Base — a real contract holding tens of millions of real USDC. */
const WHALE: Address = '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB';
const MAX = (1n << 256n) - 1n;

const AQUA_SHIP_ABI = [
  {
    type: 'function',
    name: 'ship',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'app', type: 'address' },
      { name: 'strategy', type: 'bytes' },
      { name: 'tokens', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
    ],
    outputs: [],
  },
] as const;

const WETH_DEPOSIT_ABI = [{ type: 'function', name: 'deposit', inputs: [], outputs: [], stateMutability: 'payable' }] as const;

const ORDER_COMPONENTS = [
  { name: 'maker', type: 'address' },
  { name: 'traits', type: 'uint256' },
  { name: 'data', type: 'bytes' },
] as const;

/** The three views `XorrSwapVMBook` compiles a program and its shipping arguments with. */
const SWAPVM_BOOK_ABI = [
  {
    type: 'function',
    name: 'xycProgram',
    stateMutability: 'view',
    inputs: [
      { name: 'feeBps', type: 'uint256' },
      { name: 'deadline', type: 'uint40' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bytes' }],
  },
  {
    type: 'function',
    name: 'orderFor',
    stateMutability: 'pure',
    inputs: [
      { name: 'maker', type: 'address' },
      { name: 'program', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'tuple', components: ORDER_COMPONENTS }],
  },
  {
    type: 'function',
    name: 'shipArgs',
    stateMutability: 'view',
    inputs: [
      { name: 'order', type: 'tuple', components: ORDER_COMPONENTS },
      { name: 'token0', type: 'address' },
      { name: 'token1', type: 'address' },
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
    outputs: [
      { name: 'app', type: 'address' },
      { name: 'encoded', type: 'bytes' },
      { name: 'tokens', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
    ],
  },
] as const;

function forkClients(rpc: string) {
  const chain = { ...base, rpcUrls: { default: { http: [rpc] }, public: { http: [rpc] } } };
  return { chain, pub: createPublicClient({ chain, transport: http(rpc), cacheTime: 0 }) };
}

async function anvil(rpc: string, method: string, params: unknown[]): Promise<unknown> {
  const r = (await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }).then((x) => x.json())) as { result?: unknown; error?: { message: string } };
  if (r.error) throw new Error(`${method}: ${r.error.message}`);
  return r.result;
}

const salt = (): Hex => `0x${Date.now().toString(16).padStart(64, '0')}`;

/** A fresh maker: gas, `usdc` of real USDC from a real holder, `weth` wrapped from its own ETH, and Aqua approved. */
async function newMaker(rpc: string, usdc: bigint, weth: bigint) {
  const { chain, pub } = forkClients(rpc);
  const account = privateKeyToAccount(generatePrivateKey());
  await anvil(rpc, 'anvil_setBalance', [account.address, `0x${(weth + parseUnits('10', 18)).toString(16)}`]);

  if (usdc > 0n) {
    await anvil(rpc, 'anvil_impersonateAccount', [WHALE]);
    await anvil(rpc, 'anvil_setBalance', [WHALE, '0xDE0B6B3A7640000']);
    const whale = createWalletClient({ account: WHALE, chain, transport: http(rpc) });
    const moved = await whale.writeContract({ address: USDC, abi: erc20Abi, functionName: 'transfer', args: [account.address, usdc] });
    await pub.waitForTransactionReceipt({ hash: moved });
    await anvil(rpc, 'anvil_stopImpersonatingAccount', [WHALE]);
  }

  const wallet = createWalletClient({ account, chain, transport: http(rpc) });
  if (weth > 0n) {
    const wrapped = await wallet.writeContract({ address: WETH, abi: WETH_DEPOSIT_ABI, functionName: 'deposit', value: weth });
    await pub.waitForTransactionReceipt({ hash: wrapped });
  }
  for (const token of [USDC, WETH]) {
    const approved = await wallet.writeContract({ address: token, abi: erc20Abi, functionName: 'approve', args: [AQUA, MAX] });
    await pub.waitForTransactionReceipt({ hash: approved });
  }
  return { maker: account.address, wallet, pub };
}

/**
 * An Aqua book on `XorrAquaBook`: `weth` of WETH beside its value in USDC at `priceUsd`, with a `feeBps` fee,
 * refusing any fill more than `maxDeviationBps` from that reference price.
 */
export async function shipAquaBook(opts: {
  rpc: string;
  book: Address;
  priceUsd: number;
  weth?: bigint;
  feeBps?: bigint;
  maxDeviationBps?: bigint;
}): Promise<{ maker: Address; tx: Hex; hash: Hex; weth: bigint; usdc: bigint }> {
  if (!(opts.priceUsd > 0)) throw new Error('an Aqua book needs a WETH price to quote around');
  const weth = opts.weth ?? parseUnits('2', 18);
  // USDC per whole WETH, in USDC's six decimals.
  const referencePrice = BigInt(Math.round(opts.priceUsd * 1e6));
  const usdc = (weth * referencePrice) / 10n ** 18n;
  const { maker, wallet, pub } = await newMaker(opts.rpc, usdc, weth);

  const strategy: AquaStrategy = {
    maker,
    token0: WETH,
    token1: USDC,
    feeBps: opts.feeBps ?? 30n,
    maxDeviationBps: opts.maxDeviationBps ?? 500n,
    referencePrice,
    salt: salt(),
  };
  const tx = await wallet.writeContract({
    address: AQUA,
    abi: AQUA_SHIP_ABI,
    functionName: 'ship',
    args: [opts.book, encodeStrategy(strategy), [WETH, USDC], [weth, usdc]],
  });
  if ((await pub.waitForTransactionReceipt({ hash: tx })).status !== 'success') throw new Error(`shipping the Aqua book reverted: ${tx}`);
  const open = await pub.readContract({ address: opts.book, abi: BOOK_ABI, functionName: 'isOpen', args: [strategy] });
  if (open !== true) throw new Error(`the Aqua book shipped in ${tx} but does not read as open`);
  return { maker, tx, hash: strategyHash(strategy), weth, usdc };
}

/**
 * A SwapVM program on `XorrSwapVMBook`: an XYC curve over `usdc` of USDC and its value in WETH, seeded `edge`
 * inside the aggregator's own price so a fill through it is the better route, with a `feeBps` fee and a deadline
 * compiled into the bytecode.
 */
export async function shipSwapVmProgram(opts: {
  rpc: string;
  book: Address;
  wethPerUsdc: number;
  usdc?: bigint;
  edge?: number;
  feeBps?: bigint;
  lifetimeSec?: number;
}): Promise<{ maker: Address; tx: Hex; bytes: number; weth: bigint; usdc: bigint; deadline: number }> {
  if (!(opts.wethPerUsdc > 0)) throw new Error('a SwapVM program needs a WETH-per-USDC price to seed its curve');
  const usdc = opts.usdc ?? parseUnits('50000', 6);
  const weth = parseUnits(((Number(usdc) / 1e6) * opts.wethPerUsdc * (1 + (opts.edge ?? 0.02))).toFixed(18), 18);
  const { maker, wallet, pub } = await newMaker(opts.rpc, usdc, weth);

  const deadline = Number((await pub.getBlock()).timestamp) + (opts.lifetimeSec ?? 30 * 86_400);
  const program = await pub.readContract({
    address: opts.book,
    abi: SWAPVM_BOOK_ABI,
    functionName: 'xycProgram',
    args: [opts.feeBps ?? 30n, deadline, salt()],
  });
  const order = await pub.readContract({ address: opts.book, abi: SWAPVM_BOOK_ABI, functionName: 'orderFor', args: [maker, program] });
  const [app, encoded, tokens, amounts] = await pub.readContract({
    address: opts.book,
    abi: SWAPVM_BOOK_ABI,
    functionName: 'shipArgs',
    args: [order, WETH, USDC, weth, usdc],
  });
  const tx = await wallet.writeContract({ address: AQUA, abi: AQUA_SHIP_ABI, functionName: 'ship', args: [app, encoded, [...tokens], [...amounts]] });
  if ((await pub.waitForTransactionReceipt({ hash: tx })).status !== 'success') throw new Error(`shipping the SwapVM program reverted: ${tx}`);
  return { maker, tx, bytes: (program.length - 2) / 2, weth, usdc, deadline };
}
