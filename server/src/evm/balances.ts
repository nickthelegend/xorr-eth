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

export type Holding = { symbol: string; units: number; usd: number };

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

  const held: { symbol: string; units: number }[] = [];
  entries.forEach(([symbol, token], i) => {
    const r = balances[i];
    if (!r || r.status !== 'success') return;
    const units = Number(formatUnits(r.result as bigint, token.decimals));
    if (units > 0) held.push({ symbol, units });
  });

  return Promise.all(
    held.map(async ({ symbol, units }) => {
      const price = await priceOf(symbol).catch(() => 0);
      return { symbol, units, usd: units * price };
    }),
  );
}

/** Cash plus holdings — the number on the home screen. */
export async function totalValueUsd(owner: Address): Promise<{
  cash: number;
  holdings: Holding[];
  total: number;
}> {
  const [cash, rows] = await Promise.all([cashUsd(owner), holdings(owner)]);
  const total = cash + rows.reduce((a, h) => a + h.usd, 0);
  return { cash, holdings: rows, total };
}
