import { Router } from 'express';
import { pool } from '../db.js';
import { USER_COLUMNS, publicUser, requireAuth, requireModerator } from '../auth.js';
import { broadcast } from '../realtime.js';

const router = Router();
router.use(requireAuth, requireModerator);

const REVIEW_STATUSES = ['verified', 'hidden', 'new'];

router.get('/reports', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT r.*, e.title, u.name reporter_name
     FROM reports r
     JOIN events e ON e.id=r.event_id
     JOIN users u ON u.id=r.reporter_id
     WHERE r.status='open'
     ORDER BY r.created_at DESC`,
  );
  res.json({ reports: rows });
});

router.post('/events/:id/review', async (req, res) => {
  const status = REVIEW_STATUSES.includes(req.body?.status) ? req.body.status : 'new';
  const { rows } = await pool.query('UPDATE events SET trust_status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]);
  broadcast('event:reviewed', { id: req.params.id, status });
  res.json({ event: rows[0] });
});

router.post('/users/:id/verify', async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE users SET verified=$1 WHERE id=$2 RETURNING ${USER_COLUMNS}`,
    [!!req.body?.verified, req.params.id],
  );
  res.json({ user: publicUser(rows[0]) });
});

export default router;
