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
  // Credentials alone do not mean an upload integration exists. This adapter
  // currently implements local development storage only.
  return false;
}

export async function saveMedia(file, prefix = 'media') {
  if (process.env.NETLIFY) throw new Error('MEDIA_STORAGE_NOT_CONFIGURED');
  return saveLocalFile(file, prefix);
}
