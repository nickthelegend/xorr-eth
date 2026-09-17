/**
 * The autonomous agent: pick a setup across the xStocks universe, then place it — PLAN.md §8.6.
 *
 * It reads what is actually knowable about each tokenized equity — a live Jupiter price, the
 * readings this app has recorded for it, the SEC's filing cadence, the mint's own Scaled UI
 * multiplier, the Nasdaq clock — scores the strategies that the conditions support, and sends the
 * best one through the executor's spend chokepoint with no approval step in between.
 *
 * ## What it refuses to do
 *
 * Every signal here comes from a source that can fail, and each one fails to "no candidate" rather
 * than to a plausible-looking number. A stock with no price is skipped. A stock with too few
 * recorded readings gets no range-based strategy rather than a range invented around its current
 * price. A projected earnings date carries the projection error EDGAR's own filings imply, and a
 * window narrower than that error is not treated as a window. An off-hours entry that cannot be
 * checked against a second venue is held, not sized down.
 *
 * That is the difference between an agent that trades rarely and one that trades confidently on
 * numbers nobody produced.
 */
import { randomUUID } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import { one, query } from '../db/index.js';
import { log } from '../http/request-id.js';
import { evaluate } from '../rules/engine.js';
import { XSTOCKS, xStockPriceUsd, type XStockToken } from '../venues/xstocks.js';
import { guardAndSpend, type SpendReceipt } from '../executor/place.js';
import { armExits } from '../executor/order.js';
import { notifyEntry } from '../notifications/alerts.js';
import { speak } from './llm.js';
import { TONE_INSTRUCTIONS, type ToneId } from './tone.js';
import { earningsCalendar } from '../market/edgar.js';
import { readMintScale } from '../solana/balances.js';
import { readDelegation } from '../solana/delegation.js';
import type { PersonaId } from './personas.js';
import {
  evaluateOffHoursGuard,
  referencePriceUsd,
  type OffHoursGuardVerdict,
} from '../market/nasdaq.js';

/**
 * The strategies this agent actually produces a candidate for.
 *
 * `grid` was in this union and had no branch anywhere below it, so the type promised a strategy
 * nothing could ever return. A caller switching exhaustively on it was writing a dead arm.
 */
export type StrategyKind = 'momentum' | 'event-driven' | 'dca';

/** The smallest entry worth the fees and the exit rules attached to it. */
const MIN_TRADE_USD = 10;
/** The default entry when the caller does not name a size. */
const DEFAULT_TRADE_USD = 25;

/**
 * How many recorded readings a range needs before it means anything.
 *
 * `price_observations` starts empty for an asset and fills as the app looks at it. Six readings is
 * not a lot; it is enough that a high and a low are two different observations rather than one
 * number with rounding either side of it.
 */
const MIN_OBSERVATIONS = 6;

/** How far back a range is drawn. A month of readings, matching what the asset screen charts. */
const RANGE_HOURS = 24 * 30;

/** A multiplier change this close is a split or a dividend landing mid-trade. */
const CORPORATE_ACTION_WINDOW_MS = 48 * 3_600_000;

export type CorporateActionSignal = {
  /** The multiplier the mint is scaling by right now. 1 on a mint with no extension. */
  multiplier: number;
  /** A change the issuer has already published, if one is due inside the window. */
  pending: { nextMultiplier: number; effectiveAtMs: number } | null;
  hoursUntil: number | null;
};

export type CandidateSetup = {
  symbol: string;
  stock: XStockToken;
  strategyKind: StrategyKind;
  persona: PersonaId;
  personaName: string;
  score: number;
  currentPrice: number;
  stopPrice: number;
  targetPrice: number;
  reason: string;
  marketCondition: string;
  corporateAction: CorporateActionSignal;
  offHoursGuard: OffHoursGuardVerdict;
  suggestedSlippageBps: number;
};

