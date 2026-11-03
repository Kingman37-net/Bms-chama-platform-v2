import { route } from '../server.js';
import { healthcheck } from '../db.js';

route('GET', '/', () => ({
  ok: true,
  data: {
    service: 'BODMAS CHAMAA API',
    version: '0.1.0',
    phase: '7A',
  },
}));

route('GET', '/health', () => ({
  ok: true,
  data: { status: 'alive' },
}));

route('GET', '/ready', () => {
  const dbOk = healthcheck();
  return {
    ok: true,
    data: { ready: dbOk, db: dbOk ? 'ok' : 'unreachable' },
  };
});

route('GET', '/version', () => ({
  ok: true,
  data: { service: 'bodmas-api', version: '0.1.0', phase: '7A' },
}));
