import pg from 'pg';
import { DATABASE_URL, IS_NETLIFY } from './env.js';

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: IS_NETLIFY ? 1 : 10,
  idleTimeoutMillis: 30000,
});

export const PG_UNIQUE_VIOLATION = '23505';
