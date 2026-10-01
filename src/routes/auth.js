import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { pool, PG_UNIQUE_VIOLATION } from '../db.js';
import { GOOGLE_CLIENT_ID } from '../env.js';
import { USER_COLUMNS, publicUser, setSession, clearSession } from '../auth.js';

const router = Router();
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidRegistration({ email, password, name } = {}) {
  return typeof email === 'string' && EMAIL_RE.test(email)
    && typeof password === 'string' && password.length >= 8 && password.length <= 200
    && typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 80;
}

router.post('/register', async (req, res) => {
  const body = req.body ?? {};
  if (!isValidRegistration(body)) return res.status(400).json({ error: 'INVALID_REGISTRATION' });
  const hash = await bcrypt.hash(body.password, 12);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users(email,password_hash,name) VALUES($1,$2,$3) RETURNING ${USER_COLUMNS}`,
      [body.email.trim().toLowerCase(), hash, body.name.trim()],
    );
    setSession(res, rows[0]);
    res.status(201).json({ user: publicUser(rows[0]) });
  } catch (e) {
    if (e.code === PG_UNIQUE_VIOLATION) return res.status(409).json({ error: 'EMAIL_EXISTS' });
    throw e;
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [
    typeof email === 'string' ? email.trim().toLowerCase() : null,
  ]);
  const user = rows[0];
  const passwordOk = user?.password_hash
    && await bcrypt.compare(typeof password === 'string' ? password : '', user.password_hash);
  if (!passwordOk) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  setSession(res, user);
  res.json({ user: publicUser(user) });
});

router.post('/google', async (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'GOOGLE_AUTH_NOT_CONFIGURED' });
  let profile;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: req.body?.credential, audience: GOOGLE_CLIENT_ID });
    profile = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'INVALID_GOOGLE_TOKEN' });
  }
  if (!profile?.email || !profile.email_verified) return res.status(401).json({ error: 'GOOGLE_EMAIL_NOT_VERIFIED' });
  const { rows } = await pool.query(
    `INSERT INTO users(email,google_id,name,avatar_url) VALUES($1,$2,$3,$4)
     ON CONFLICT(email) DO UPDATE SET
       google_id=COALESCE(users.google_id,EXCLUDED.google_id),
       name=EXCLUDED.name,
       avatar_url=COALESCE(EXCLUDED.avatar_url,users.avatar_url)
     RETURNING ${USER_COLUMNS}`,
    [profile.email.toLowerCase(), profile.sub, profile.name || profile.email.split('@')[0], profile.picture || null],
  );
  setSession(res, rows[0]);
  res.json({ user: publicUser(rows[0]) });
});

router.post('/logout', (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

export default router;
