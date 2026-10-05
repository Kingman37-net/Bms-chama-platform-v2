import { route } from '../server.js';
import { withConn } from '../db.js';
import { ApiError } from '../errors.js';
import { requirePermission } from '../deps.js';

// ---------------- GET /accounts ----------------

route('GET', '/accounts', async (ctx) => {
  const user = await requirePermission(ctx, 'transactions.read');

  const accounts = await withConn((db) =>
    db
      .prepare(
        `SELECT id, code, name, type, is_system, is_active
         FROM accounts WHERE group_id = ? ORDER BY code`
      )
      .all(user.group_id)
  );

  return { ok: true, data: accounts };
});

// ---------------- GET /accounts/:code/balance ----------------

route('GET', '/accounts/{code}/balance', async (ctx) => {
  const user = await requirePermission(ctx, 'transactions.read');
  const code = ctx.params.code;

  const result = await withConn((db) => {
    const acc = db
      .prepare(`SELECT id, code, name, type FROM accounts WHERE group_id = ? AND code = ?`)
      .get(user.group_id, code);
    if (!acc) return null;

    const row = db
      .prepare(
        `SELECT
           COALESCE(SUM(debit_minor), 0) AS debit_total,
           COALESCE(SUM(credit_minor), 0) AS credit_total
         FROM ledger_entries
         WHERE group_id = ? AND account_id = ?`
      )
      .get(user.group_id, acc.id);

    // Normal-side calculation
    let balance;
    if (acc.type === 'asset' || acc.type === 'expense') {
      balance = row.debit_total - row.credit_total;
    } else {
      balance = row.credit_total - row.debit_total;
    }

    return {
      account_code: acc.code,
      name: acc.name,
      type: acc.type,
      normal_side: acc.type === 'asset' || acc.type === 'expense' ? 'debit' : 'credit',
      debit_total_minor: row.debit_total,
      credit_total_minor: row.credit_total,
      balance_minor: balance,
      as_of: new Date().toISOString(),
    };
  });

  if (!result) throw new ApiError('NOT_FOUND', `Account ${code} not found.`, 404);
  return { ok: true, data: result };
});

// ---------------- GET /ledger/trial-balance ----------------

route('GET', '/ledger/trial-balance', async (ctx) => {
  const user = await requirePermission(ctx, 'reports.read');

  const result = await withConn((db) => {
    const rows = db
      .prepare(
        `SELECT a.code, a.name, a.type,
                COALESCE(SUM(le.debit_minor), 0) AS debit_minor,
                COALESCE(SUM(le.credit_minor), 0) AS credit_minor
         FROM accounts a
         LEFT JOIN ledger_entries le ON le.account_id = a.id
         WHERE a.group_id = ?
         GROUP BY a.id
         ORDER BY a.code`
      )
      .all(user.group_id);

    const totalDebit = rows.reduce((s, r) => s + r.debit_minor, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit_minor, 0);

    return {
      as_of: new Date().toISOString(),
      rows,
      total_debit_minor: totalDebit,
      total_credit_minor: totalCredit,
      balanced: totalDebit === totalCredit,
    };
  });

  return { ok: true, data: result };
});
