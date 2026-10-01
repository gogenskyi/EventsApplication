import { Router } from 'express';
import { pool } from '../db.js';
import { GOOGLE_CLIENT_ID, IS_NETLIFY, VAPID } from '../env.js';

const router = Router();

router.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected', netlify: IS_NETLIFY });
  } catch {
    res.status(503).json({ ok: false, database: 'unavailable', netlify: IS_NETLIFY });
  }
});

router.get('/config', (_req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID, vapidPublicKey: VAPID.publicKey, netlify: IS_NETLIFY });
});

export default router;
