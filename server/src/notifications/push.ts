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
  if (tokens.length === 0) return { sent: 0, skipped: 0, errors: ['no registered devices'] };

  const messages = tokens.map((to) => ({
    to,
    title: msg.title,
    body: msg.body,
    // copy.md's restraint applies to sound: a trading app that pings all day gets muted.
    sound: null,
    data: { route: msg.route, ...msg.data },
  }));

  try {
    const res = await fetch(EXPO_PUSH, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!res.ok) return { sent: 0, skipped: tokens.length, errors: [`${res.status}`] };
    const json = (await res.json()) as { data?: { status: string; message?: string }[] };
    const rows = json.data ?? [];
    return {
      sent: rows.filter((r) => r.status === 'ok').length,
      skipped: rows.filter((r) => r.status !== 'ok').length,
      errors: rows.filter((r) => r.status !== 'ok').map((r) => r.message ?? 'unknown'),
    };
  } catch (e) {
    return { sent: 0, skipped: tokens.length, errors: [e instanceof Error ? e.message : String(e)] };
  }
}
