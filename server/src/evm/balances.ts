/**
 * What a wallet actually holds, read from the chain.
 *
 * `/wallet/balance` returned a hardcoded 0 — so the home screen said "$0.00" while the user held a
 * real position, and "Available to trade $0.00" while their USDC sat there. A zero that is not
 * measured is the same class of lie as an invented price: it looks like an answer.
 *
 * Cash and holdings are different questions and the app asks both. Cash is spendable USDC.
 * Holdings are everything else, priced by the same feeds the market screens use, so a portfolio
 * total and a market row can never disagree.
 */
import { erc20Abi, formatUnits, type Address } from 'viem';
import { publicClient } from './client.js';
import { ADDRESSES } from './chains.js';
import { TOKENS, canonicalSymbol } from '../venues/oneinch.js';
import { priceOf } from '../market/prices.js';
import { aavePoolIsDeployedHere, usdcReserve } from '../market/yield.js';

export type Holding = {
  symbol: string;
  units: number;
  usd: number;
  /**
   * The balance exactly as the chain holds it.
   *
   * `units` is a float and cannot represent a wei count. Selling a whole position by converting
   * back — `BigInt(Math.floor(units * 10 ** decimals))` — overshot a real WETH balance by 8 wei,
   * and `transferFrom` reverted for asking for more than existed. It failed as an opaque
   * "closePosition reverted", which on a stop-loss is the worst possible moment for a rounding
   * error to surface.
   *
   * Anything that closes a WHOLE position must use this. Percentages and displays can use `units`.
   */
  raw: bigint;
};

/** Spendable USDC, in dollars. */
export async function cashUsd(owner: Address): Promise<number> {
  const raw = await publicClient.readContract({
    address: ADDRESSES.usdcBase,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner],
  });
  return Number(formatUnits(raw, 6));
}

/**
 * Which tokens this chain can actually be asked about.
 *
 * Ondo's tokenized equities have the single byte 0xef as their entire account code — they are
 * implemented natively in the Base node — so on a fork any call to them halts the EVM with
 * OpcodeNotFound. That is not a revert: `allowFailure` does not catch it, and one of them in a
 * multicall takes the whole batch down, which is how a funded wallet came back with no holdings.
 *
 * Code length is checked once and cached, because it cannot change for a given chain.
 */
/**
 * What the chain has at each token's address: code that can be called, code that cannot, or nothing.
 *
 * `unreadable` is the Ondo case above. `absent` is a registry address with no contract on this chain at
 * all — mainnet cbBTC on Base Sepolia — where a wallet holds none, which is an answer and not an
 * unknown (PLAN.md 2.7). A lookup that fails throws and is not remembered: cached as unreadable, one RPC
 * hiccup at boot hid a token from every balance for the life of the process.
 */
type CodeState = 'readable' | 'unreadable' | 'absent';
let codeCache: Map<string, CodeState> | null = null;

async function codeStates(): Promise<Map<string, CodeState>> {
  if (codeCache) return codeCache;
  const entries = Object.entries(TOKENS).filter(([sym]) => sym !== 'ETH' && sym !== 'USDC');
  const codes = await Promise.all(entries.map(([, t]) => publicClient.getCode({ address: t.address })));
  codeCache = new Map(
    entries.map(([sym], i): [string, CodeState] => {
      const length = codes[i]?.length ?? 0;
      return [sym, length > 4 ? 'readable' : length > 2 ? 'unreadable' : 'absent'];
    }),
  );
  return codeCache;
}

async function readableTokens(): Promise<[string, { address: Address; decimals: number }][]> {
  const states = await codeStates();
  return Object.entries(TOKENS).filter(([sym]) => states.get(sym) === 'readable');
}

/** Testing only. */
export function clearReadableTokenCache(): void {
  codeCache = null;
}

/**
 * Every tradable token this wallet holds, priced.
 *
 * One multicall rather than a read per token: a wallet screen that makes twelve round trips is a
 * wallet screen that feels broken. Anything we cannot price is reported with `usd: 0` rather than
 * dropped, so the units still show and the missing price is visible instead of silent.
 */
export async function holdings(owner: Address): Promise<Holding[]> {
  const entries = await readableTokens();

  const balances = await publicClient.multicall({
    allowFailure: true,
    contracts: entries.map(([, t]) => ({
      address: t.address,
      abi: erc20Abi,
      functionName: 'balanceOf' as const,
      args: [owner] as const,
    })),
  });

  const held: { symbol: string; units: number; raw: bigint }[] = [];
  entries.forEach(([symbol, token], i) => {
    const r = balances[i];
    if (!r || r.status !== 'success') return;
    const raw = r.result as bigint;
    const units = Number(formatUnits(raw, token.decimals));
    if (units > 0) held.push({ symbol, units, raw });
  });

  return Promise.all(
    held.map(async ({ symbol, units, raw }) => {
      const price = await priceOf(symbol).catch(() => 0);
      return { symbol, units, usd: units * price, raw };
    }),
  );
}

