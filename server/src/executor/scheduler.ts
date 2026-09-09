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
import { log } from '../http/request-id.js';
import { runStrategy, type StrategyRow } from './run.js';
import { evaluateAlerts } from '../alerts/evaluate.js';
import { anchorSweep } from '../audit/anchor-sweep.js';

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

  /*
   * Alerts, after the strategies.
   *
   * After, because an alert about the day's cap or a blocked run should see this tick's runs
   * rather than the previous one's — a "your cap is nearly gone" notification that arrives thirty
   * seconds late is thirty seconds of trades the user did not get to stop.
   *
   * Deliberately not fatal to the tick. An alert sweep that throws must not stop the scheduler
   * from placing trades; the trades are the product and the alerts are commentary on them.
   */
  try {
    const outcomes = await evaluateAlerts();
    const fired = outcomes.filter((o) => o.action === 'fired');
    const broken = outcomes.filter((o) => o.action === 'unevaluable');
    for (const o of fired) console.log(`[alerts] fired "${o.name}": ${o.detail}`);
    for (const o of broken) log.warn(`[alerts] cannot evaluate "${o.name}": ${o.detail}`);
  } catch (e) {
    log.error('[alerts] sweep failed:', e instanceof Error ? e.message : e);
  }

  /*
   * Then the anchor sweep, last, and on its own cadence.
   *
   * Last because it publishes a commitment to the trail, and a commitment made before this tick's
   * rows were written would be stale the moment it landed. Non-fatal for the same reason the alert
   * sweep is: anchoring is a claim ABOUT the log, never a precondition for writing to it, and a
   * chain that is unreachable must not stop the product from trading.
   */
  try {
    const swept = await anchorSweep();
    if (swept?.anchored) console.log(`[anchor] ${swept.anchored} wallet(s) anchored`);
  } catch (e) {
    log.error('[anchor] sweep failed:', e instanceof Error ? e.message : e);
  }

  return ran;
}

export function startScheduler(): NodeJS.Timeout {
  console.log(`  scheduler every ${TICK_MS}ms`);
  return setInterval(() => {
    tick().catch((e: unknown) => log.error('[scheduler]', e));
  }, TICK_MS);
}
