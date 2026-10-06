import { route } from '../server.js';
import { withConn, withTx } from '../db.js';
import { ApiError } from '../errors.js';
import { requirePermission } from '../deps.js';
import { generateId } from '../security.js';

function nowISO() { return new Date().toISOString(); }

route('GET', '/meetings', async (ctx) => {
  const user = await requirePermission(ctx, 'meetings.read');
  const rows = await withConn((db) =>
    db.prepare(
      `SELECT id, title, meeting_type, scheduled_at, location, agenda, status, is_public, created_at
       FROM meetings WHERE group_id = ? ORDER BY scheduled_at DESC LIMIT 100`
    ).all(user.group_id)
  );
  return { ok: true, data: rows };
});

route('POST', '/meetings', async (ctx) => {
  const user = await requirePermission(ctx, 'meetings.create');
  const b = ctx.body || {};
  if (!b.title || !b.meeting_type || !b.scheduled_at) {
    throw new ApiError('VALIDATION_FAILED', 'title, meeting_type, scheduled_at are required.', 400);
  }

  const result = await withTx((db) => {
    const id = generateId('met');
    const now = nowISO();
    db.prepare(
      `INSERT INTO meetings (id, group_id, title, meeting_type, scheduled_at, location, agenda,
                             status, is_public, created_at, created_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', 0, ?, ?, ?)`
    ).run(id, user.group_id, b.title, b.meeting_type, b.scheduled_at,
          b.location || null, b.agenda || null, now, user.id, now);

    db.prepare(
      `INSERT INTO audit_logs (id, group_id, user_id, action, resource_type, resource_id,
                               after_json, severity, created_at)
       VALUES (?, ?, ?, 'meetings.create', 'meetings', ?, ?, 'info', ?)`
    ).run(generateId('aud'), user.group_id, user.id, id,
          JSON.stringify({ title: b.title, scheduled_at: b.scheduled_at }), now);

    return { meeting_id: id, title: b.title, scheduled_at: b.scheduled_at, status: 'scheduled' };
  });

  return [201, { ok: true, data: result }];
});
