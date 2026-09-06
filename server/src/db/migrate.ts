/**
 * Schema migrations, applied in order and recorded.
 *
 * `schema.sql` is the base — idempotent CREATE TABLE IF NOT EXISTS, safe to re-run — and every
 * change after it is a numbered file in `migrations/`. Both are needed: the base means a fresh
 * database is one command away, and the numbered files mean an EXISTING database can be brought
 * forward without anyone having to remember which ALTERs they have already run.
 *
 * Recorded in `schema_migrations`, so re-running this is free. That is what makes it safe to put
 * in a start script rather than a wiki page.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pool } from './index.js';

const here = import.meta.dirname;
const target = process.env.DATABASE_URL ?? 'default local xorr';
console.log(`migrating ${target}`);

await pool.query(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
await pool.query(
  `CREATE TABLE IF NOT EXISTS schema_migrations (
     name text PRIMARY KEY,
     applied_at timestamptz NOT NULL DEFAULT now()
   )`,
);

const dir = path.join(here, 'migrations');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort() : [];

for (const name of files) {
  const done = await pool.query(`SELECT 1 FROM schema_migrations WHERE name = $1`, [name]);
  if (done.rowCount) {
    console.log(`  skip ${name} (already applied)`);
    continue;
  }
  /*
   * Each migration runs in its own transaction, with its bookkeeping row written inside it.
   *
   * A migration that half-applied and then recorded itself as done is the worst outcome here —
   * every later run would skip it and the schema would be permanently wrong in a way nothing
   * detects. Same transaction, or neither.
   */
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(fs.readFileSync(path.join(dir, name), 'utf8'));
    await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [name]);
    await client.query('COMMIT');
    console.log(`  applied ${name}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`  FAILED ${name}: ${e instanceof Error ? e.message : e}`);
    throw e;
  } finally {
    client.release();
  }
}

const { rows } = await pool.query(
  `select table_name from information_schema.tables where table_schema='public' order by table_name`,
);
console.log('tables:', rows.map((r) => r.table_name).join(', '));
await pool.end();
