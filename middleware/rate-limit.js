const buckets = new Map();
const PRUNE_THRESHOLD = 5000;

// Keys include the request path, so the map would otherwise grow without bound.
function prune(now) {
  for (const [key, bucket] of buckets) {
    if (now - bucket.start >= bucket.windowMs) buckets.delete(key);
  }
}

export function rateLimit({ windowMs = 60_000, max = 60 } = {}) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    if (buckets.size > PRUNE_THRESHOLD) prune(now);
    const current = buckets.get(key);
    if (!current || now - current.start >= windowMs) {
      buckets.set(key, { start: now, count: 1, windowMs });
      return next();
    }
    current.count += 1;
    if (current.count > max) {
      res.set('Retry-After', String(Math.ceil((windowMs - (now - current.start)) / 1000)));
      return res.status(429).json({ error: 'RATE_LIMITED' });
    }
    next();
  };
}
