/**
 * Idempotency for state-changing requests.
 *
 * A client that sends a request and never sees the response has no safe way to retry: the request
 * may have succeeded, and doing it again could place a second trade or sign a second grant. The
 * fix is the one this codebase already uses for strategy runs — make the CHECK be the WRITE, so
 * there is no window between deciding to act and acting.
 *
 *   POST /strategies
 *   Idempotency-Key: 6f9c…
 *
 * The first request runs and its response is stored. Any later request with the same key gets that
 * same response back, byte for byte, without running anything. A duplicate arriving while the
 * first is still in flight is refused with 409 rather than run alongside it.
 *
 * Opt-in by header, deliberately. Making it mandatory would break every existing caller, and a
 * key the server invents for a client cannot deduplicate anything — the whole point is that the
 * SAME key comes back on a retry.
 */
import type { Context, Next } from 'hono';
import { one, query } from '../db/index.js';

/** 5xx is not cached: those are transient by definition and a retry should genuinely retry. */
function shouldStore(status: number): boolean {
  return status < 500;
}

export async function idempotency(c: Context, next: Next) {
  const key = c.req.header('idempotency-key');
  if (!key || c.req.method === 'GET' || c.req.method === 'OPTIONS') return next();

  const user = c.get('user') as { userId?: string } | undefined;
  // Without an identity there is nothing to scope the key to, and a global namespace would let one
  // caller read another's response by guessing a key.
  if (!user?.userId) return next();

  if (key.length > 200) {
    return c.json({ error: 'idempotency_key_too_long', message: 'Keys are at most 200 characters.' }, 400);
  }

  const existing = await one<{ status: number | null; body: string | null; path: string; method: string }>(
    `SELECT status, body, path, method FROM idempotency WHERE user_id = $1 AND key = $2`,
    [user.userId, key],
  );

  if (existing) {
    /*
     * The same key on a DIFFERENT request is a client bug, and a dangerous one.
     *
     * Replaying the stored response would answer a question the caller did not ask; running it
     * would defeat the key entirely. Refusing is the only option that cannot silently do the wrong
     * thing.
     */
    if (existing.path !== c.req.path || existing.method !== c.req.method) {
      return c.json(
        {
          error: 'idempotency_key_reused',
          message: `That key was already used for ${existing.method} ${existing.path}.`,
        },
        422,
      );
    }
    if (existing.status === null) {
      return c.json(
        { error: 'request_in_flight', message: 'An identical request is still being processed.' },
        409,
      );
    }
    return new Response(existing.body ?? '', {
      status: existing.status,
      headers: { 'content-type': 'application/json', 'idempotent-replay': 'true' },
    });
  }

  // Claim the key. A concurrent duplicate loses this insert and is told the request is in flight.
  const claimed = await query(
    `INSERT INTO idempotency (user_id, key, method, path) VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, key) DO NOTHING RETURNING key`,
    [user.userId, key, c.req.method, c.req.path],
  );
  if (claimed.length === 0) {
    return c.json(
      { error: 'request_in_flight', message: 'An identical request is still being processed.' },
      409,
    );
  }

  await next();

  const status = c.res.status;
  if (!shouldStore(status)) {
    /*
     * Release the claim on a server error.
     *
     * Leaving it would mean a retry of a request that failed for a transient reason gets 409
     * forever — the key would have permanently locked out the very operation it exists to make
     * safe to retry.
     */
    await query(`DELETE FROM idempotency WHERE user_id = $1 AND key = $2`, [user.userId, key]);
    return;
  }

  // Read the body without consuming it: the response still has to reach the caller.
  const body = await c.res.clone().text();
  await query(`UPDATE idempotency SET status = $3, body = $4 WHERE user_id = $1 AND key = $2`, [
    user.userId,
    key,
    status,
    body,
  ]);
}
