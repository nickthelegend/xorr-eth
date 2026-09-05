import fs from 'node:fs';
import path from 'node:path';
import { pool } from './index.js';

const sql = fs.readFileSync(path.join(import.meta.dirname, 'schema.sql'), 'utf8');

const target = process.env.DATABASE_URL ?? 'default local xorr';
console.log(`migrating ${target}`);
await pool.query(sql);
const { rows } = await pool.query(
  `select table_name from information_schema.tables where table_schema='public' order by table_name`,
);
console.log('tables:', rows.map((r) => r.table_name).join(', '));
await pool.end();
