import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required to run migrations.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const here = path.dirname(fileURLToPath(import.meta.url));
const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const file of ['../schema.sql', '001_indexes.sql']) {
    const sql = await readFile(path.resolve(here, file), 'utf8');
    await client.query(sql);
  }
  await client.query('COMMIT');
  console.log('Database schema is up to date.');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Database migration failed:', error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
