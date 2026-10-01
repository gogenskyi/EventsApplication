import webpush from 'web-push';
import { pool } from './db.js';
import { PUSH_ENABLED, VAPID } from './env.js';
import { distanceKmSql } from './geo.js';

const NEARBY_RADIUS_KM = 30;
const NEARBY_TITLE = 'Нова подія поруч';

if (PUSH_ENABLED) webpush.setVapidDetails(VAPID.subject, VAPID.publicKey, VAPID.privateKey);

/** Create in-app notifications (and web pushes) for subscribers near a new event. */
export async function notifyNearby(event) {
  try {
    const distance = distanceKmSql('$1', '$2', 'p.latitude', 'p.longitude');
    const { rows } = await pool.query(
      `SELECT p.user_id, p.subscription FROM push_subscriptions p
       WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL AND ${distance} <= $3`,
      [event.latitude, event.longitude, NEARBY_RADIUS_KM],
    );
    for (const row of rows) {
      await pool.query(
        'INSERT INTO notifications(user_id,type,title,body,event_id) VALUES($1,$2,$3,$4,$5)',
        [row.user_id, 'nearby_event', NEARBY_TITLE, event.title, event.id],
      );
      if (PUSH_ENABLED) {
        webpush
          .sendNotification(row.subscription, JSON.stringify({ title: NEARBY_TITLE, body: event.title, url: `/?event=${event.id}` }))
          .catch(() => {});
      }
    }
  } catch (e) {
    console.error('notifyNearby', e.message);
  }
}
