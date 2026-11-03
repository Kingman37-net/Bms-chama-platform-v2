// Authentication routes.

import { route } from '../server.js';
import { withConn, withTx } from '../db.js';
import { ApiError } from '../errors.js';
import { config } from '../config.js';
import {
  verifyPassword,
  hashPassword,
  signJWT,
  generateId,
  generateRefreshToken,
  hashRefreshToken,
} from '../security.js';
import { requireAuth } from '../deps.js';

const MAX_FAILED_LOGINS = 5;

function nowISO() {
  return new Date().toISOString();
}

function futureISO(days = 0, seconds = 0) {
  const t = Date.now() + days * 86400_000 + seconds * 1000;
  return new Date(t).toISOString();
}

// ---------------- POST /auth/register ----------------

route('POST', '/auth/register', async (ctx) => {
  const { display_name, email, password, phone } = ctx.body || {};

  if (!display_name || !email || !password) {
    throw new ApiError('VALIDATION_FAILED', 'display_name, email, and password are required.', 400);
  }

  if (password.length < 6) {
    throw new ApiError('VALIDATION_FAILED', 'Password must be at least 6 characters.', 400);
  }

  const result = await withTx(async (db) => {
    // 1. Check if email already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      throw new ApiError('CONFLICT', 'An account with this email already exists.', 409);
    }

    // 2. Get the default group
    const group = db.prepare('SELECT id FROM groups LIMIT 1').get();
    if (!group) {
      throw new ApiError('INTERNAL_ERROR', 'System configuration error: No group found.', 500);
    }

    // 3. Prepare Data
    const userId = generateId('usr');
    const memberId = generateId('mbr');
    const membershipId = generateId('mem');
    const password_hash = await hashPassword(password);
    const now = nowISO();
    const memberNumber = 'BMS-' + Math.floor(1000 + Math.random() * 9000).toString();

    // 4. Insert User (Auth)
    db.prepare(
      `INSERT INTO users (id, group_id, email, display_name, password_hash, is_active, is_locked, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)`
    ).run(userId, group.id, email, display_name, password_hash, now, now);

    // 5. Insert Member Profile
    db.prepare(
      `INSERT INTO members (id, group_id, full_name, email, phone, status, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`
    ).run(memberId, group.id, display_name, email, phone || null, now, now, userId, userId);

    // 6. Create Membership Link
    db.prepare(
      `INSERT INTO memberships (id, user_id, group_id, member_id, member_number, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
    ).run(membershipId, userId, group.id, memberId, memberNumber, now, now);

    // 7. Assign Default 'member' Role (NO ID COLUMN!)
    const memberRole = db.prepare("SELECT id FROM roles WHERE code = 'member'").get();
    if (memberRole) {
      db.prepare(
        `INSERT INTO membership_roles (membership_id, role_id, assigned_at, assigned_by)
         VALUES (?, ?, ?, ?)`
      ).run(membershipId, memberRole.id, now, userId);
    }

    return {
      ok: true,
      message: 'Registration successful. You can now log in.',
      data: { user_id: userId, member_number: memberNumber }
    };
  });

  return result;
});

// ---------------- POST /auth/login ----------------

route('POST', '/auth/login', async (ctx) => {
  const { email, password } = ctx.body || {};
  if (!email || !password) {
    throw new ApiError('VALIDATION_FAILED', 'email and password are required.', 400);
  }

  const result = await withConn(async (db) => {
    const user = db
      .prepare(
        `SELECT id, group_id, email, display_name, password_hash,
                is_active, is_locked, failed_login_count, deleted_at
         FROM users WHERE email = ?`
      )
      .get(email);

    if (!user || user.deleted_at) {
      throw new ApiError('UNAUTHENTICATED', 'Invalid email or password.', 401);
    }
    if (user.is_locked) {
      throw new ApiError('PERMISSION_DENIED', 'Account is locked. Contact an administrator.', 403);
    }
    if (!user.is_active) {
      throw new ApiError('PERMISSION_DENIED', 'Account is disabled.', 403);
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      const fails = (user.failed_login_count || 0) + 1;
      const lock = fails >= MAX_FAILED_LOGINS ? 1 : 0;
      db.prepare(
        `UPDATE users SET failed_login_count = ?, is_locked = ?, updated_at = ? WHERE id = ?`
      ).run(fails, lock, nowISO(), user.id);
      throw new ApiError('UNAUTHENTICATED', 'Invalid email or password.', 401);
    }

    db.prepare(
      `UPDATE users SET failed_login_count = 0, last_login_at = ?, updated_at = ? WHERE id = ?`
    ).run(nowISO(), nowISO(), user.id);

    const membership = db
      .prepare(
        `SELECT id, member_id, member_number FROM memberships WHERE user_id = ? AND group_id = ?`
      )
      .get(user.id, user.group_id);

    const roles = membership
      ? db
          .prepare(
            `SELECT r.code FROM membership_roles mr
             JOIN roles r ON r.id = mr.role_id WHERE mr.membership_id = ?`
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

    const accessToken = signJWT({
      sub: user.id,
      member_id: membership?.member_id || null,
      roles,
    });

    const refreshToken = generateRefreshToken();
    const sessionId = generateId('ses');
    db.prepare(
      `INSERT INTO sessions (id, user_id, refresh_token_hash, user_agent, ip_address, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sessionId,
      user.id,
      hashRefreshToken(refreshToken),
      ctx.header('user-agent') || null,
      ctx.header('x-forwarded-for') || null,
      futureISO(config.refreshTokenTtlDays),
      nowISO()
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: config.accessTokenTtlSeconds,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        member_id: membership?.member_id || null,
        member_number: membership?.member_number || null,
        roles,
        permissions,
      },
    };
  });

  return result;
});

