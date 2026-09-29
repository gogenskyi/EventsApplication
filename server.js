import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import pg from 'pg';
import { Server } from 'socket.io';

const { Pool } = pg;
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const uploadDir = path.join(process.cwd(), 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$|^video\/(mp4|webm|quicktime)$/.test(file.mimetype))
});

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(uploadDir));
app.use(express.static(process.cwd()));

function sign(user) { return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' }); }
function auth(req, res, next) {
  const token = req.cookies.access_token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'INVALID_SESSION' }); }
}
function publicUser(row) { return { id: row.id, email: row.email, name: row.name, avatar_url: row.avatar_url }; }

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name || password.length < 8) return res.status(400).json({ error: 'Email, name and password (8+ chars) are required' });
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query('INSERT INTO users(email,password_hash,name) VALUES($1,$2,$3) RETURNING id,email,name,avatar_url', [email.trim().toLowerCase(), hash, name.trim()]);
    const token = sign(rows[0]);
    res.cookie('access_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7 * 86400000 });
    res.status(201).json({ user: publicUser(rows[0]) });
  } catch (e) { res.status(e.code === '23505' ? 409 : 500).json({ error: e.code === '23505' ? 'EMAIL_EXISTS' : 'SERVER_ERROR' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email?.trim().toLowerCase()]);
    if (!rows[0] || !rows[0].password_hash || !(await bcrypt.compare(password || '', rows[0].password_hash))) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    res.cookie('access_token', sign(rows[0]), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7 * 86400000 });
    res.json({ user: publicUser(rows[0]) });
  } catch { res.status(500).json({ error: 'SERVER_ERROR' }); }
});

app.post('/api/auth/logout', (_req, res) => { res.clearCookie('access_token'); res.status(204).end(); });
app.get('/api/me', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT id,email,name,avatar_url FROM users WHERE id=$1', [req.user.sub]);
  res.json({ user: rows[0] ? publicUser(rows[0]) : null });
});

app.patch('/api/me', auth, async (req, res) => {
  const { name, avatar_url } = req.body;
  const { rows } = await pool.query('UPDATE users SET name=COALESCE($1,name), avatar_url=COALESCE($2,avatar_url) WHERE id=$3 RETURNING id,email,name,avatar_url', [name?.trim() || null, avatar_url || null, req.user.sub]);
  res.json({ user: publicUser(rows[0]) });
});

app.get('/api/events', async (req, res) => {
  const { q = '', category = 'all', lat, lng, radius = 30 } = req.query;
  const values = [];
  let where = [];
  if (category !== 'all') { values.push(category); where.push(`e.category=$${values.length}`); }
  if (q) { values.push(`%${q}%`); where.push(`(e.title ILIKE $${values.length} OR e.description ILIKE $${values.length} OR e.location_name ILIKE $${values.length})`); }
  let distance = 'NULL';
  if (lat && lng) {
    values.push(Number(lat), Number(lng), Number(radius));
    distance = `(6371 * acos(least(1, cos(radians($${values.length-2})) * cos(radians(e.latitude)) * cos(radians(e.longitude) - radians($${values.length-1})) + sin(radians($${values.length-2})) * sin(radians(e.latitude)))))`;
    where.push(`${distance} <= $${values.length}`);
  }
  const sql = `SELECT e.*, u.name author_name, u.avatar_url author_avatar, COUNT(a.user_id) FILTER (WHERE a.status='going')::int going_count, ${distance} distance_km FROM events e JOIN users u ON u.id=e.author_id LEFT JOIN event_attendance a ON a.event_id=e.id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} GROUP BY e.id,u.id ORDER BY e.created_at DESC LIMIT 100`;
  const { rows } = await pool.query(sql, values);
  res.json({ events: rows });
});

app.post('/api/events', auth, upload.single('media'), async (req, res) => {
  try {
    const { title, description, category, latitude, longitude, location_name } = req.body;
    if (!title || !description || !category || !latitude || !longitude) return res.status(400).json({ error: 'Missing event fields' });
    let mediaUrl = null, mediaType = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname).replace(/[^a-z0-9.]/gi, '');
      const finalName = `${crypto.randomUUID()}${ext}`;
      fs.renameSync(req.file.path, path.join(uploadDir, finalName));
      mediaUrl = `/uploads/${finalName}`;
      mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
    }
    const { rows } = await pool.query(`INSERT INTO events(author_id,title,description,category,latitude,longitude,location_name,media_url,media_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [req.user.sub,title.trim(),description.trim(),category,Number(latitude),Number(longitude),location_name || null,mediaUrl,mediaType]);
    io.emit('event:created', rows[0]);
    res.status(201).json({ event: rows[0] });
  } catch { res.status(500).json({ error: 'SERVER_ERROR' }); }
});

app.post('/api/events/:id/attendance', auth, async (req, res) => {
  const status = req.body.status === 'declined' ? 'declined' : 'going';
  await pool.query(`INSERT INTO event_attendance(event_id,user_id,status) VALUES($1,$2,$3) ON CONFLICT(event_id,user_id) DO UPDATE SET status=EXCLUDED.status`, [req.params.id, req.user.sub, status]);
  const { rows } = await pool.query(`SELECT COUNT(*) FILTER (WHERE status='going')::int going FROM event_attendance WHERE event_id=$1`, [req.params.id]);
  io.emit('event:attendance', { id: req.params.id, going: rows[0].going });
  res.json(rows[0]);
});

app.post('/api/events/:id/report', auth, async (req, res) => {
  const { reason = 'spam' } = req.body;
  try { await pool.query('INSERT INTO reports(event_id,reporter_id,reason) VALUES($1,$2,$3)', [req.params.id, req.user.sub, reason]); res.status(201).json({ ok: true }); }
  catch (e) { res.status(e.code === '23505' ? 409 : 500).json({ error: e.code === '23505' ? 'ALREADY_REPORTED' : 'SERVER_ERROR' }); }
});

io.on('connection', socket => { socket.emit('connected', { ok: true }); });

app.get('*', (_req, res) => res.sendFile(path.join(process.cwd(), 'index.html')));
server.listen(PORT, () => console.log(`EventsApplication running on :${PORT}`));
