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

Create the PostgreSQL schema with `npm run db:migrate` after setting `DATABASE_URL`. The migration is safe to re-run.

## Netlify
The repository includes `netlify.toml` and `netlify/functions/api.js`. Configure `DATABASE_URL` and a random `JWT_SECRET` of at least 32 characters in Netlify, then run `npm run db:migrate` against that database before publishing. `GOOGLE_CLIENT_ID` and the VAPID key pair are optional. Events can be created without media; image/video uploads deliberately return `MEDIA_STORAGE_NOT_CONFIGURED` on Netlify until persistent object storage is implemented and configured. The local development server stores uploads in `uploads/`.

Netlify Functions do not keep a Socket.IO connection alive, so the frontend refreshes the event feed every 30 seconds on Netlify. The standalone Node server uses Socket.IO for live updates.

The site is an installable PWA for phones. On Android, use the “На телефон” button or the browser menu. On iPhone/iPad, open the site in Safari and choose Share → Add to Home Screen. This installs the web app; publishing to Google Play or the App Store requires separate store accounts and packaging.

## CI
GitHub Actions uses `npm ci` and checks the server, browser scripts, Netlify function, database migration script, and required static files.