// ---------------- POST /auth/refresh ----------------

route('POST', '/auth/refresh', async (ctx) => {
  const { refresh_token } = ctx.body || {};
  if (!refresh_token) {
    throw new ApiError('VALIDATION_FAILED', 'refresh_token is required.', 400);
  }

  const result = await withConn(async (db) => {
    const hash = hashRefreshToken(refresh_token);
    const session = db
      .prepare(
        `SELECT id, user_id, expires_at, revoked_at FROM sessions
         WHERE refresh_token_hash = ?`
      )
      .get(hash);

    if (!session) throw new ApiError('UNAUTHENTICATED', 'Invalid refresh token.', 401);
    if (session.revoked_at) throw new ApiError('UNAUTHENTICATED', 'Refresh token revoked.', 401);
    if (session.expires_at < nowISO()) {
      throw new ApiError('UNAUTHENTICATED', 'Refresh token expired.', 401);
    }

    const user = db
      .prepare(
        `SELECT id, group_id, email, display_name FROM users WHERE id = ? AND is_active = 1 AND is_locked = 0`
      )
      .get(session.user_id);
    if (!user) throw new ApiError('UNAUTHENTICATED', 'User unavailable.', 401);

    const membership = db
      .prepare(
        `SELECT id, member_id, member_number FROM memberships WHERE user_id = ? AND group_id = ?`
      )
      .get(user.id, user.group_id);

    const roles = membership
      ? db
          .prepare(
            `SELECT r.code FROM membership_roles mr
             JOIN roles r ON r.id = mr.role_id WHERE mr.membership_id = ?`
          )
          .all(membership.id)
          .map((r) => r.code)
      : [];

    db.prepare(`UPDATE sessions SET revoked_at = ? WHERE id = ?`).run(nowISO(), session.id);

    const newRefresh = generateRefreshToken();
    const newSessionId = generateId('ses');
    db.prepare(
      `INSERT INTO sessions (id, user_id, refresh_token_hash, user_agent, ip_address, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newSessionId,
      user.id,
      hashRefreshToken(newRefresh),
      ctx.header('user-agent') || null,
      ctx.header('x-forwarded-for') || null,
      futureISO(config.refreshTokenTtlDays),
      nowISO()
    );

    const accessToken = signJWT({
      sub: user.id,
      member_id: membership?.member_id || null,
      roles,
    });

    return {
      access_token: accessToken,
      refresh_token: newRefresh,
      expires_in: config.accessTokenTtlSeconds,
    };
  });

  return result;
});

// ---------------- POST /auth/logout ----------------

route('POST', '/auth/logout', async (ctx) => {
  const user = await requireAuth(ctx);
  const { refresh_token } = ctx.body || {};

  await withConn((db) => {
    if (refresh_token) {
      const hash = hashRefreshToken(refresh_token);
      db.prepare(
        `UPDATE sessions SET revoked_at = ? WHERE refresh_token_hash = ? AND user_id = ?`
      ).run(nowISO(), hash, user.id);
    } else {
      db.prepare(
        `UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`
      ).run(nowISO(), user.id);
    }
  });

  return [204, null];
});

// ---------------- GET /auth/me ----------------

route('GET', '/auth/me', async (ctx) => {
  const user = await requireAuth(ctx);
  return { ok: true, data: user };
});
