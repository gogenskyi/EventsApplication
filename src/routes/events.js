import { Router } from 'express';
import { pool, PG_UNIQUE_VIOLATION } from '../db.js';
import { requireAuth } from '../auth.js';
import { mediaUpload } from '../upload.js';
import { saveMedia, discardUpload } from '../../lib/storage.js';
import { distanceKmSql } from '../geo.js';
import { broadcast } from '../realtime.js';
import { notifyNearby } from '../notify.js';

const router = Router();

const CATEGORIES = ['concert', 'street', 'sport', 'other'];
const DEFAULT_RADIUS_KM = 30;
const MAX_RADIUS_KM = 100;

const INSERT_EVENT_SQL = `INSERT INTO events(author_id,title,description,category,latitude,longitude,location_name,media_url,media_type)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`;

/** Validate and normalise the create-event body. Returns null when invalid. */
function parseEventInput(body = {}) {
  const { title, description, category, latitude, longitude, location_name } = body;
  const lat = Number(latitude);
  const lng = Number(longitude);
  const valid = typeof title === 'string' && title.trim()
    && typeof description === 'string' && description.trim()
    && CATEGORIES.includes(category)
    && Number.isFinite(lat) && lat >= -90 && lat <= 90
    && Number.isFinite(lng) && lng >= -180 && lng <= 180;
  if (!valid) return null;
  return {
    title: title.trim().slice(0, 140),
    description: description.trim().slice(0, 1000),
    category,
    lat,
    lng,
    locationName: typeof location_name === 'string' ? location_name.trim().slice(0, 200) || null : null,
  };
}

router.get('/', async (req, res) => {
  const { q = '', category = 'all', lat, lng, radius = DEFAULT_RADIUS_KM } = req.query;
  const values = [];
  const param = value => { values.push(value); return `$${values.length}`; };
  const where = ["e.trust_status <> 'hidden'"];

  if (category !== 'all') where.push(`e.category=${param(category)}`);
  if (q) {
    const like = param(`%${q}%`);
    where.push(`(e.title ILIKE ${like} OR e.description ILIKE ${like} OR e.location_name ILIKE ${like})`);
  }
  let distance = 'NULL';
  if (lat && lng) {
    distance = distanceKmSql(param(Number(lat)), param(Number(lng)), 'e.latitude', 'e.longitude');
    where.push(`${distance} <= ${param(Math.min(Number(radius) || DEFAULT_RADIUS_KM, MAX_RADIUS_KM))}`);
  }

  const { rows } = await pool.query(
    `SELECT e.*, u.name author_name, u.avatar_url author_avatar, u.verified author_verified,
            COUNT(a.user_id) FILTER (WHERE a.status='going')::int going_count,
            ${distance} distance_km
     FROM events e
     JOIN users u ON u.id=e.author_id
     LEFT JOIN event_attendance a ON a.event_id=e.id
     WHERE ${where.join(' AND ')}
     GROUP BY e.id,u.id
     ORDER BY e.created_at DESC
     LIMIT 100`,
    values,
  );
  res.json({ events: rows });
});

router.post('/', requireAuth, mediaUpload.single('media'), async (req, res) => {
  try {
    const input = parseEventInput(req.body);
    if (!input) return res.status(400).json({ error: 'INVALID_EVENT' });

    let mediaUrl = null;
    let mediaType = null;
    if (req.file) {
      mediaUrl = await saveMedia(req.file, 'event');
      mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
    }

    const { rows } = await pool.query(INSERT_EVENT_SQL, [
      req.user.sub, input.title, input.description, input.category,
      input.lat, input.lng, input.locationName, mediaUrl, mediaType,
    ]);
    broadcast('event:created', rows[0]);
    notifyNearby(rows[0]);
    res.status(201).json({ event: rows[0] });
  } finally {
    await discardUpload(req.file); // also covers validation failures
  }
});

router.post('/:id/attendance', requireAuth, async (req, res) => {
  const { id } = req.params;
  const status = req.body?.status === 'declined' ? 'declined' : 'going';
  await pool.query(
    `INSERT INTO event_attendance(event_id,user_id,status) VALUES($1,$2,$3)
     ON CONFLICT(event_id,user_id) DO UPDATE SET status=EXCLUDED.status`,
    [id, req.user.sub, status],
  );
  const { rows } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status='going')::int going FROM event_attendance WHERE event_id=$1`,
    [id],
  );
  broadcast('event:attendance', { id, going: rows[0].going });
  res.json(rows[0]);
});

router.post('/:id/report', requireAuth, async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason ?? 'spam').slice(0, 300);
  try {
    await pool.query('INSERT INTO reports(event_id,reporter_id,reason) VALUES($1,$2,$3)', [id, req.user.sub, reason]);
    await pool.query("UPDATE events SET trust_status='reported' WHERE id=$1 AND trust_status='new'", [id]);
    broadcast('event:reported', { id });
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === PG_UNIQUE_VIOLATION) return res.status(409).json({ error: 'ALREADY_REPORTED' });
    throw e;
  }
});

export default router;
