import jwt from 'jsonwebtoken';
import { IS_PRODUCTION, JWT_SECRET, SESSION_DAYS } from './env.js';

const COOKIE_NAME = 'access_token';
const MODERATOR_ROLES = ['moderator', 'admin'];

/** Columns that are safe to return to clients; reuse in SELECT / RETURNING. */
export const USER_COLUMNS = 'id,email,name,avatar_url,role,verified';

export function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatar_url: row.avatar_url,
    role: row.role || 'user',
    verified: !!row.verified,
  };
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role || 'user' },
    JWT_SECRET,
    { expiresIn: `${SESSION_DAYS}d` },
  );
}

export function setSession(res, user) {
  res.cookie(COOKIE_NAME, signToken(user), {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400000,
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE_NAME);
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'INVALID_SESSION' });
  }
  next();
}

export function requireModerator(req, res, next) {
  if (!MODERATOR_ROLES.includes(req.user.role)) return res.status(403).json({ error: 'MODERATOR_REQUIRED' });
  next();
}
