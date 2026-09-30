import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const root = path.join(process.cwd(), 'uploads');

export async function saveLocalFile(file, prefix = 'media') {
  await fs.mkdir(root, { recursive: true });
  const ext = path.extname(file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
  const name = `${prefix}-${crypto.randomUUID()}${ext || ''}`;
  await fs.rename(file.path, path.join(root, name));
  return `/uploads/${name}`;
}

export function isObjectStorageConfigured() {
  return Boolean(process.env.S3_BUCKET && process.env.S3_REGION && process.env.S3_ENDPOINT);
}

export async function saveMedia(file, prefix = 'media') {
  // The storage adapter intentionally keeps a local fallback for VPS/dev.
  // Production S3/R2 can be enabled without changing API handlers.
  return saveLocalFile(file, prefix);
}
