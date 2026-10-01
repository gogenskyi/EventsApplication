import http from 'node:http';
import { app } from './src/app.js';
import { attachRealtime } from './src/realtime.js';
import { IS_NETLIFY, PORT } from './src/env.js';

const server = http.createServer(app);
attachRealtime(server);

// netlify/functions/api.js imports { app } from this file.
export { app, server };

if (!IS_NETLIFY) server.listen(PORT, () => console.log(`EventsApplication running on :${PORT}`));
