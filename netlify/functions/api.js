import serverless from 'serverless-http';
import { app } from '../../server.js';

export const handler = serverless(app, {
  requestId: 'netlifyRequestId',
  // Netlify rewrites to /.netlify/functions/api/api/<route>; strip the
  // function invocation prefix so Express receives the app's /api/... path.
  basePath: '/.netlify/functions/api'
});
