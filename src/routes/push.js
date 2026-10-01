import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

router.post('/subscribe', requireAuth, async (req, res) => {
  const subscription = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ error: 'INVALID_SUBSCRIPTION' });
  await pool.query(
    `INSERT INTO push_subscriptions(user_id,subscription,latitude,longitude,updated_at) VALUES($1,$2,$3,$4,NOW())
     ON CONFLICT(user_id) DO UPDATE SET
       subscription=EXCLUDED.subscription,
       latitude=EXCLUDED.latitude,
       longitude=EXCLUDED.longitude,
       updated_at=NOW()`,
    [req.user.sub, subscription, subscription.latitude || null, subscription.longitude || null],
  );
  res.status(201).json({ ok: true });
});

export default router;
