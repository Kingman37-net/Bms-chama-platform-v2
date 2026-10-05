// Minimal HTTP server on stdlib node:http
//
// Features:
//   - Decorator-style route registration
//   - Path params via {name}
//   - JSON body parsing
//   - Request ID + CORS
//   - Standard success/error envelope

import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';

import { config } from './config.js';
import { ApiError, errorEnvelope, successEnvelope } from './errors.js';

const routes = [];

export function route(method, path, handler) {
  const paramNames = [];
  const regexPath = path.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  const regex = new RegExp(`^${regexPath}$`);
  routes.push({ method: method.toUpperCase(), regex, paramNames, handler });
}

function match(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = pathname.match(r.regex);
    if (!m) continue;
    const params = {};
    r.paramNames.forEach((name, i) => {
      params[name] = decodeURIComponent(m[i + 1]);
    });
    return { handler: r.handler, params };
  }
  return null;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 5 * 1024 * 1024) {
        reject(new ApiError('VALIDATION_FAILED', 'Request body too large.', 400));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve(null);
      const ctype = (req.headers['content-type'] || '').toLowerCase();
      if (ctype.includes('application/json')) {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new ApiError('VALIDATION_FAILED', `Invalid JSON: ${e.message}`, 400));
        }
      } else {
        resolve(raw);
      }
    });
    req.on('error', reject);
  });
}

function setCors(res, origin) {
  if (origin && config.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PATCH, PUT, DELETE, OPTIONS'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Request-Id, Idempotency-Key'
    );
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');
  }
}

function sendJson(res, status, body, requestId, extra = {}) {
  const payload = JSON.stringify(body, (_k, v) =>
    typeof v === 'bigint' ? Number(v) : v
  );
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'X-Request-Id': requestId,
    ...extra,
  });
  res.end(payload);
}

function buildContext(req, body, requestId, url) {
  return {
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    body,
    headers: req.headers,
    requestId,
    params: {},
    user: null,
    header(name) {
      return req.headers[name.toLowerCase()] || null;
    },
  };
}

export function startServer() {
  const server = http.createServer(async (req, res) => {
    const requestId =
      req.headers['x-request-id'] ||
      `req_${crypto.randomBytes(12).toString('hex')}`;
    const origin = req.headers.origin || '';
    setCors(res, origin);

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'X-Request-Id': requestId });
      res.end();
      return;
    }

    let body = null;
    try {
      body = await parseBody(req);
    } catch (e) {
      const status = e instanceof ApiError ? e.statusCode : 500;
      const code = e instanceof ApiError ? e.code : 'INTERNAL_ERROR';
      sendJson(res, status, errorEnvelope(code, e.message, requestId), requestId);
      return;
    }

    const m = match(req.method, url.pathname);
    if (!m) {
      sendJson(
        res,
        404,
        errorEnvelope(
          'NOT_FOUND',
          `No route for ${req.method} ${url.pathname}`,
          requestId
        ),
        requestId
      );
      return;
    }

    const ctx = buildContext(req, body, requestId, url);
    ctx.params = m.params;

    try {
      let result = await m.handler(ctx);
      let status = 200;
      let payload = result;

      if (Array.isArray(result)) {
        [status, payload] = result;
      }

      if (payload === null || payload === undefined) {
        sendJson(res, status, {}, requestId);
        return;
      }

      if (typeof payload === 'object' && 'ok' in payload) {
        sendJson(res, status, payload, requestId);
      } else {
        sendJson(res, status, successEnvelope(payload), requestId);
      }
    } catch (e) {
      if (e instanceof ApiError) {
        sendJson(
          res,
          e.statusCode,
          errorEnvelope(e.code, e.message, requestId, e.details),
          requestId
        );
      } else {
        console.error('[error]', e);
        const details = config.isProduction ? null : { type: e.name };
        sendJson(
          res,
          500,
          errorEnvelope('INTERNAL_ERROR', 'Something went wrong.', requestId, details),
          requestId
        );
      }
    }
  });

  server.listen(config.port, config.host, () => {
    console.log(`▶ BODMAS API on http://${config.host}:${config.port}`);
    console.log(`▶ Environment: ${config.environment}`);
    console.log(`▶ DB: ${config.dbPath}`);
    console.log('▶ Press Ctrl+C to stop.');
  });

  process.on('SIGINT', () => {
    console.log('\n▶ Shutting down.');
    server.close(() => process.exit(0));
  });

  return server;
}
