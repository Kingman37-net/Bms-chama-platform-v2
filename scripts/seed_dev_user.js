// Seed a development admin user + membership + all roles.
// Usage: node scripts/seed_dev_user.js

import { withConn } from '../api/app/db.js';
import { hashPassword, generateId } from '../api/app/security.js';

const EMAIL = 'admin@bodmaschamaa.com';
const PASSWORD = 'ChangeMe123!';
const GROUP_ID = 'grp_bodmas';

function nowISO() {
  return new Date().toISOString();
}

async function main() {
  const passwordHash = await hashPassword(PASSWORD);

  await withConn((db) => {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL);

    const userId = existing?.id || generateId('usr');
    const memberId = generateId('mem');
    const membershipId = generateId('mbr');

    if (existing) {
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        .run(passwordHash, nowISO(), userId);
      console.log(`↻ Updated existing user ${EMAIL}`);
    } else {
      db.prepare(
        `INSERT INTO users (id, group_id, email, password_hash, display_name, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      ).run(userId, GROUP_ID, EMAIL, passwordHash, 'Dev Admin', nowISO(), nowISO());

      db.prepare(
        `INSERT INTO members (id, group_id, full_name, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?)`
      ).run(memberId, GROUP_ID, 'Dev Admin', nowISO(), nowISO());

      db.prepare(
        `INSERT INTO memberships (id, group_id, member_id, user_id, member_number, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'BMS-0001', 'active', ?, ?)`
      ).run(membershipId, GROUP_ID, memberId, userId, nowISO(), nowISO());

      const roles = db.prepare('SELECT id FROM roles WHERE group_id = ?').all(GROUP_ID);
      for (const r of roles) {
        db.prepare(
          `INSERT OR IGNORE INTO membership_roles (membership_id, role_id, assigned_at)
           VALUES (?, ?, ?)`
        ).run(membershipId, r.id, nowISO());
      }

      console.log(`✅ Created dev admin ${EMAIL} with ${roles.length} roles`);
    }
  });

  console.log('');
  console.log('   Email:    ' + EMAIL);
  console.log('   Password: ' + PASSWORD);
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