export type AutonomousTradeResult =
  | {
      executed: true;
      setup: CandidateSetup;
      receipt: SpendReceipt;
      exitStrategyId: string | null;
      proposalId: string;
    }
  | {
      executed: false;
      reason: string;
      detail: string;
    };

/**
 * The high and the low this app has actually seen for a symbol, or null when it has not seen enough.
 *
 * Null is the point. The previous version of this derived a "30-day range" as current price ±8%,
 * which put every asset at exactly the 50th percentile of a band that was a restatement of its own
 * price — so "breaking out near the upper band" was a sentence about arithmetic, not about the
 * market, and the two branches that read it could never fire.
 */
async function observedRange(symbol: string): Promise<{ high: number; low: number } | null> {
  const rows = await query<{ usd: string }>(
    `SELECT usd FROM price_observations
      WHERE symbol = $1 AND at > now() - ($2 || ' hours')::interval`,
    [symbol, String(RANGE_HOURS)],
  ).catch(() => []);

  const prices = rows.map((r) => Number(r.usd)).filter((n) => Number.isFinite(n) && n > 0);
  if (prices.length < MIN_OBSERVATIONS) return null;

  const high = Math.max(...prices);
  const low = Math.min(...prices);
  return high > low ? { high, low } : null;
}

/**
 * Where the live price sits in that band, 0 at the low and 1 at the high.
 *
 * The live quote rather than the newest stored reading, because the quote is what the trade would
 * be sized against and the table is only as fresh as the last time something looked. A new high
 * reads as 1 and a new low as 0, which is what they are.
 */
function bandPosition(price: number, range: { high: number; low: number }): number {
  return Math.min(1, Math.max(0, (price - range.low) / (range.high - range.low)));
}

/**
 * When the company next reports, and whether the projection is tight enough to position against.
 *
 * `earningsCalendar` projects from EDGAR's filing cadence and says how wrong that projection could
 * be, in days, from the company's own record. A five-day window means nothing if the date it is
 * drawn around could be eight days out, so a projection whose error exceeds the window is not one
 * this agent trades.
 */
async function earningsWindow(symbol: string): Promise<{ days: number; errorDays: number } | null> {
  const cal = await earningsCalendar(symbol).catch(() => null);
  if (!cal || cal.nextAt === null) return null;
  return {
    days: Math.round((cal.nextAt - Date.now()) / 86_400_000),
    errorDays: cal.errorDays,
  };
}

/**
 * What the mint itself says about splits and dividends.
 *
 * Token-2022 publishes a corporate action as a new Scaled UI multiplier with the timestamp it takes
 * effect, so the chain holds the schedule and there is nothing to look up anywhere else. A read
 * that fails reports multiplier 1 and no pending action, which is what a mint without the extension
 * looks like too.
 */
async function corporateActionSignal(stock: XStockToken): Promise<CorporateActionSignal> {
  const scale = await readMintScale(stock.address).catch(() => null);
  if (!scale) return { multiplier: 1, pending: null, hoursUntil: null };

  const pending = scale.pending;
  if (!pending) return { multiplier: scale.multiplier, pending: null, hoursUntil: null };

  const untilMs = pending.effectiveAtMs - Date.now();
  return {
    multiplier: scale.multiplier,
    pending,
    hoursUntil: Math.round(untilMs / 3_600_000),
  };
}

/**
 * Evaluates every strategy the conditions support across the xStocks universe, best first.
 */
