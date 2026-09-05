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

  const del = await one<{ daily_cap_usd: string; expires_at: Date; revoked: boolean }>(
    `SELECT daily_cap_usd, expires_at, revoked FROM delegations
     WHERE wallet_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [walletId],
  );
  if (!del) return { created: false, reason: 'no_delegation', detail: 'No trading permission has been granted.' };

  // Propose on a symbol the user actually has a strategy for, or SOL as the default book.
  const strat = await one<{ symbol: string }>(
    `SELECT symbol FROM strategies WHERE wallet_id=$1 AND symbol <> 'PORTFOLIO'
     ORDER BY created_at DESC LIMIT 1`,
    [walletId],
  );
  const symbol = strat?.symbol ?? 'SOL';

  const [price, band] = await Promise.all([priceOf(symbol).catch(() => 0), range(symbol)]);
  if (!price || !band) {
    return { created: false, reason: 'no_market_data', detail: `No live market for ${symbol}.` };
  }

  // Size it at a quarter of the remaining daily cap, so a proposal can never be the whole budget.
  const cap = Number(del.daily_cap_usd);
  const verdict = await evaluate({
    walletId,
    usd: 1,
    dailyCapUsd: cap,
    delegationExpiresAt: new Date(del.expires_at),
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
    rationale: `Risking ${money(risk * units)} to make ${money(risk * 2 * units)}. Within your ${money(cap)} daily cap.`,
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
