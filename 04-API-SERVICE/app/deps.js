// Auth middleware and permission checks.

import { ApiError } from './errors.js';
import { verifyJWT } from './security.js';
import { withConn } from './db.js';

export async function authenticate(ctx) {
  const auth = ctx.header('authorization') || '';
  if (!auth.startsWith('Bearer ')) {
    throw new ApiError('UNAUTHENTICATED', 'Missing or malformed Authorization header.', 401);
  }
  const token = auth.slice(7).trim();

  let payload;
  try {
    payload = verifyJWT(token);
  } catch (e) {
    throw new ApiError('UNAUTHENTICATED', e.message, 401);
  }

  const user = await withConn((db) => {
    const u = db
      .prepare(
        `SELECT id, group_id, email, display_name, is_active, is_locked, deleted_at
         FROM users WHERE id = ?`
      )
      .get(payload.sub);

    if (!u) return null;
    if (u.deleted_at || u.is_locked || !u.is_active) return null;

    const membership = db
      .prepare(
        `SELECT id, member_id, member_number, status
         FROM memberships WHERE user_id = ? AND group_id = ?`
      )
      .get(u.id, u.group_id);

    const roles = membership
      ? db
          .prepare(
            `SELECT r.code FROM membership_roles mr
             JOIN roles r ON r.id = mr.role_id
             WHERE mr.membership_id = ?`
          )
          .all(membership.id)
          .map((r) => r.code)
      : [];

    const permissions = membership
      ? db
          .prepare(
            `SELECT DISTINCT rp.permission_code AS code
             FROM membership_roles mr
             JOIN role_permissions rp ON rp.role_id = mr.role_id
             WHERE mr.membership_id = ?`
          )
          .all(membership.id)
          .map((r) => r.code)
      : [];

    return {
      id: u.id,
      group_id: u.group_id,
      email: u.email,
      display_name: u.display_name,
      member_id: membership?.member_id || null,
      membership_id: membership?.id || null,
      member_number: membership?.member_number || null,
      roles,
      permissions,
    };
  });

  if (!user) {
    throw new ApiError('UNAUTHENTICATED', 'Account not found or inactive.', 401);
  }
  ctx.user = user;
}

export async function requireAuth(ctx) {
  if (!ctx.user) await authenticate(ctx);
  return ctx.user;
}

export async function requirePermission(ctx, code) {
  const user = await requireAuth(ctx);
  if (!user.permissions.includes(code)) {
    throw new ApiError('PERMISSION_DENIED', `Missing permission: ${code}`, 403);
  }
  return user;
}

export function hasRole(user, role) {
  return user.roles?.includes(role);
}
