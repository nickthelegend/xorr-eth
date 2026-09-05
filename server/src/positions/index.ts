/**
 * Positions — PLAN.md 12.7.
 *
 * The handoff's screen 22 was entirely hardcoded (entry $63,880, mark $66,560, liquidation
 * $58,110). Nothing in the system produced a position, so there was nothing real for it to show.
 *
 * A spot position here is an average-cost lot: every fill adds units and moves the average cost.
 * Mark, unrealised P&L and percentage are computed against the LIVE price at read time, so the
 * screen shows what the book is actually worth rather than what a designer typed.
 */
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { query } from '../db/index.js';
import { priceOf } from '../market/prices.js';

export type PositionRow = {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  leverage: string;
  units: string;
  cost_usd: string;
  opened_at: Date;
};

export type Position = {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  leverage: number;
  /** Average cost per unit — the "Entry" row on screen 22. */
  entry: number;
  mark: number;
  liquidation: number;
  notional: number;
  margin: number;
  unrealised: number;
  unrealisedPct: number;
  units: number;
  fundingPaid: number;
  feed: 'live' | 'unavailable';
};

/** Record a fill against the position book. Always called inside the fill's own transaction. */
export async function applyFill(
  client: PoolClient,
  params: { walletId: string; symbol: string; units: number; usd: number },
): Promise<void> {
  await client.query(
    `INSERT INTO positions (id, wallet_id, symbol, side, units, cost_usd)
     VALUES ($1,$2,$3,'long',$4,$5)
     ON CONFLICT (wallet_id, symbol, side) DO UPDATE
       SET units = positions.units + EXCLUDED.units,
           cost_usd = positions.cost_usd + EXCLUDED.cost_usd,
           updated_at = now()`,
    [randomUUID(), params.walletId, params.symbol, params.units, params.usd],
  );
}

/**
 * Read the book, valued at the live mark.
 * A symbol with no feed comes back `feed: 'unavailable'` rather than with a guessed mark.
 */
export async function listPositions(walletId: string): Promise<Position[]> {
  const rows = await query<PositionRow>(
    `SELECT * FROM positions WHERE wallet_id=$1 AND units > 0 ORDER BY updated_at DESC`,
    [walletId],
  );

  const out: Position[] = [];
  for (const r of rows) {
    const units = Number(r.units);
    const cost = Number(r.cost_usd);
    const entry = units > 0 ? cost / units : 0;
    const leverage = Number(r.leverage);

    let mark = 0;
    let feed: 'live' | 'unavailable' = 'live';
    try {
      mark = await priceOf(r.symbol);
    } catch {
      feed = 'unavailable';
    }

    const value = units * mark;
    const unrealised = feed === 'live' ? value - cost : 0;
    out.push({
      id: r.id,
      symbol: r.symbol,
      side: r.side,
      leverage,
      entry,
      mark,
      // Spot cannot be liquidated. Reporting 0 is honest — the screen hides the row rather than
      // inventing a liquidation price for a position that has none.
      liquidation: leverage > 1 ? entry * (1 - 0.92 / leverage) : 0,
      notional: value,
      margin: leverage > 1 ? cost / leverage : cost,
      unrealised,
      unrealisedPct: cost > 0 && feed === 'live' ? (unrealised / cost) * 100 : 0,
      units,
      // Spot carries no funding. A perp position would accrue it; there are none yet.
      fundingPaid: 0,
      feed,
    });
  }
  return out;
}

export async function getPosition(walletId: string, id: string): Promise<Position | null> {
  const all = await listPositions(walletId);
  return all.find((p) => p.id === id) ?? all[0] ?? null;
}
