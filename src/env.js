// Single place where environment variables are read and validated.
import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';

const env = process.env;

export const IS_NETLIFY = Boolean(env.NETLIFY);
export const IS_PRODUCTION = env.NODE_ENV === 'production';
export const PORT = env.PORT || 3000;
export const DATABASE_URL = env.DATABASE_URL || env.NETLIFY_DB_URL;
export const GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID || '';

if (IS_PRODUCTION && (!env.JWT_SECRET || env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be set to a strong 32+ character value in production');
}
export const JWT_SECRET = env.JWT_SECRET || 'development-only-secret';
export const SESSION_DAYS = 7;

export const VAPID = {
  publicKey: env.VAPID_PUBLIC_KEY || '',
  privateKey: env.VAPID_PRIVATE_KEY || '',
  subject: env.VAPID_SUBJECT || 'mailto:admin@example.com',
};
export const PUSH_ENABLED = Boolean(VAPID.publicKey && VAPID.privateKey);

// Netlify's function bundle is read-only. Multer may stage multipart uploads in
// the OS temp dir, but media is rejected later unless object storage is wired up.
export const UPLOAD_DIR = IS_NETLIFY
  ? path.join(os.tmpdir(), 'events-uploads')
  : path.join(process.cwd(), 'uploads');
export const MAX_MEDIA_BYTES = (IS_NETLIFY ? 5 : 100) * 1024 * 1024;
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
