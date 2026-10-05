// BODMAS API — entrypoint

import './routes/health.js';
import './routes/auth.js';
import './routes/members.js';
import './routes/accounts.js';
import './routes/contributions.js';
import { startServer } from './server.js';

startServer();
