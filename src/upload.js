import fs from 'node:fs';
import multer from 'multer';
import { UPLOAD_DIR, MAX_MEDIA_BYTES, MAX_AVATAR_BYTES } from './env.js';
import { MEDIA_MIME_TYPES, AVATAR_MIME_TYPES } from '../lib/storage.js';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function uploader({ maxBytes, mimeTypes, errorCode }) {
  return multer({
    dest: UPLOAD_DIR,
    limits: { fileSize: maxBytes },
    fileFilter: (_req, file, cb) => (
      mimeTypes.includes(file.mimetype) ? cb(null, true) : cb(new Error(errorCode))
    ),
  });
}

export const mediaUpload = uploader({ maxBytes: MAX_MEDIA_BYTES, mimeTypes: MEDIA_MIME_TYPES, errorCode: 'UNSUPPORTED_MEDIA' });
export const avatarUpload = uploader({ maxBytes: MAX_AVATAR_BYTES, mimeTypes: AVATAR_MIME_TYPES, errorCode: 'UNSUPPORTED_AVATAR' });
