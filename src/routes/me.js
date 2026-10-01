import { Router } from 'express';
import { pool } from '../db.js';
import { USER_COLUMNS, publicUser, requireAuth } from '../auth.js';
import { avatarUpload } from '../upload.js';
import { saveMedia, discardUpload } from '../../lib/storage.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { rows } = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id=$1`, [req.user.sub]);
  res.json({ user: rows[0] ? publicUser(rows[0]) : null });
});

router.patch('/', async (req, res) => {
  const { name, avatar_url } = req.body ?? {};
  const { rows } = await pool.query(
    `UPDATE users SET name=COALESCE($1,name),avatar_url=COALESCE($2,avatar_url) WHERE id=$3 RETURNING ${USER_COLUMNS}`,
    [name?.trim() || null, avatar_url || null, req.user.sub],
  );
  res.json({ user: publicUser(rows[0]) });
});

router.post('/avatar', avatarUpload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'AVATAR_REQUIRED' });
  try {
    const avatarUrl = await saveMedia(req.file, 'avatar');
    const { rows } = await pool.query(
      `UPDATE users SET avatar_url=$1 WHERE id=$2 RETURNING ${USER_COLUMNS}`,
      [avatarUrl, req.user.sub],
    );
    res.json({ user: publicUser(rows[0]) });
  } finally {
    await discardUpload(req.file);
  }
});

export default router;
