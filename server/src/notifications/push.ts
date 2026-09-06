/**
 * Server-side push delivery — PLAN.md 12.19.
 *
 * Sends through Expo's push service. Delivery to a real handset needs a token from a physical
 * device, so this exercises Expo's API shape and the local device registry; the last hop is a
 * device requirement, recorded honestly rather than faked.
 */
import { query } from '../db/index.js';

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

export type PushMessage = {
  title: string;
  body: string;
  /** Deep link the app opens on tap — PLAN.md 10.10. */
  route: string;
  /**
   * Which kind of interruption this is.
   *
   * Carried so the client can honour the user's per-alert mutes on arrival, and so a delivery can
   * be traced back to the event that caused it. `strategy-blocked` is the one a user most needs:
   * it is the moment the safety layer did its job, and silence there looks identical to the bot
   * simply not trying.
   */
  kind?: string;
  data?: Record<string, unknown>;
};

export async function devicesFor(walletId: string): Promise<string[]> {
  const rows = await query<{ token: string }>(`SELECT token FROM devices WHERE wallet_id=$1`, [
    walletId,
  ]);
  return rows.map((r) => r.token);
}

export type PushResult = { sent: number; skipped: number; errors: string[] };

export async function send(walletId: string, msg: PushMessage): Promise<PushResult> {
  const tokens = await devicesFor(walletId);
  if (tokens.length === 0) {
    // Worth saying out loud. A trade that settled and told nobody looks identical, from the logs,
    // to a notification path that works — which is how this stayed unwired for so long.
    console.log(`[push] ${msg.kind ?? 'event'}: no registered devices for wallet ${walletId}`);
    return { sent: 0, skipped: 0, errors: ['no registered devices'] };
  }

  const messages = tokens.map((to) => ({
    to,
    title: msg.title,
    body: msg.body,
    // copy.md's restraint applies to sound: a trading app that pings all day gets muted.
    sound: null,
    data: { route: msg.route, kind: msg.kind, ...msg.data },
  }));

  try {
    const res = await fetch(EXPO_PUSH, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      console.log(`[push] ${msg.kind ?? 'event'}: Expo returned ${res.status}`);
      return { sent: 0, skipped: tokens.length, errors: [`${res.status}`] };
    }
    const json = (await res.json()) as { data?: { status: string; message?: string }[] };
    const rows = json.data ?? [];
    const result = {
      sent: rows.filter((r) => r.status === 'ok').length,
      skipped: rows.filter((r) => r.status !== 'ok').length,
      errors: rows.filter((r) => r.status !== 'ok').map((r) => r.message ?? 'unknown'),
    };
    console.log(
      `[push] ${msg.kind ?? 'event'}: sent ${result.sent}, skipped ${result.skipped}` +
        (result.errors.length ? ` — ${result.errors[0]}` : ''),
    );
    return result;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.log(`[push] ${msg.kind ?? 'event'}: failed — ${detail}`);
    return { sent: 0, skipped: tokens.length, errors: [detail] };
  }
}
