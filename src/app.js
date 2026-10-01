import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { IS_NETLIFY, IS_PRODUCTION, UPLOAD_DIR } from './env.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { errorHandler } from './errors.js';
import systemRoutes from './routes/system.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import eventRoutes from './routes/events.js';
import pushRoutes from './routes/push.js';
import notificationRoutes from './routes/notifications.js';
import adminRoutes from './routes/admin.js';

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use('/api/', rateLimit({ max: 120 }));
app.use('/api/auth/', rateLimit({ max: 20 }));
app.use('/api/events', rateLimit({ max: 60 }));

if (!IS_NETLIFY) {
  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', immutable: true }));
  app.use(express.static(process.cwd(), { maxAge: IS_PRODUCTION ? '1h' : 0, dotfiles: 'deny' }));
}

app.use('/api', systemRoutes); // /api/health, /api/config
app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

app.get('/{*splat}', (_req, res) => res.sendFile(path.join(process.cwd(), 'index.html')));

app.use(errorHandler);
