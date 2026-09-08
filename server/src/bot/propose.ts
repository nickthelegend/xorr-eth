/**
 * The proposal producer — PLAN.md 12.18 / 12.10.
 *
 * The approve-before-execute pipeline existed with no producer: `/proposals/current` returned null
 * forever and the Bot tab rendered an empty thread. This is the missing half.
 *
 * Every number in a proposal is COMPUTED from live market data and the user's own limits — the
 * model is never asked for one. It writes the sentence; arithmetic is ours. PLAN.md §3.2.
 *
 * The rule that decides whether to propose at all is deliberately simple and legible: a breakout
 * of the recent range on the strategy's own symbol. A user can check it against the chart. It is
 * tier 6 on the ladder (§1.2), so it ships behind approval by default — which is exactly what a
 * proposal IS.
 */
import { randomUUID } from 'node:crypto';
import { one, query } from '../db/index.js';
import { priceOf } from '../market/prices.js';
import { getJson } from '../http/get.js';
import { evaluate } from '../rules/engine.js';
import { speak, fallbackLine } from './llm.js';
import { TONE_INSTRUCTIONS, type ToneId } from './tone.js';
import { readPolicy } from '../evm/delegation.js';
import type { Address } from 'viem';

/**
 * What the bot proposes on when the wallet has no strategy to take a hint from.
 *
 * WETH: the deepest book this executor can route and settle on Base. The previous default was
 * `'SOL'`, which has no token on this chain at all.
 */
const DEFAULT_PROPOSAL_SYMBOL = 'WETH';

const COINGECKO = 'https://api.coingecko.com/api/v3';
const IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', DOGE: 'dogecoin',
  HYPE: 'hyperliquid', AAVE: 'aave', LINK: 'chainlink', TON: 'the-open-network',
};

export type ProposalPayload = {
  symbol: string;
  status: string;
  opening: string;
  action: string;
  notional: string;
  entry: string;
  stop: string;
  target: string;
  rationale: string;
  onApprove: string;
  onSkip: string;
};

const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Recent daily range for the symbol — the reference a breakout is measured against. */
async function range(symbol: string): Promise<{ high: number; low: number } | null> {
  const id = IDS[symbol];
  if (!id) return null;
  const rows = await getJson<[number, number, number, number, number][]>(
    `${COINGECKO}/coins/${id}/ohlc?vs_currency=usd&days=30`,
    10 * 60_000,
  ).catch(() => null);
  if (!rows || rows.length < 5) return null;
  return {
    high: Math.max(...rows.map((r) => r[2])),
    low: Math.min(...rows.map((r) => r[3])),
  };
}

export type ProposeResult =
  | { created: true; id: string; payload: ProposalPayload }
  | { created: false; reason: string; detail: string };

/**
 * Consider proposing a trade. Returns why it declined when it declines — and that decline is
 * written to the audit trail by the caller, because "what it chose not to do" is the product.
 */
export async function propose(walletId: string, tone: ToneId = 'dry'): Promise<ProposeResult> {
  const open = await one<{ id: string }>(
    `SELECT id FROM proposals WHERE wallet_id=$1 AND decision IS NULL AND expires_at > now() LIMIT 1`,
    [walletId],
  );
  if (open) return { created: false, reason: 'already_open', detail: 'A proposal is already waiting.' };

  /*
   * Read the CHAIN, like every other path that asks this question.
   *
   * This read the `delegations` table, which only has a row when the grant came through this
   * executor. A permission granted any other way — a script, another device, the contract
   * directly — is invisible to it, so the Agents tab told a wallet with a live $2,810/day
   * on-chain cap "No trading permission has been granted." and the bot proposed nothing, ever.
   * `/judge` asserts on that very screen that the permission is "read from the chain, never from
   * our database"; this was the one path where that was not true.
   *
   * `readPolicy` is what `/orders`, `/strategies` and `run.ts` already use.
   */
  const ownerAddress = (
    await one<{ address: string }>(`SELECT address FROM wallets WHERE id = $1`, [walletId])
  )?.address as Address | undefined;
  if (!ownerAddress) {
    return { created: false, reason: 'no_wallet', detail: 'This wallet has no address on file.' };
  }
  const del = await readPolicy(ownerAddress);
  if (!del) return { created: false, reason: 'no_delegation', detail: 'No trading permission has been granted.' };

  /*
   * Propose on a symbol the user actually has a strategy for.
   *
   * The fallback was `'SOL'` — Solana, in an app that settles on Base, where it has no token, no
   * route and no way to fill. A wallet with no strategies got a proposal for an instrument the
   * executor would refuse at the venue. The settlement default is the one the rest of the client
   * already uses for "pick one".
   */
  const strat = await one<{ symbol: string }>(
    `SELECT symbol FROM strategies WHERE wallet_id=$1 AND symbol <> 'PORTFOLIO'
     ORDER BY created_at DESC LIMIT 1`,
    [walletId],
  );
  const symbol = strat?.symbol ?? DEFAULT_PROPOSAL_SYMBOL;

  const [price, band] = await Promise.all([priceOf(symbol).catch(() => 0), range(symbol)]);
  if (!price || !band) {
    return { created: false, reason: 'no_market_data', detail: `No live market for ${symbol}.` };
  }

  // Size it at a quarter of the remaining daily cap, so a proposal can never be the whole budget.
  const verdict = await evaluate({
    walletId,
    usd: 1,
    dailyCapUsd: del.dailyCapUsd,
    delegationExpiresAt: new Date(del.expiresAt),
    delegationRevoked: del.revoked,
  });
  if (!verdict.allowed) return { created: false, reason: verdict.reason, detail: verdict.detail };

  const notional = Math.max(10, Math.round((verdict.remainingUsd + 1) * 0.25));
  const units = notional / price;

  // The setup: is price in the top decile of its 30-day range?
  const position = (price - band.low) / Math.max(band.high - band.low, 1e-9);
  if (position < 0.9) {
    return {
      created: false,
      reason: 'no_setup',
      detail: `${symbol} is mid-range, so there is nothing worth proposing.`,
    };
  }

  // Risk is derived, never invented: stop under the range, target at the same distance x2.
  const stop = Math.min(price * 0.99, band.high * 0.995);
  const risk = price - stop;
  const target = price + risk * 2;

  const said = await speak({
    persona: 'momentum-scout',
    toneInstruction: TONE_INSTRUCTIONS[tone],
    situation: `${symbol} is trading at the top of its thirty-day range. You are proposing a long with a stop under the range high. Explain the setup in one sentence, naming no figures.`,
  });

  const payload: ProposalPayload = {
    symbol,
    status: `Watching ${Object.keys(IDS).length} markets`,
    opening: said.ok ? said.text : fallbackLine('momentum-scout'),
    action: `Buy ${units.toFixed(4)} ${symbol}`,
    notional: money(notional),
    entry: money(price),
    stop: money(stop),
    target: money(target),
    rationale: `Risking ${money(risk * units)} to make ${money(risk * 2 * units)}. Within your ${money(del.dailyCapUsd)} daily cap.`,
    onApprove: `Filled ${units.toFixed(4)} ${symbol} at ${money(price)}. Stop set at ${money(stop)}.`,
    onSkip: `Skipped. I will not re-propose ${symbol} today.`,
  };

  const row = await one<{ id: string }>(
    `INSERT INTO proposals (id, wallet_id, agent, payload, expires_at)
     VALUES ($1,$2,'Momentum Scout',$3, now() + interval '252 seconds') RETURNING id`,
    [randomUUID(), walletId, JSON.stringify(payload)],
  );
  return { created: true, id: row!.id, payload };
}
