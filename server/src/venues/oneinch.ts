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
import { CHAIN_KEY, ONEINCH_CHAIN_ID, QUOTE_ADDRESSES } from '../evm/chains.js';
import { priceOf } from '../market/prices.js';
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
 *
 * MAINNET addresses, always. 1inch is only asked about chain 8453, so a Sepolia address here is a
 * token that chain has never heard of and the quote 400s. What the executor settles against is a
 * separate question, answered by ADDRESSES.
 */
export const TOKENS: Record<string, { address: Address; decimals: number }> = {
  ETH: { address: QUOTE_ADDRESSES.nativeEth, decimals: 18 },
  WETH: { address: QUOTE_ADDRESSES.wethBase, decimals: 18 },
  USDC: { address: QUOTE_ADDRESSES.usdcBase, decimals: 6 },
  CBBTC: { address: QUOTE_ADDRESSES.cbbtcBase, decimals: 8 },
  ...Object.fromEntries(
    Object.values(STOCKS).map((s) => [s.symbol, { address: s.address, decimals: s.decimals }]),
  ),
};

/**
 * A symbol as the registry spells it, from however the caller spelled it.
 *
 * Tokenized equities carry a lowercase suffix — `NVDAc`, `TSLAc` — and the routes normalised
 * their inputs with `.toUpperCase()`. `NVDAc` became `NVDAC`, which is not a key in `TOKENS`, so
 * **every equity quote failed**: `/swap/quote?out=NVDAc` answered `502 No route for USDC ->
 * NVDAC`, and the order ticket for the entire stocks track — one of the product's headline
 * claims — could not price a single trade. The crypto symbols are already all-caps, so uppercase
 * normalisation looked correct everywhere anyone tested it.
 *
 * Case-insensitive lookup against the registry's own spelling, so `nvdac`, `NVDAC` and `NVDAc`
 * all resolve, and an unknown symbol comes back unchanged for the caller's own error to report.
 */
const CANONICAL = new Map(Object.keys(TOKENS).map((k) => [k.toUpperCase(), k]));

export function canonicalSymbol(raw: string): string {
  return CANONICAL.get(raw.trim().toUpperCase()) ?? raw.trim();
}

export type SwapQuote = {
  inSymbol: string;
  outSymbol: string;
  inAmount: number;
  outAmount: number;
  minimumOut: number;
  slippagePct: number;
  /** The protocols 1inch actually routed through — screen 19's Route row. */
  venues: string[];
  /**
   * How far the executed rate sits below the mid, as a percentage — or null when it cannot be
   * measured, which is not the same as zero.
   */
  priceImpactPct: number | null;
  /**
   * What the user is guaranteed at worst, in the OUTPUT token.
   *
   * Replaces `feeUsd`, which was `outAmount * 0.0025` — an "app fee" xorr does not charge,
   * multiplied by a quantity in the output token's own units rather than dollars. For USDC→WETH
   * that made the order ticket read "Fee $0.00" on every size: an invented charge, computed
   * wrongly, displaying as nothing. Three ways to be wrong about one number.
   *
   * The real protections on a swap are the route, the slippage limit and this floor, and this is
   * the one a user can check against what actually arrives.
   */
  route: string;
};

/** Screen 19: "Max slippage 0.30%". */
export const DEFAULT_SLIPPAGE_PCT = 0.3;

/**
 * How much slippage each kind of trade accepts, and why they differ.
 *
 * The tolerance is not a constant, because the cost of NOT trading is not a constant.
 *
 *   - A scheduled buy can wait. If the price moved past 0.3% it will run again tomorrow, and
 *     paying up for a purchase nobody is in a hurry to make is a straight loss.
 *   - A stop-loss cannot wait. A stop that refuses to execute because the market moved is not a
 *     stop; it is a stop-shaped thing that fails exactly when it is needed, since the market
 *     moving is the entire reason it fired.
 *   - A panic exit can wait least of all. Someone who has pressed "sell everything" has already
 *     decided the price is not the thing they are optimising for, and a 0.3% limit that leaves
 *     them holding the position is the same failure as a spending cap that blocks a sale.
 *
 * These are ceilings, not targets: the router still fills at the best price it finds, and the
 * number only decides when it refuses.
 */
export const SLIPPAGE = {
  scheduled: DEFAULT_SLIPPAGE_PCT,
  stop: 1,
  panic: 2,
} as const;
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
    priceImpactPct: await priceImpact(params.inSymbol, params.outSymbol, params.amount, outAmount),
    inSymbol: params.inSymbol,
    outSymbol: params.outSymbol,
    inAmount: params.amount,
    outAmount,
    // The floor the user is shown. 1inch applies the same bound when the swap executes.
    minimumOut: outAmount * (1 - slippagePct / 100),
    slippagePct,
    venues,
    route: routeLabel(venues),
  };
}


