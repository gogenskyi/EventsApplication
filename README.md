# Events

Users post photos/videos from live events (concerts, street events, trash events) pinned on an interactive map; others see activity around them and can mark "going".

## Run
Requires Node.js >= 22.13 (no `npm install` needed, zero dependencies).

    node server.js        # http://localhost:3000

Env vars: `PORT` (default 3000), `DATA_DIR` (default ./data — SQLite db + uploaded media), `SEED=0` to skip demo events.

## API (all requests need an `X-Client-Id: <uuid>` header)
- `GET    /api/events[?lat=&lng=&radius=m]` — list events (optionally within a radius)
- `POST   /api/events` — JSON `{d, c, l, lat, lng}` (c: concert|street|trash|sport|other)
- `PUT    /api/events/:id/media` — raw image/video body with its Content-Type (max 50 MB), author only
- `POST   /api/events/:id/going` — JSON `{going: true|false}`
- `DELETE /api/events/:id` — author only
- `GET    /uploads/:file` — media (supports Range for video seeking)

## Notes
- No accounts yet: identity is a random id kept in the browser, so "my posts" is per-browser. Add real login before going public.
- GitHub Pages can't run this; deploy to a host with Node and a persistent disk (Render, Railway, Fly.io) and point `DATA_DIR` at that disk.
