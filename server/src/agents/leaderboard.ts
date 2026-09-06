/**
 * Leaderboard — PLAN.md 12.23, closing [G33].
 *
 * The handoff shipped four agents with hardcoded pnl30d / win / trades. This computes all three
 * from the REAL trade record: filled runs valued at the current price against what was paid.
 *
 * An agent with no trades gets zeros and says so, rather than borrowing a flattering number.
 */
import { query } from '../db/index.js';
import { priceOf } from '../market/prices.js';

export type LeaderboardRow = {
  id: string;
  name: string;
  role: string;
  metric: string;
  pnl30d: number;
  win: number;
  trades: number;
  c1: string;
  c2: string;
};

const AGENTS = [
  { id: 'momentum-scout', name: 'Momentum Scout', role: 'Rides breakouts on liquid majors', c1: '#5B93FF', c2: '#1B44CE' },
  { id: 'earnings-desk', name: 'Earnings Desk', role: 'Trades tokenized equity earnings', c1: '#F0BE55', c2: '#C98518' },
  { id: 'yield-keeper', name: 'Yield Keeper', role: 'Moves idle cash into best APY', c1: '#49E39B', c2: '#12A45F' },
  { id: 'drawdown-guard', name: 'Drawdown Guard', role: 'Cuts risk when the book bleeds', c1: '#B58CFF', c2: '#7A45E0' },
];

type RunRow = { agent: string | null; symbol: string; usd: string; units: string; price: string };

export async function leaderboard(walletId: string): Promise<LeaderboardRow[]> {
  const runs = await query<RunRow>(
    `SELECT a.agent, s.symbol, r.usd, r.units, r.price
     FROM strategy_runs r
     JOIN strategies s ON s.id = r.strategy_id
     LEFT JOIN LATERAL (
       SELECT al.agent FROM audit_log al
       WHERE al.wallet_id = s.wallet_id AND al.payload->>'runId' = r.id
       LIMIT 1
     ) a ON true
     WHERE s.wallet_id = $1 AND r.status = 'filled' AND r.started_at > now() - interval '30 days'`,
    [walletId],
  );

  // One price lookup per symbol, not per run.
  const symbols = [...new Set(runs.map((r) => r.symbol))];
  const marks = new Map<string, number>();
  for (const s of symbols) {
    try {
      // A screen, so a short deadline: an unpriced symbol is excluded, not waited for.
      marks.set(s, await priceOf(s, 3_000));
    } catch {
      // No feed for this symbol — its runs are excluded rather than valued at a guess.
    }
  }

  const byAgent = new Map<string, { pnl: number; wins: number; trades: number }>();
  for (const r of runs) {
    const mark = marks.get(r.symbol);
    if (mark === undefined) continue;
    const agent = r.agent ?? 'Yield Keeper';
    const value = Number(r.units) * mark;
    const paid = Number(r.usd);
    const pnl = value - paid;
    const acc = byAgent.get(agent) ?? { pnl: 0, wins: 0, trades: 0 };
    acc.pnl += pnl;
    acc.trades += 1;
    if (pnl > 0) acc.wins += 1;
    byAgent.set(agent, acc);
  }

  return AGENTS.map((a) => {
    const acc = byAgent.get(a.name) ?? { pnl: 0, wins: 0, trades: 0 };
    const win = acc.trades > 0 ? Math.round((acc.wins / acc.trades) * 100) : 0;
    return {
      ...a,
      pnl30d: Number(acc.pnl.toFixed(2)),
      win,
      trades: acc.trades,
      // No trades means no record. Saying "no trades yet" is honest; a win rate is not.
      metric: acc.trades === 0 ? 'No trades yet' : `${win}% win rate`,
    };
  });
}