/**
 * How many units of each symbol this wallet holds on the chain — for holding a ledger to it (PLAN.md 2.7).
 *
 * `null` for a symbol this chain cannot be asked about: not in the registry, the settlement token, or one
 * whose code cannot be called here (see `codeStates`). That means "not checked", never "holds none". `0`
 * where the registry address has no contract on this chain at all: nothing can be held there. One
 * multicall, and a read that fails throws, so a failure cannot come back as a zero.
 */
export async function chainUnitsOf(owner: Address, symbols: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>(symbols.map((s) => [s, null]));
  /*
   * Asked under the registry's name, answered under the ledger's.
   *
   * Ledger rows can predate the registry's spelling — `CBBTC` for `cbBTC` — and looked up as written
   * they were never checked at all. Two rows spelling one token differently would each be held to the
   * whole balance; the book has none, and the unique index is per spelling, so it is said here.
   */
  const spellings = new Map<string, string[]>();
  for (const s of new Set(symbols)) {
    const name = canonicalSymbol(s);
    if (!TOKENS[name] || name === 'ETH' || name === 'USDC') continue;
    spellings.set(name, [...(spellings.get(name) ?? []), s]);
  }
  // Nothing in the registry means nothing to ask, and no code checks either.
  if (spellings.size === 0) return out;
  const states = await codeStates();
  for (const [name, spelled] of spellings) {
    // No contract at this address on this chain: the wallet holds none of it here.
    if (states.get(name) === 'absent') for (const s of spelled) out.set(s, 0);
  }
  const readable = new Map(await readableTokens());
  const asked = [...spellings.keys()].filter((name) => readable.has(name));
  if (asked.length === 0) return out;
  const balances = await publicClient.multicall({
    allowFailure: false,
    contracts: asked.map((name) => ({
      address: readable.get(name)!.address,
      abi: erc20Abi,
      functionName: 'balanceOf' as const,
      args: [owner] as const,
    })),
  });
  asked.forEach((name, i) => {
    const units = Number(formatUnits(balances[i] as bigint, readable.get(name)!.decimals));
    for (const s of spellings.get(name)!) out.set(s, units);
  });
  return out;
}

/**
 * USDC the user has supplied to Aave, in dollars.
 *
 * This is not in `TOKENS` on purpose — `TOKENS` is the registry of things you can SWAP, and an
 * aToken is a receipt, not a market. But it is unmistakably the user's money, and leaving it out
 * of the total made tier 4 look like it deleted cash: the balance dropped by the supplied amount
 * and nothing appeared anywhere to account for it.
 *
 * aUSDC is rebasing — the balance itself grows with the interest — so the balance IS the value,
 * at 1:1 with USDC. There is no price to look up.
 *
 * Returns 0 where there is no Aave deployment to read, which is the true answer on a chain that
 * has none. A read that FAILS throws, so the caller can tell "nothing supplied" from "could not
 * ask" instead of showing both as zero.
 */
export async function suppliedUsd(owner: Address): Promise<number> {
  /*
   * Where there is no pool, say so before asking mainnet about one (PLAN.md 2.4).
   *
   * The reserve comes from Base mainnet over the free public endpoint, and it was asked first — so on
   * Sepolia every balance paid that round trip, and whatever back-off the endpoint's throttle imposed,
   * only to find the aToken has no code here and answer 0.
   */
  if (!(await aavePoolIsDeployedHere())) return 0;
  const reserve = await usdcReserve();
  const code = await publicClient.getCode({ address: reserve.aToken }).catch(() => undefined);
  if ((code?.length ?? 0) <= 4) return 0;
  const raw = await publicClient.readContract({
    address: reserve.aToken,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner],
  });
  return Number(formatUnits(raw, 6));
}

/** Cash plus holdings plus anything supplied — the number on the home screen. */
export async function totalValueUsd(owner: Address): Promise<{
  cash: number;
  holdings: Holding[];
  supplied: number;
  total: number;
}> {
  const [cash, rows, supplied] = await Promise.all([
    cashUsd(owner),
    holdings(owner),
    // Aave is a mainnet deployment reached over a public RPC, and a lending pool being slow is not
    // a reason for the home screen to have no balance. Unlike the zeros above, this one degrades
    // to "nothing supplied" only after saying so in the log.
    suppliedUsd(owner).catch((e: unknown) => {
      console.error('[balance] aToken read failed:', e instanceof Error ? e.message : e);
      return 0;
    }),
  ]);
  const total = cash + supplied + rows.reduce((a, h) => a + h.usd, 0);
  return { cash, holdings: rows, supplied, total };
}
