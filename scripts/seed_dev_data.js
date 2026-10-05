// Seed a monthly contribution plan for dev testing.
import { withConn } from '../api/app/db.js';

const GROUP_ID = 'grp_bodmas';

function nowISO() { return new Date().toISOString(); }

async function main() {
  await withConn((db) => {
    const existing = db
      .prepare(`SELECT id FROM contribution_plans WHERE group_id = ? AND name = 'Monthly Savings'`)
      .get(GROUP_ID);

    if (existing) {
      console.log(`↻ Plan already exists: ${existing.id}`);
      return;
    }

    const id = 'cpp_monthly';
    db.prepare(
      `INSERT INTO contribution_plans
       (id, group_id, name, category, frequency, amount_minor, currency,
        due_day, grace_days, late_fee_minor, is_active, created_at, updated_at)
       VALUES (?, ?, 'Monthly Savings', 'savings', 'monthly', 500000, 'KES',
               1, 5, 10000, 1, ?, ?)`
    ).run(id, GROUP_ID, nowISO(), nowISO());

    console.log(`✅ Created contribution plan: ${id} (KSh 5,000/month)`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