/**
 * Price impact, measured rather than asserted.
 *
 * The swap screen has always had a "Price impact" row and the server has never returned the field,
 * so it read `undefined` and rendered **"NaN%"** — the client's type claimed a number the response
 * did not contain. A NaN on a trade ticket is worse than an empty row: it is a number-shaped thing
 * that is not a number.
 *
 * Impact is the gap between the rate this size actually gets and the rate the market is quoting at
 * mid, so both halves have to be real: the executed rate comes from the 1inch quote and the mid
 * from the same price feed every screen uses. Where either is unavailable — a tokenized equity has
 * no CoinGecko feed — the answer is `null` and the screen shows a dash. Returning 0 there would be
 * claiming a free trade.
 */
async function priceImpact(
  inSymbol: string,
  outSymbol: string,
  inAmount: number,
  outAmount: number,
): Promise<number | null> {
  if (!(inAmount > 0) || !(outAmount > 0)) return null;
  const [inUsd, outUsd] = await Promise.all([
    priceOf(inSymbol, 4_000).catch(() => 0),
    priceOf(outSymbol, 4_000).catch(() => 0),
  ]);
  if (!(inUsd > 0) || !(outUsd > 0)) return null;

  // What the trade should return at mid, in the output token, against what it actually returns.
  const atMid = (inAmount * inUsd) / outUsd;
  if (!(atMid > 0)) return null;
  const impact = ((atMid - outAmount) / atMid) * 100;
  // A tiny negative is the feed and the pool disagreeing by a hair, not a gift. Clamp to zero.
  return Number.isFinite(impact) ? Math.max(0, impact) : null;
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
/**
 * On a fork, allowlist ordinary AMMs by name.
 *
 * `complexityLevel=0` constrains the route's SHAPE but not its participants, so 1inch still picked
 * a private market maker and the fill reverted before touching a pool — those solvers verify
 * off-chain state a local fork cannot reproduce. Naming the AMMs is the only reliable way to get a
 * route made entirely of contracts a fork can actually execute.
 *
 * Costs a few basis points versus the best available route. Same router, same pools, real
 * execution — only the venue selection differs, and it is off on a real network.
 */
const FORK_AMMS = [
  'BASE_UNISWAP_V2',
  'BASE_UNISWAP_V3',
  'BASE_UNISWAP_V4',
  'BASE_AERODROME',
  'BASE_AERODROME_V3',
  'BASE_AERODROME_SLIPSTREAM',
  'BASE_PANCAKESWAP_V2',
  'BASE_PANCAKESWAP_V3',
  'BASE_SUSHI_V2',
  'BASE_SUSHI_V3',
  'BASE_SOLIDLY_V3',
  'BASE_BALANCER_V2',
  'BASE_CURVE',
].join(',');

const AMM_ONLY =
  CHAIN_KEY === 'base-fork' || CHAIN_KEY === 'localnet'
    ? `&complexityLevel=0&mainRouteParts=1&parts=1&protocols=${FORK_AMMS}`
    : '';

/** Where a swap can actually land. Base mainnet, or a fork of it. */
export const CAN_SETTLE = CHAIN_KEY === 'base' || CHAIN_KEY === 'base-fork';

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
  /**
   * The exact input amount in the token's own units, when the caller has it.
   *
   * The router pulls precisely what the calldata says. Closing a whole position from `amount`
   * alone means scaling a float back to wei, which overshot a real WETH balance by 8 wei — the
   * delegation's `transferFrom` succeeded for the corrected amount and then the ROUTER reverted,
   * because the calldata was still asking for the eight it could not have. Both numbers have to
   * come from the same place, and that place is the chain.
   */
  amountRaw?: bigint;
  from: Address;
  receiver: Address;
  slippagePct?: number;
}): Promise<SwapCalldata> {
  // Quotes are a mainnet question and can be answered anywhere; a FILL cannot. On Base Sepolia
  // there is no 1inch router and none of these tokens exist, so calldata built here would be sent
  // to an address with no code and revert with nothing useful to show the user. Say what is
  // actually wrong instead, and say it before anything is signed.
  if (!CAN_SETTLE) {
    throw new Error(
      `Cannot fill on ${CHAIN_KEY}: 1inch has no deployment there. Prices are real (quoted against ` +
        `Base mainnet); settlement needs XORR_CHAIN=base-fork or base.`,
    );
  }
  const src = TOKENS[params.inSymbol];
  const dst = TOKENS[params.outSymbol];
  if (!src || !dst) throw new Error(`No route for ${params.inSymbol} -> ${params.outSymbol}`);

  const raw = params.amountRaw ?? scale(params.amount, src.decimals);
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
