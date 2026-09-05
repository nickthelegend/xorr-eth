/**
 * 1inch — swap routing and execution. Replaces the Solana build's Jupiter adapter.
 *
 * Screen 19 promises "Best of N venues" and a slippage bound. 1inch returns the protocols it
 * actually routed through, so that row names real venues instead of being a fixed string.
 *
 * Two endpoints, two jobs:
 *   /quote — what the user is shown BEFORE they commit. No allowance needed, no side effects.
 *   /swap  — the calldata the delegation contract forwards to the router when a trade executes.
 */
import 'dotenv/config';
import { getJson } from '../http/get.js';
import { STOCKS } from './stocks.js';
import { ADDRESSES, CHAIN_KEY, ONEINCH_CHAIN_ID } from '../evm/chains.js';
import type { Address, Hex } from 'viem';

const BASE = 'https://api.1inch.dev/swap/v6.0';

const API_KEY = process.env.ONEINCH_API_KEY;
if (!API_KEY) {
  throw new Error('ONEINCH_API_KEY is required — swap routing has no offline fallback by design.');
}

/**
 * The tokens the app trades on Base, with the decimals every amount is scaled by.
 *
 * Crypto plus the tokenized equities from `stocks.ts` — the stocks are ordinary ERC-20s on Base,
 * so the swap path does not need to know they represent shares. That is the whole point: "Buy $250
 * of NVDA" is the same code path as "Buy $250 of WETH".
 */
export const TOKENS: Record<string, { address: Address; decimals: number }> = {
  ETH: { address: ADDRESSES.nativeEth, decimals: 18 },
  WETH: { address: ADDRESSES.wethBase, decimals: 18 },
  USDC: { address: ADDRESSES.usdcBase, decimals: 6 },
  CBBTC: { address: ADDRESSES.cbbtcBase, decimals: 8 },
  ...Object.fromEntries(
    Object.values(STOCKS).map((s) => [s.symbol, { address: s.address, decimals: s.decimals }]),
  ),
};

export type SwapQuote = {
  inSymbol: string;
  outSymbol: string;
  inAmount: number;
  outAmount: number;
  minimumOut: number;
  slippagePct: number;
  /** The protocols 1inch actually routed through — screen 19's Route row. */
  venues: string[];
  feeUsd: number;
  route: string;
};

/** Screen 19: "Max slippage 0.30%". */
export const DEFAULT_SLIPPAGE_PCT = 0.3;
/** Screen 19's stated app fee. */
export const SWAP_FEE_PCT = 0.0025;

type QuoteResponse = {
  dstAmount: string;
  protocols?: { name: string }[][][];
};

function scale(amount: number, decimals: number): bigint {
  return BigInt(Math.round(amount * 10 ** decimals));
}
function unscale(raw: string, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

function authed(url: string) {
  return getJson<QuoteResponse>(url, 15_000, 15_000, {
    Authorization: `Bearer ${API_KEY}`,
  });
}

/** Flatten 1inch's nested protocol matrix into the venue names a person would recognise. */
export function venuesFrom(protocols: QuoteResponse['protocols']): string[] {
  const names = new Set<string>();
  for (const path of protocols ?? []) {
    for (const hop of path) {
      for (const p of hop) {
        if (p?.name) names.add(prettyVenue(p.name));
      }
    }
  }
  return [...names];
}

/** "BASE_UNISWAP_V4" reads badly on a phone. */
export function prettyVenue(raw: string): string {
  return raw
    .replace(/^BASE_/, '')
    .split('_')
    .map((w) => (/^V\d$/i.test(w) ? w.toUpperCase() : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(' ');
}

export function routeLabel(venues: string[]): string {
  if (venues.length === 0) return 'Direct';
  if (venues.length === 1) return venues[0]!;
  return `Best of ${venues.length} venues`;
}

export async function quote(params: {
  inSymbol: string;
  outSymbol: string;
  amount: number;
  slippagePct?: number;
}): Promise<SwapQuote> {
  const from = TOKENS[params.inSymbol];
  const to = TOKENS[params.outSymbol];
  if (!from || !to) throw new Error(`No route for ${params.inSymbol} -> ${params.outSymbol}`);

  const slippagePct = params.slippagePct ?? DEFAULT_SLIPPAGE_PCT;
  const raw = scale(params.amount, from.decimals);
  const res = await authed(
    `${BASE}/${ONEINCH_CHAIN_ID}/quote?src=${from.address}&dst=${to.address}&amount=${raw}&includeProtocols=true`,
  );

  const outAmount = unscale(res.dstAmount, to.decimals);
  const venues = venuesFrom(res.protocols);

  return {
    inSymbol: params.inSymbol,
    outSymbol: params.outSymbol,
    inAmount: params.amount,
    outAmount,
    // The floor the user is shown. 1inch applies the same bound when the swap executes.
    minimumOut: outAmount * (1 - slippagePct / 100),
    slippagePct,
    venues,
    feeUsd: outAmount * SWAP_FEE_PCT,
    route: routeLabel(venues),
  };
}

export type SwapCalldata = { to: Address; data: Hex; value: string };

/**
 * On a fork, ask 1inch for a plain AMM route.
 *
 * Its best route on Base normally includes a private market-maker hop, and those solvers verify
 * off-chain state that a local fork cannot reproduce — the router reverts with 0xacfdb444 before
 * touching a pool. Constraining to a single unsplit AMM path costs a few basis points and makes
 * fills genuinely executable against the forked pools. Same router, same pools, real execution;
 * only the route selection differs, so this is switched off on a real network.
 */
const AMM_ONLY =
  CHAIN_KEY === 'base-fork' || CHAIN_KEY === 'localnet'
    ? '&complexityLevel=0&mainRouteParts=1&parts=1'
    : '';

/**
 * Build the calldata for a real swap.
 *
 * `from` is the address that holds the tokens at execution time — the delegation contract, because
 * it pulls the funds and calls the router inside one transaction.
 *
 * `receiver` is where the bought tokens land, and it must be the USER, not the contract. Without
 * it 1inch defaults the receiver to `from`, so every purchase would pile up inside XorrDelegation
 * and the app would be custodial in exactly the way it promises not to be. The contract should be
 * empty of user funds the moment the transaction ends.
 */
export async function buildSwap(params: {
  inSymbol: string;
  outSymbol: string;
  amount: number;
  from: Address;
  receiver: Address;
  slippagePct?: number;
}): Promise<SwapCalldata> {
  const src = TOKENS[params.inSymbol];
  const dst = TOKENS[params.outSymbol];
  if (!src || !dst) throw new Error(`No route for ${params.inSymbol} -> ${params.outSymbol}`);

  const raw = scale(params.amount, src.decimals);
  const res = await getJson<{ tx: { to: Address; data: Hex; value: string } }>(
    `${BASE}/${ONEINCH_CHAIN_ID}/swap?src=${src.address}&dst=${dst.address}&amount=${raw}` +
      `&from=${params.from}&origin=${params.from}&receiver=${params.receiver}` +
      `&slippage=${params.slippagePct ?? DEFAULT_SLIPPAGE_PCT}&disableEstimate=true${AMM_ONLY}`,
    15_000,
    15_000,
    { Authorization: `Bearer ${API_KEY}` },
  );
  return res.tx;
}
