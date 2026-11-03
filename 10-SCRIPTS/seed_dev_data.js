// Seed dev contribution plan + loan product.
import { withConn } from '../api/app/db.js';

const GROUP_ID = 'grp_bodmas';

function nowISO() { return new Date().toISOString(); }

async function main() {
  await withConn((db) => {
    // Contribution plan
    const plan = db
      .prepare(`SELECT id FROM contribution_plans WHERE group_id = ? AND name = 'Monthly Savings'`)
      .get(GROUP_ID);
    if (!plan) {
      db.prepare(
        `INSERT INTO contribution_plans
         (id, group_id, name, category, frequency, amount_minor, currency,
          due_day, grace_days, late_fee_minor, is_active, created_at, updated_at)
         VALUES ('cpp_monthly', ?, 'Monthly Savings', 'savings', 'monthly', 500000, 'KES',
                 1, 5, 10000, 1, ?, ?)`
      ).run(GROUP_ID, nowISO(), nowISO());
      console.log('✅ Created contribution plan cpp_monthly');
    } else {
      console.log('↻ Contribution plan exists');
    }

    // Loan product — emergency 15% flat, 6 months
    const product = db
      .prepare(`SELECT id FROM loan_products WHERE group_id = ? AND name = 'Emergency Loan'`)
      .get(GROUP_ID);
    if (!product) {
      db.prepare(
        `INSERT INTO loan_products
         (id, group_id, name, description, min_amount_minor, max_amount_minor,
          interest_rate_bps, interest_method, term_months, grace_period_days,
          late_fee_bps, requires_guarantors, min_guarantors, eligibility_months,
          is_active, created_at, updated_at)
         VALUES ('lnp_emergency', ?, 'Emergency Loan', 'Quick access loan for emergencies',
                 100000, 5000000, 1500, 'flat', 6, 0,
                 500, 0, 0, 0,
                 1, ?, ?)`
      ).run(GROUP_ID, nowISO(), nowISO());
      console.log('✅ Created loan product lnp_emergency (15% flat, 6 months)');
    } else {
      console.log('↻ Loan product exists');
    }
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