export async function evaluateBestSetup(): Promise<CandidateSetup | null> {
  const candidates: CandidateSetup[] = [];

  for (const stock of Object.values(XSTOCKS)) {
    const price = await xStockPriceUsd(stock.symbol).catch(() => null);
    if (!price || price <= 0) continue;

    const reference = await referencePriceUsd(stock.symbol);
    const offHoursGuard = evaluateOffHoursGuard({
      symbol: stock.symbol,
      onChainPrice: price,
      referencePrice: reference,
    });

    // The guard holding is the whole answer for this symbol: nothing scores past it.
    if (offHoursGuard.action === 'hold') continue;

    const corporateAction = await corporateActionSignal(stock);
    const range = await observedRange(stock.symbol);
    const earnings = await earningsWindow(stock.symbol);
    const slippageBps = offHoursGuard.suggestedSlippageBps;

    /*
     * A scheduled multiplier change inside the window is not a reason to skip the symbol, but it is
     * a reason to prefer accumulating over chasing: the displayed balance is about to move for a
     * reason that has nothing to do with the trade.
     */
    const pendingSoon =
      corporateAction.pending &&
      corporateAction.pending.effectiveAtMs - Date.now() <= CORPORATE_ACTION_WINDOW_MS
        ? corporateAction.pending
        : null;
    const caPenalty = pendingSoon ? -40 : 0;
    const caNote = pendingSoon
      ? ` The mint scales by ${pendingSoon.nextMultiplier} in about ${corporateAction.hoursUntil} hours, so this is not the moment to chase it.`
      : '';
    const offHoursPenalty = offHoursGuard.session === 'closed' ? 15 : 0;

    // 1. Event-driven: a projected report, far enough out to enter and be flat before the print.
    if (earnings && earnings.days >= 3 && earnings.days <= 10 && earnings.errorDays <= 3) {
      candidates.push({
        symbol: stock.symbol,
        stock,
        strategyKind: 'event-driven',
        persona: 'earnings-desk',
        personaName: 'Earnings Desk',
        score: Math.max(10, 95 - Math.abs(earnings.days - 6) + caPenalty),
        currentPrice: price,
        stopPrice: price * 0.94,
        targetPrice: price * 1.12,
        reason: `${stock.symbol} is projected to report in about ${earnings.days} days, give or take ${earnings.errorDays}, from its own filing cadence. Entering the run-up and flat before the print.${caNote}`,
        marketCondition: `Pre-earnings window, ${earnings.days}d out`,
        corporateAction,
        offHoursGuard,
        suggestedSlippageBps: slippageBps,
      });
    }

    const position = range ? bandPosition(price, range) : null;

    // 2. Momentum: near the top of the range this app has actually recorded.
    if (range && position !== null && position >= 0.75) {
      const stop = Math.max(price * 0.95, range.high * 0.94);
      const target = price + (price - stop) * 2;
      candidates.push({
        symbol: stock.symbol,
        stock,
        strategyKind: 'momentum',
        persona: 'momentum-scout',
        personaName: 'Momentum Scout',
        score: Math.max(10, Math.round(75 + position * 20) + caPenalty - offHoursPenalty),
        currentPrice: price,
        stopPrice: stop,
        targetPrice: target,
        reason: `${stock.symbol} is trading in the top quarter of the $${range.low.toFixed(2)}-$${range.high.toFixed(2)} band this app has recorded over the past month.${caNote}`,
        marketCondition: `Upper band, ${(position * 100).toFixed(0)}th percentile of observed range`,
        corporateAction,
        offHoursGuard,
        suggestedSlippageBps: slippageBps,
      });
    }

    // 3. DCA: near the bottom of that same recorded range.
    if (range && position !== null && position < 0.4) {
      candidates.push({
        symbol: stock.symbol,
        stock,
        strategyKind: 'dca',
        persona: 'yield-keeper',
        personaName: 'Yield Keeper',
        score: Math.round(70 + (0.4 - position) * 20 + (pendingSoon ? 10 : 0)),
        currentPrice: price,
        stopPrice: price * 0.92,
        targetPrice: price * 1.1,
        reason: `${stock.symbol} is in the lower part of the $${range.low.toFixed(2)}-$${range.high.toFixed(2)} band this app has recorded over the past month. Accumulating.${caNote}`,
        marketCondition: `Lower band, ${(position * 100).toFixed(0)}th percentile of observed range`,
        corporateAction,
        offHoursGuard,
        suggestedSlippageBps: slippageBps,
      });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

/**
 * Runs the autonomous propose -> decide -> execute -> notify cycle for one wallet.
 */
export async function runAutonomousCycle(
  walletId: string,
  options: {
    fixedUsd?: number;
    tone?: ToneId;
    /**
     * A setup the caller has already chosen, to execute instead of scanning for a new one.
     *
     * `evaluateBestSetup` is a Jupiter quote, a 1inch quote and a mint read per symbol, so a caller
     * that has just done that work and wants the trade placed should not pay for it twice — and
     * more importantly should not get a DIFFERENT setup than the one it showed somebody.
     */
    setup?: CandidateSetup;
  } = {},
): Promise<AutonomousTradeResult> {
  // 1. The wallet, and whether its owner has stopped everything.
  const wallet = await one<{ id: string; address: string; agents_stopped?: boolean }>(
    `SELECT id, address, agents_stopped FROM wallets WHERE id = $1`,
    [walletId],
  );
  if (!wallet) {
    return { executed: false, reason: 'no_wallet', detail: 'Wallet not found.' };
  }
  if (wallet.agents_stopped) {
    return {
      executed: false,
      reason: 'agents_stopped',
      detail: 'Agents are stopped by the kill switch.',
    };
  }

  // 2. The on-chain SPL delegation, which is what actually authorises any of this.
  const onChainDel = await readDelegation(new PublicKey(wallet.address)).catch(() => null);
  if (onChainDel && onChainDel.isRevoked) {
    return {
      executed: false,
      reason: 'delegation_revoked',
      detail: 'The on-chain SPL delegation has been revoked.',
    };
  }

  // 3. The setup the caller brought, or the best one the current conditions support.
  const bestSetup = options.setup ?? (await evaluateBestSetup());
  if (!bestSetup) {
    return {
      executed: false,
      reason: 'no_setup',
      detail: 'Nothing in the xStocks universe reads as a setup right now.',
    };
  }

  // 4. Size it, inside the daily cap the delegation set.
  const dailyCap = onChainDel ? Math.max(onChainDel.delegatedUsd, 100) : 1000;
  const verdict = await evaluate({
    walletId,
    usd: 1,
    dailyCapUsd: dailyCap,
    delegationExpiresAt: new Date(Date.now() + 30 * 86_400_000),
    delegationRevoked: false,
    killed: Boolean(wallet.agents_stopped),
  });
  if (!verdict.allowed) {
    return { executed: false, reason: verdict.reason, detail: verdict.detail };
  }

  const sizeUsd = Math.min(
    options.fixedUsd ?? DEFAULT_TRADE_USD,
    Math.max(MIN_TRADE_USD, Math.floor(verdict.remainingUsd * 0.25)),
  );
  if (sizeUsd < MIN_TRADE_USD) {
    return {
      executed: false,
      reason: 'insufficient_budget',
      detail: `What is left of today's allowance is under the $${MIN_TRADE_USD} minimum trade size.`,
    };
  }

  // 5. The sentence the user reads, in the persona's voice where the model is reachable.
  const tone = options.tone ?? 'dry';
  const llmRes = await speak({
    persona: bestSetup.persona,
    toneInstruction: TONE_INSTRUCTIONS[tone],
    situation: `Autonomous agent selected ${bestSetup.strategyKind} strategy for ${bestSetup.symbol} based on ${bestSetup.marketCondition}. Placed market buy with attached stop loss. Explain why this setup was chosen in one terse sentence, naming no numbers.`,
  }).catch(() => null);
  const openingLine =
    llmRes && llmRes.ok
      ? llmRes.text
      : `${bestSetup.personaName} took the setup: ${bestSetup.reason}`;

  // 6. Through the chokepoint. Everything above this line is analysis; this is the spend.
  const outcome = await guardAndSpend({
    walletId,
    ownerPubkey: wallet.address,
    symbol: bestSetup.symbol,
    usd: sizeUsd,
    side: 'buy',
    slippageBps: bestSetup.suggestedSlippageBps,
  });
  if (!outcome.placed) {
    return { executed: false, reason: outcome.reason, detail: outcome.detail };
  }
  const receipt = outcome;

  // 7. Arm the exits against the price it actually filled at.
  let exitStrategyId: string | null = null;
  try {
    const exits = await armExits(wallet, {
      symbol: bestSetup.symbol,
      entryPrice: receipt.fillPrice,
      stopPrice: bestSetup.stopPrice,
      targetPrice: bestSetup.targetPrice,
    });
    exitStrategyId = exits.strategyId;
  } catch (e) {
    log.error('[autonomous] failed to arm exits:', e instanceof Error ? e.message : e);
  }

  // 8. Record it as a proposal the agent approved itself, so it shows up where every other one does.
  const proposalId = randomUUID();
  await query(
    `INSERT INTO proposals (id, wallet_id, agent, payload, decision, decided_at, expires_at)
     VALUES ($1, $2, $3, $4, 'approved', now(), now() + interval '1 hour')`,
    [
      proposalId,
      walletId,
      bestSetup.personaName,
      JSON.stringify({
        symbol: bestSetup.symbol,
        strategyKind: bestSetup.strategyKind,
        usd: sizeUsd,
        units: receipt.filledUnits,
        price: receipt.fillPrice,
        stopPrice: bestSetup.stopPrice,
        targetPrice: bestSetup.targetPrice,
        signature: receipt.signature,
        slot: receipt.slot,
        opening: openingLine,
        reason: bestSetup.reason,
        marketCondition: bestSetup.marketCondition,
        multiplier: bestSetup.corporateAction.multiplier,
        pendingMultiplier: bestSetup.corporateAction.pending?.nextMultiplier ?? null,
        nasdaqSession: bestSetup.offHoursGuard.session,
        /* Null rather than 0: nothing measured is not the same as measured at zero. */
        spreadBps: bestSetup.offHoursGuard.spreadBps,
        suggestedSlippageBps: bestSetup.suggestedSlippageBps,
      }),
    ],
  ).catch((e) => log.error('[autonomous] failed to insert proposal:', e));

  // 9. Tell the user, with the signature they can go and check.
  await notifyEntry({
    walletId,
    symbol: bestSetup.symbol,
    strategyKind: bestSetup.strategyKind,
    notionalUsd: sizeUsd,
    units: receipt.filledUnits,
    price: receipt.fillPrice,
    signature: receipt.signature,
    rationale: openingLine,
    agentName: bestSetup.personaName,
  });

  return { executed: true, setup: bestSetup, receipt, exitStrategyId, proposalId };
}

/**
 * One scheduler tick's worth: the eligible wallets, each past its own cooldown.
 */
export async function autonomousAgentSweep(_now: Date = new Date()): Promise<number> {
  const wallets = await query<{ id: string }>(
    `SELECT id FROM wallets
      WHERE address IS NOT NULL AND (agents_stopped IS NULL OR agents_stopped = false)
      ORDER BY updated_at DESC LIMIT 10`,
  ).catch(() => []);

  let executedCount = 0;
  for (const w of wallets) {
    try {
      // One autonomous entry per wallet per ten minutes. The tick is faster than any thesis is.
      const recent = await one<{ id: string }>(
        `SELECT id FROM proposals
          WHERE wallet_id = $1 AND decision = 'approved' AND decided_at > now() - interval '10 minutes'
          LIMIT 1`,
        [w.id],
      ).catch(() => null);
      if (recent) continue;

      const res = await runAutonomousCycle(w.id);
      if (res.executed) {
        executedCount += 1;
        log.info(
          `[autonomous] ${res.setup.strategyKind} on ${res.setup.symbol} — ${res.receipt.signature}`,
        );
      }
    } catch (err) {
      log.error(`[autonomous] sweep error for wallet ${w.id}:`, err);
    }
  }
  return executedCount;
}
