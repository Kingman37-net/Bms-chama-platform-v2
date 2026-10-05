import { route } from '../server.js';
import { withConn, withTx } from '../db.js';
import { ApiError } from '../errors.js';
import { requirePermission } from '../deps.js';
import { generateId } from '../security.js';

function nowISO() { return new Date().toISOString(); }

// ---------------- GET /members ----------------

route('GET', '/members', async (ctx) => {
  await requirePermission(ctx, 'members.read');
  const page = Math.max(1, Number(ctx.query.page || 1));
  const perPage = Math.min(100, Math.max(1, Number(ctx.query.per_page || 20)));
  const offset = (page - 1) * perPage;
  const groupId = ctx.user.group_id;

  const result = await withConn((db) => {
    const total = db
      .prepare('SELECT COUNT(*) AS c FROM members WHERE group_id = ? AND deleted_at IS NULL')
      .get(groupId).c;

    const rows = db
      .prepare(
        `SELECT m.id, m.full_name, m.phone, m.email, m.status, m.joined_on,
                mb.member_number
         FROM members m
         LEFT JOIN memberships mb ON mb.member_id = m.id
         WHERE m.group_id = ? AND m.deleted_at IS NULL
         ORDER BY m.full_name
         LIMIT ? OFFSET ?`
      )
      .all(groupId, perPage, offset);

    return { rows, total };
  });

  return {
    ok: true,
    data: result.rows,
    meta: {
      page,
      per_page: perPage,
      total: result.total,
      pages: Math.ceil(result.total / perPage),
    },
  };
});

// ---------------- GET /members/:id ----------------

route('GET', '/members/{id}', async (ctx) => {
  const user = await requirePermission(ctx, 'members.read');
  const memberId = ctx.params.id;

  const member = await withConn((db) => {
    const m = db
      .prepare(
        `SELECT m.*, mb.member_number, mb.status AS membership_status
         FROM members m
         LEFT JOIN memberships mb ON mb.member_id = m.id
         WHERE m.id = ? AND m.group_id = ? AND m.deleted_at IS NULL`
      )
      .get(memberId, user.group_id);

    if (!m) return null;

    if (m.id_number) {
      m.id_number = '******' + String(m.id_number).slice(-4);
    }
    return m;
  });

  if (!member) throw new ApiError('NOT_FOUND', 'Member not found.', 404);
  return { ok: true, data: member };
});

// ---------------- POST /members ----------------

route('POST', '/members', async (ctx) => {
  const user = await requirePermission(ctx, 'members.create');
  const b = ctx.body || {};

  if (!b.full_name) {
    throw new ApiError('VALIDATION_FAILED', 'full_name is required.', 400);
  }

  const now = nowISO();
  const groupId = user.group_id;
  const memberId = generateId('mem');
  const membershipId = generateId('mbr');

  const result = await withTx((db) => {
    // Auto-assign next member number
    const last = db
      .prepare(
        `SELECT member_number FROM memberships
         WHERE group_id = ? ORDER BY member_number DESC LIMIT 1`
      )
      .get(groupId);
    let nextNum = 1;
    if (last) {
      const m = last.member_number.match(/(\d+)$/);
      if (m) nextNum = Number(m[1]) + 1;
    }
    const memberNumber = `BMS-${String(nextNum).padStart(4, '0')}`;

    // Duplicate id_number check
    if (b.id_number) {
      const dup = db
        .prepare(
          `SELECT id FROM members WHERE group_id = ? AND id_number = ? AND deleted_at IS NULL`
        )
        .get(groupId, b.id_number);
      if (dup) {
        throw new ApiError('CONFLICT', 'A member with this ID number already exists.', 409);
      }
    }

    db.prepare(
      `INSERT INTO members (id, group_id, full_name, id_number, date_of_birth, gender,
                            phone, email, address, emergency_contact_name, emergency_contact_phone,
                            joined_on, status, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      memberId,
      groupId,
      b.full_name,
      b.id_number || null,
      b.date_of_birth || null,
      b.gender || null,
      b.phone || null,
      b.email || null,
      b.address || null,
      b.emergency_contact_name || null,
      b.emergency_contact_phone || null,
      b.joined_on || now.slice(0, 10),
      b.status || 'active',
      now,
      now,
      user.id,
      user.id
    );

    db.prepare(
      `INSERT INTO memberships (id, group_id, member_id, member_number, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`
    ).run(membershipId, groupId, memberId, memberNumber, now, now);

    // Assign default 'member' role
    const memberRole = db
      .prepare(`SELECT id FROM roles WHERE group_id = ? AND code = 'member'`)
      .get(groupId);
    if (memberRole) {
      db.prepare(
        `INSERT INTO membership_roles (membership_id, role_id, assigned_at)
         VALUES (?, ?, ?)`
      ).run(membershipId, memberRole.id, now);
    }

    // Audit
    db.prepare(
      `INSERT INTO audit_logs (id, group_id, user_id, action, resource_type, resource_id,
                               after_json, severity, created_at)
       VALUES (?, ?, ?, 'members.create', 'members', ?, ?, 'info', ?)`
    ).run(
      generateId('aud'),
      groupId,
      user.id,
      memberId,
      JSON.stringify({ full_name: b.full_name, member_number: memberNumber }),
      now
    );

    return { member_id: memberId, membership_id: membershipId, member_number: memberNumber };
  });

  return [201, { ok: true, data: result }];
});
