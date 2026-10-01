import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import os from 'node:os';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import pg from 'pg';
import { OAuth2Client } from 'google-auth-library';
import { Server } from 'socket.io';
import webpush from 'web-push';

const { Pool } = pg;
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.NETLIFY_DB_URL, max: process.env.NETLIFY ? 1 : 10, idleTimeoutMillis: 30000 });
const google = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET;
if (isProduction && (!JWT_SECRET || JWT_SECRET.length < 32)) throw new Error('JWT_SECRET must be set to a strong 32+ character value in production');
// Netlify's function bundle is read-only. Multer may stage multipart uploads in
// /tmp, but media is rejected later unless persistent object storage is wired.
const uploadDir = process.env.NETLIFY ? path.join(os.tmpdir(), 'events-uploads') : path.join(process.cwd(), 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: process.env.NETLIFY ? 5 * 1024 * 1024 : 100 * 1024 * 1024 }, fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$|^video\/(mp4|webm|quicktime)$/.test(file.mimetype) ? null : new Error('UNSUPPORTED_MEDIA')) });
const avatarUpload = multer({ dest: uploadDir, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype) ? null : new Error('UNSUPPORTED_AVATAR')) });
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
const buckets = new Map();
function rateLimit({ windowMs = 60000, max = 60 } = {}) { return (req, res, next) => { const key = `${req.ip}:${req.path}`; const now = Date.now(); let b = buckets.get(key); if (!b || now - b.start >= windowMs) b = { start: now, count: 0 }; b.count++; buckets.set(key, b); if (b.count > max) return res.status(429).json({ error: 'RATE_LIMITED' }); next(); }; }
app.use('/api/', rateLimit({ max: 120 }));
app.use('/api/auth/', rateLimit({ max: 20 }));
app.use('/api/events', rateLimit({ max: 60 }));
if (!process.env.NETLIFY) {
  app.use('/uploads', express.static(uploadDir, { maxAge: '7d', immutable: true }));
  app.use(express.static(process.cwd(), { maxAge: isProduction ? '1h' : 0, dotfiles: 'deny' }));
}
function sign(user) { return jwt.sign({ sub: user.id, email: user.email, role: user.role || 'user' }, JWT_SECRET || 'development-only-secret', { expiresIn: '7d' }); }
function setSession(res, user) { res.cookie('access_token', sign(user), { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/', maxAge: 7 * 86400000 }); }
function auth(req, res, next) { const token = req.cookies.access_token || (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED' }); try { req.user = jwt.verify(token, JWT_SECRET || 'development-only-secret'); next(); } catch { res.status(401).json({ error: 'INVALID_SESSION' }); } }
function requireModerator(req, res, next) { if (!['moderator', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'MODERATOR_REQUIRED' }); next(); }
function publicUser(row) { return { id: row.id, email: row.email, name: row.name, avatar_url: row.avatar_url, role: row.role || 'user', verified: !!row.verified }; }
async function notifyNearby(event) { try { const { rows } = await pool.query(`SELECT p.user_id,p.subscription FROM push_subscriptions p WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL AND (6371*acos(least(1,cos(radians($1))*cos(radians(p.latitude))*cos(radians(p.longitude)-radians($2))+sin(radians($1))*sin(radians(p.latitude)))))<=30`, [event.latitude, event.longitude]); for (const r of rows) { await pool.query('INSERT INTO notifications(user_id,type,title,body,event_id) VALUES($1,$2,$3,$4,$5)', [r.user_id, 'nearby_event', 'Нова подія поруч', event.title, event.id]); if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) webpush.sendNotification(r.subscription, JSON.stringify({ title: 'Нова подія поруч', body: event.title, url: `/?event=${event.id}` })).catch(() => {}); } } catch (e) { console.error('notifyNearby', e.message); } }
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected', netlify: !!process.env.NETLIFY });
  } catch {
    res.status(503).json({ ok: false, database: 'unavailable', netlify: !!process.env.NETLIFY });
  }
});
app.get('/api/config', (_req, res) => res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || '', vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '', netlify: !!process.env.NETLIFY }));
app.post('/api/auth/register', async (req, res) => { try { const { email, password, name } = req.body; if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < 8 || password.length > 200 || typeof name !== 'string' || !name.trim() || name.trim().length > 80) return res.status(400).json({ error: 'INVALID_REGISTRATION' }); const hash = await bcrypt.hash(password, 12); const { rows } = await pool.query('INSERT INTO users(email,password_hash,name) VALUES($1,$2,$3) RETURNING id,email,name,avatar_url,role,verified', [email.trim().toLowerCase(), hash, name.trim()]); setSession(res, rows[0]); res.status(201).json({ user: publicUser(rows[0]) }); } catch (e) { res.status(e.code === '23505' ? 409 : 500).json({ error: e.code === '23505' ? 'EMAIL_EXISTS' : 'SERVER_ERROR' }); } });
app.post('/api/auth/login', async (req, res) => { try { const { email, password } = req.body; const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email?.trim().toLowerCase()]); if (!rows[0] || !rows[0].password_hash || !(await bcrypt.compare(password || '', rows[0].password_hash))) return res.status(401).json({ error: 'INVALID_CREDENTIALS' }); setSession(res, rows[0]); res.json({ user: publicUser(rows[0]) }); } catch { res.status(500).json({ error: 'SERVER_ERROR' }); } });
app.post('/api/auth/google', async (req, res) => { try { if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'GOOGLE_AUTH_NOT_CONFIGURED' }); const ticket = await google.verifyIdToken({ idToken: req.body.credential, audience: process.env.GOOGLE_CLIENT_ID }); const p = ticket.getPayload(); if (!p?.email || !p.email_verified) return res.status(401).json({ error: 'GOOGLE_EMAIL_NOT_VERIFIED' }); const { rows } = await pool.query(`INSERT INTO users(email,google_id,name,avatar_url) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO UPDATE SET google_id=COALESCE(users.google_id,EXCLUDED.google_id),name=EXCLUDED.name,avatar_url=COALESCE(EXCLUDED.avatar_url,users.avatar_url) RETURNING id,email,name,avatar_url,role,verified`, [p.email.toLowerCase(), p.sub, p.name || p.email.split('@')[0], p.picture || null]); setSession(res, rows[0]); res.json({ user: publicUser(rows[0]) }); } catch { res.status(401).json({ error: 'INVALID_GOOGLE_TOKEN' }); } });
app.post('/api/auth/logout', (_req, res) => { res.clearCookie('access_token'); res.status(204).end(); });
app.get('/api/me', auth, async (req, res) => { const { rows } = await pool.query('SELECT id,email,name,avatar_url,role,verified FROM users WHERE id=$1', [req.user.sub]); res.json({ user: rows[0] ? publicUser(rows[0]) : null }); });
app.patch('/api/me', auth, async (req, res) => { const { name, avatar_url } = req.body; const { rows } = await pool.query('UPDATE users SET name=COALESCE($1,name),avatar_url=COALESCE($2,avatar_url) WHERE id=$3 RETURNING id,email,name,avatar_url,role,verified', [name?.trim() || null, avatar_url || null, req.user.sub]); res.json({ user: publicUser(rows[0]) }); });
app.post('/api/me/avatar', auth, avatarUpload.single('avatar'), async (req, res) => { try { if (!req.file) return res.status(400).json({ error: 'AVATAR_REQUIRED' }); if (process.env.NETLIFY) { fs.rm(req.file.path, { force: true }, () => {}); return res.status(503).json({ error: 'MEDIA_STORAGE_NOT_CONFIGURED' }); } const ext = path.extname(req.file.originalname).replace(/[^a-z0-9.]/gi, '') || '.jpg'; const name = `avatar-${crypto.randomUUID()}${ext}`; fs.renameSync(req.file.path, path.join(uploadDir, name)); const { rows } = await pool.query('UPDATE users SET avatar_url=$1 WHERE id=$2 RETURNING id,email,name,avatar_url,role,verified', [`/uploads/${name}`, req.user.sub]); res.json({ user: publicUser(rows[0]) }); } catch { res.status(500).json({ error: 'SERVER_ERROR' }); } });
app.get('/api/events', async (req, res) => { const { q = '', category = 'all', lat, lng, radius = 30 } = req.query; const values = [], where = ["e.trust_status <> 'hidden'"]; if (category !== 'all') { values.push(category); where.push(`e.category=$${values.length}`); } if (q) { values.push(`%${q}%`); where.push(`(e.title ILIKE $${values.length} OR e.description ILIKE $${values.length} OR e.location_name ILIKE $${values.length})`); } let distance = 'NULL'; if (lat && lng) { values.push(Number(lat), Number(lng), Math.min(Number(radius) || 30, 100)); distance = `(6371*acos(least(1,cos(radians($${values.length-2}))*cos(radians(e.latitude))*cos(radians(e.longitude)-radians($${values.length-1}))+sin(radians($${values.length-2}))*sin(radians(e.latitude)))))`; where.push(`${distance} <= $${values.length}`); } const sql = `SELECT e.*,u.name author_name,u.avatar_url author_avatar,u.verified author_verified,COUNT(a.user_id) FILTER (WHERE a.status='going')::int going_count,${distance} distance_km FROM events e JOIN users u ON u.id=e.author_id LEFT JOIN event_attendance a ON a.event_id=e.id WHERE ${where.join(' AND ')} GROUP BY e.id,u.id ORDER BY e.created_at DESC LIMIT 100`; const { rows } = await pool.query(sql, values); res.json({ events: rows }); });
app.post('/api/events', auth, upload.single('media'), async (req, res) => { try { const { title, description, category, latitude, longitude, location_name } = req.body; const lat = Number(latitude), lng = Number(longitude); if (typeof title !== 'string' || !title.trim() || typeof description !== 'string' || !description.trim() || !['concert','street','sport','other'].includes(category) || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) return res.status(400).json({ error: 'INVALID_EVENT' }); if (req.file && process.env.NETLIFY) { fs.rm(req.file.path, { force: true }, () => {}); return res.status(503).json({ error: 'MEDIA_STORAGE_NOT_CONFIGURED' }); } let mediaUrl = null, mediaType = null; if (req.file) { const ext = path.extname(req.file.originalname).replace(/[^a-z0-9.]/gi, ''); const finalName = `${crypto.randomUUID()}${ext}`; fs.renameSync(req.file.path, path.join(uploadDir, finalName)); mediaUrl = `/uploads/${finalName}`; mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image'; } const { rows } = await pool.query(`INSERT INTO events(author_id,title,description,category,latitude,longitude,location_name,media_url,media_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [req.user.sub, title.trim().slice(0, 140), description.trim().slice(0, 1000), category, lat, lng, typeof location_name === 'string' ? location_name.trim().slice(0, 200) || null : null, mediaUrl, mediaType]); io.emit('event:created', rows[0]); notifyNearby(rows[0]); res.status(201).json({ event: rows[0] }); } catch (e) { if (req.file?.path) fs.rm(req.file.path, { force: true }, () => {}); res.status(e.message === 'UNSUPPORTED_MEDIA' ? 415 : 500).json({ error: e.message === 'UNSUPPORTED_MEDIA' ? 'UNSUPPORTED_MEDIA' : 'SERVER_ERROR' }); } });
app.post('/api/events/:id/attendance', auth, async (req, res) => { const status = req.body.status === 'declined' ? 'declined' : 'going'; await pool.query(`INSERT INTO event_attendance(event_id,user_id,status) VALUES($1,$2,$3) ON CONFLICT(event_id,user_id) DO UPDATE SET status=EXCLUDED.status`, [req.params.id, req.user.sub, status]); const { rows } = await pool.query(`SELECT COUNT(*) FILTER (WHERE status='going')::int going FROM event_attendance WHERE event_id=$1`, [req.params.id]); io.emit('event:attendance', { id: req.params.id, going: rows[0].going }); res.json(rows[0]); });
app.post('/api/events/:id/report', auth, async (req, res) => { const { reason = 'spam' } = req.body; try { await pool.query('INSERT INTO reports(event_id,reporter_id,reason) VALUES($1,$2,$3)', [req.params.id, req.user.sub, String(reason).slice(0, 300)]); await pool.query("UPDATE events SET trust_status='reported' WHERE id=$1 AND trust_status='new'", [req.params.id]); io.emit('event:reported', { id: req.params.id }); res.status(201).json({ ok: true }); } catch (e) { res.status(e.code === '23505' ? 409 : 500).json({ error: e.code === '23505' ? 'ALREADY_REPORTED' : 'SERVER_ERROR' }); } });
app.post('/api/push/subscribe', auth, async (req, res) => { if (!req.body?.endpoint) return res.status(400).json({ error: 'INVALID_SUBSCRIPTION' }); await pool.query(`INSERT INTO push_subscriptions(user_id,subscription,latitude,longitude,updated_at) VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(user_id) DO UPDATE SET subscription=EXCLUDED.subscription,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,updated_at=NOW()`, [req.user.sub, req.body, req.body.latitude || null, req.body.longitude || null]); res.status(201).json({ ok: true }); });
app.get('/api/notifications', auth, async (req, res) => { const { rows } = await pool.query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.sub]); res.json({ notifications: rows }); });
app.post('/api/notifications/:id/read', auth, async (req, res) => { await pool.query('UPDATE notifications SET read_at=NOW() WHERE id=$1 AND user_id=$2', [req.params.id, req.user.sub]); res.json({ ok: true }); });
app.get('/api/admin/reports', auth, requireModerator, async (_req, res) => { const { rows } = await pool.query(`SELECT r.*,e.title,u.name reporter_name FROM reports r JOIN events e ON e.id=r.event_id JOIN users u ON u.id=r.reporter_id WHERE r.status='open' ORDER BY r.created_at DESC`); res.json({ reports: rows }); });
app.post('/api/admin/events/:id/review', auth, requireModerator, async (req, res) => { const status = ['verified','hidden','new'].includes(req.body.status) ? req.body.status : 'new'; const { rows } = await pool.query('UPDATE events SET trust_status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]); io.emit('event:reviewed', { id: req.params.id, status }); res.json({ event: rows[0] }); });
app.post('/api/admin/users/:id/verify', auth, requireModerator, async (req, res) => { const { rows } = await pool.query('UPDATE users SET verified=$1 WHERE id=$2 RETURNING id,email,name,avatar_url,role,verified', [!!req.body.verified, req.params.id]); res.json({ user: publicUser(rows[0]) }); });
app.use((err, _req, res, _next) => { if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'FILE_TOO_LARGE' }); if (err?.message === 'UNSUPPORTED_MEDIA' || err?.message === 'UNSUPPORTED_AVATAR') return res.status(415).json({ error: err.message }); console.error(err); res.status(500).json({ error: 'SERVER_ERROR' }); });
io.on('connection', socket => socket.emit('connected', { ok: true }));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(process.cwd(), 'index.html')));
export { app, server };
if (!process.env.NETLIFY) server.listen(PORT, () => console.log(`EventsApplication running on :${PORT}`));
