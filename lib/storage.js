import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { UPLOAD_DIR } from '../src/env.js';

// Single source of truth for accepted uploads. The stored file extension is
// derived from the validated MIME type, never from the client-supplied filename.
const MEDIA_EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};
export const MEDIA_MIME_TYPES = Object.keys(MEDIA_EXT_BY_MIME);
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function saveLocalFile(file, prefix = 'media') {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${prefix}-${crypto.randomUUID()}${MEDIA_EXT_BY_MIME[file.mimetype] ?? ''}`;
  await fs.rename(file.path, path.join(UPLOAD_DIR, name));
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

/** Remove a multer temp file if it is still on disk (no-op after a successful save). */
export async function discardUpload(file) {
  if (file?.path) await fs.rm(file.path, { force: true });
}
