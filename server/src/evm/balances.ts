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
import { TOKENS } from '../venues/oneinch.js';
import { priceOf } from '../market/prices.js';
import { usdcReserve } from '../market/yield.js';

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
let readableCache: string[] | null = null;

async function readableTokens(): Promise<[string, { address: Address; decimals: number }][]> {
  const entries = Object.entries(TOKENS).filter(([sym]) => sym !== 'ETH' && sym !== 'USDC');
  if (!readableCache) {
    const codes = await Promise.all(
      entries.map(([, t]) => publicClient.getCode({ address: t.address }).catch(() => undefined)),
    );
    readableCache = entries
      .filter((_, i) => (codes[i]?.length ?? 0) > 4)
      .map(([sym]) => sym);
  }
  const allowed = new Set(readableCache);
  return entries.filter(([sym]) => allowed.has(sym));
}

/** Testing only. */
export function clearReadableTokenCache(): void {
  readableCache = null;
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
