// BODMAS API — entrypoint

import './routes/health.js';
import './routes/auth.js';
import { startServer } from './server.js';

startServer();
