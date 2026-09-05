/**
 * The audit trail — PLAN.md 12.11, closing [G28].
 *
 * screens.md calls this "the compliance artifact", so it is built like one:
 *   - APPEND-ONLY, enforced by a database trigger, not by convention.
 *   - HASH-CHAINED: every row commits to the previous row's hash, so a single edited or deleted
 *     row breaks verification for everything after it.
 *   - One row per ACTION *and per NON-ACTION*. The "Skipped NVDAx / spread 0.42% > your 0.25%
 *     limit" row on screen 15 is the most trust-building pixel in the app, and it only exists
 *     because blocks are logged as first-class events.
 */
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { one, pool, query } from '../db/index.js';

export type AuditKind = 'trade' | 'risk' | 'block' | 'yield';

export type AuditEntry = {
  walletId: string;
  agent: string;
  action: string;
  detail: string;
  amount?: string;
  kind: AuditKind;
  signature?: string;
  payload?: Record<string, unknown>;
};

export type AuditRow = {
  seq: string;
  wallet_id: string;
  at: Date;
  agent: string;
  action: string;
  detail: string;
  amount: string;
  kind: AuditKind;
  signature: string | null;
  payload: Record<string, unknown>;
  prev_hash: string;
  hash: string;
};

const GENESIS = '0'.repeat(64);

/**
 * Canonical JSON: object keys sorted, recursively.
 *
 * Postgres JSONB does not preserve key order — it normalises objects internally — so hashing
 * `JSON.stringify(payload)` produces one digest on write and a different one on read, and the
 * chain fails to verify for reasons that have nothing to do with tampering. Sorting keys on both
 * sides makes the digest depend on the DATA rather than on how the database happened to store it.
 */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

/** The committed content of a row. Changing any field changes the hash. */
export function hashEntry(input: {
  prevHash: string;
  walletId: string;
  at: string;
  agent: string;
  action: string;
  detail: string;
  amount: string;
  kind: string;
  signature: string | null;
  payload: unknown;
}): string {
  const body = canonical([
    input.prevHash,
    input.walletId,
    input.at,
    input.agent,
    input.action,
    input.detail,
    input.amount,
    input.kind,
    input.signature ?? '',
    input.payload ?? {},
  ]);
  return createHash('sha256').update(body).digest('hex');
}

async function lastHash(walletId: string, client?: PoolClient): Promise<string> {
  const sql = `SELECT hash FROM audit_log WHERE wallet_id = $1 ORDER BY seq DESC LIMIT 1`;
  const rows = client
    ? (await client.query<{ hash: string }>(sql, [walletId])).rows
    : await query<{ hash: string }>(sql, [walletId]);
  return rows[0]?.hash ?? GENESIS;
}

export async function append(entry: AuditEntry, client?: PoolClient): Promise<AuditRow> {
  const prevHash = await lastHash(entry.walletId, client);
  const at = new Date().toISOString();
  const amount = entry.amount ?? '';
  const signature = entry.signature ?? null;
  const payload = entry.payload ?? {};
  const hash = hashEntry({
    prevHash,
    walletId: entry.walletId,
    at,
    agent: entry.agent,
    action: entry.action,
    detail: entry.detail,
    amount,
    kind: entry.kind,
    signature,
    payload,
  });

  const sql = `
    INSERT INTO audit_log (wallet_id, at, agent, action, detail, amount, kind, signature, payload, prev_hash, hash)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *`;
  const params = [
    entry.walletId,
    at,
    entry.agent,
    entry.action,
    entry.detail,
    amount,
    entry.kind,
    signature,
    JSON.stringify(payload),
    prevHash,
    hash,
  ];
  const rows = client
    ? (await client.query<AuditRow>(sql, params)).rows
    : await query<AuditRow>(sql, params);
  return rows[0]!;
}

export async function list(walletId: string, limit = 200): Promise<AuditRow[]> {
  return query<AuditRow>(
    `SELECT * FROM audit_log WHERE wallet_id = $1 ORDER BY seq DESC LIMIT $2`,
    [walletId, limit],
  );
}

/**
 * Verify the chain. Returns the first break, if any — which is what makes the export defensible:
 * anyone can re-run this over the exported file and see for themselves.
 */
export async function verify(walletId: string): Promise<{ ok: boolean; brokenAtSeq?: string; checked: number }> {
  const rows = await query<AuditRow>(
    `SELECT * FROM audit_log WHERE wallet_id = $1 ORDER BY seq ASC`,
    [walletId],
  );
  let prev = GENESIS;
  for (const r of rows) {
    if (r.prev_hash !== prev) return { ok: false, brokenAtSeq: r.seq, checked: rows.length };
    const expected = hashEntry({
      prevHash: r.prev_hash,
      walletId: r.wallet_id,
      at: new Date(r.at).toISOString(),
      agent: r.agent,
      action: r.action,
      detail: r.detail,
      amount: r.amount,
      kind: r.kind,
      signature: r.signature,
      payload: r.payload,
    });
    if (expected !== r.hash) return { ok: false, brokenAtSeq: r.seq, checked: rows.length };
    prev = r.hash;
  }
  return { ok: true, checked: rows.length };
}

const CSV_COLUMNS = [
  'seq',
  'at',
  'agent',
  'action',
  'detail',
  'amount',
  'kind',
  'signature',
  'prev_hash',
  'hash',
] as const;

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportTrail(walletId: string, format: 'csv' | 'json'): Promise<string> {
  const rows = await query<AuditRow>(
    `SELECT * FROM audit_log WHERE wallet_id = $1 ORDER BY seq ASC`,
    [walletId],
  );
  const check = await verify(walletId);
  if (format === 'json') {
    return JSON.stringify({ walletId, verified: check, rows }, null, 2);
  }
  const header = CSV_COLUMNS.join(',');
  const body = rows
    .map((r) => CSV_COLUMNS.map((c) => csvCell((r as unknown as Record<string, unknown>)[c])).join(','))
    .join('\n');
  // The verification result travels with the file, so the recipient does not have to trust us.
  const footer = `\n# chain_verified=${check.ok} rows=${check.checked}`;
  return `${header}\n${body}${footer}`;
}

export { pool, one, GENESIS };
