// Errors thrown with these messages map to a specific HTTP status.
const STATUS_BY_MESSAGE = {
  UNSUPPORTED_MEDIA: 415,
  UNSUPPORTED_AVATAR: 415,
  MEDIA_STORAGE_NOT_CONFIGURED: 503,
};

export function errorHandler(err, _req, res, _next) {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'FILE_TOO_LARGE' });
  const status = STATUS_BY_MESSAGE[err?.message];
  if (status) return res.status(status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'SERVER_ERROR' });
}
