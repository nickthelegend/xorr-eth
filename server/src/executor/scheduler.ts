/**
 * The scheduler — PLAN.md 9.3 / §3.7.
 *
 * "A phone cannot be relied on to wake up at 09:00 to place a DCA buy — that is the whole promise
 * of trades while you chill." So the schedule lives here, on a server, and the phone is just a
 * window onto it.
 *
 * Safety comes from runStrategy's period claim, not from this loop: two schedulers, a restart
 * mid-run, or a manual trigger racing the tick all converge on one run per period.
 */
import { query } from '../db/index.js';
import { runStrategy, type StrategyRow } from './run.js';

const TICK_MS = Number(process.env.SCHEDULER_TICK_MS ?? 30_000);

export async function tick(now: Date = new Date()): Promise<number> {
  const due = await query<StrategyRow>(
    `SELECT * FROM strategies
     WHERE state IN ('live','watch') AND next_run_at IS NOT NULL AND next_run_at <= $1
     ORDER BY next_run_at ASC LIMIT 20`,
    [now],
  );
  let ran = 0;
  for (const s of due) {
    const outcome = await runStrategy(s, now);
    if (outcome.status !== 'skipped') ran += 1;
    console.log(`[scheduler] ${s.label}: ${outcome.status}`);
  }
  return ran;
}

export function startScheduler(): NodeJS.Timeout {
  console.log(`  scheduler every ${TICK_MS}ms`);
  return setInterval(() => {
    tick().catch((e: unknown) => console.error('[scheduler]', e));
  }, TICK_MS);
}
