# EventsApplication

Cross-platform UGC events platform: users publish photo/video reports with geolocation, discover nearby activity on a live map, attend events, receive notifications, and report spam/fake content.

## Current architecture
- Web/PWA frontend
- Express API with JWT HttpOnly sessions
- PostgreSQL persistence
- Socket.IO realtime updates
- Google authentication
- Web Push notifications
- Netlify Functions adapter for serverless deployment
- Moderation roles and trust status

## Development
```bash
npm install
npm run dev
```

Set the required values from `.env.example` before starting the backend. Never commit real credentials, database URLs, JWT secrets, Google credentials, or VAPID private keys.

## Netlify
The repository includes `netlify.toml` and `netlify/functions/api.js`. Configure the production environment variables in Netlify before deploying. Persistent media should use object storage in production rather than the ephemeral function filesystem.

## CI
GitHub Actions performs syntax checks for the server, browser scripts, and Netlify function. The workflow intentionally uses `npm install` without npm cache until a lockfile is committed.
