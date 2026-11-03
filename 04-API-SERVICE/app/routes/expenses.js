import crypto from 'node:crypto';
import { route } from '../server.js';
import { withConn, withTx } from '../db.js';
import { ApiError } from '../errors.js';
import { requirePermission } from '../deps.js';
import { generateId } from '../security.js';

function nowISO() { return new Date().toISOString(); }
function shortRand() { return crypto.randomBytes(3).toString('hex'); }

const VALID_METHODS = ['cash', 'bank', 'mpesa', 'cheque', 'other'];

// ---------------- GET /expenses ----------------

route('GET', '/expenses', async (ctx) => {
  const user = await requirePermission(ctx, 'expenses.read');
  const page = Math.max(1, Number(ctx.query.page || 1));
  const perPage = Math.min(100, Math.max(1, Number(ctx.query.per_page || 20)));
  const offset = (page - 1) * perPage;

  const result = await withConn((db) => {
    const params = [user.group_id];
    let where = 'e.group_id = ?';
    if (ctx.query.status) { where += ' AND e.status = ?'; params.push(ctx.query.status); }
    if (ctx.query.category) { where += ' AND e.category = ?'; params.push(ctx.query.category); }

    const total = db
      .prepare(`SELECT COUNT(*) AS c FROM expenses e WHERE ${where}`)
      .get(...params).c;

    const rows = db
      .prepare(
        `SELECT e.id, e.category, e.description, e.payee, e.amount_minor, e.currency,
                e.payment_method, e.paid_at, e.status, e.approved_at, e.transaction_id,
                e.receipt_url, e.reference, e.created_at
         FROM expenses e
         WHERE ${where}
         ORDER BY e.paid_at DESC, e.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, perPage, offset);

    return { rows, total };
  });

  return {
    ok: true,
    data: result.rows,
    meta: { page, per_page: perPage, total: result.total, pages: Math.ceil(result.total / perPage) },
  };
});

// ---------------- GET /expenses/:id ----------------

route('GET', '/expenses/{id}', async (ctx) => {
  const user = await requirePermission(ctx, 'expenses.read');
  const row = await withConn((db) =>
    db.prepare(`SELECT * FROM expenses WHERE id = ? AND group_id = ?`).get(ctx.params.id, user.group_id)
  );
  if (!row) throw new ApiError('NOT_FOUND', 'Expense not found.', 404);
  return { ok: true, data: row };
});

// ---------------- POST /expenses ----------------

route('POST', '/expenses', async (ctx) => {
  const user = await requirePermission(ctx, 'expenses.create');
  const b = ctx.body || {};

  if (!b.category || !b.description || !b.amount_minor || !b.payment_method || !b.paid_at) {
    throw new ApiError(
      'VALIDATION_FAILED',
      'category, description, amount_minor, payment_method, paid_at are required.',
      400
    );
  }
  if (!Number.isInteger(b.amount_minor) || b.amount_minor <= 0) {
    throw new ApiError('VALIDATION_FAILED', 'amount_minor must be positive integer.', 400);
  }
  if (!VALID_METHODS.includes(b.payment_method)) {
    throw new ApiError('VALIDATION_FAILED', `payment_method must be one of: ${VALID_METHODS.join(', ')}.`, 400);
  }

  const result = await withTx((db) => {
    const groupId = user.group_id;
    const now = nowISO();
    const expenseId = generateId('exp');

    db.prepare(
      `INSERT INTO expenses
       (id, group_id, category, description, payee, amount_minor, currency,
        payment_method, paid_at, status, receipt_url, reference, notes,
        created_at, created_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'KES', ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`
    ).run(
      expenseId,
      groupId,
      b.category,
      b.description,
      b.payee || null,
      b.amount_minor,
      b.payment_method,
      b.paid_at,
      b.receipt_url || null,
      b.reference || null,
      b.notes || null,
      now,
      user.id,
      now
    );

    db.prepare(
      `INSERT INTO audit_logs
       (id, group_id, user_id, action, resource_type, resource_id, after_json, severity, created_at)
       VALUES (?, ?, ?, 'expenses.create', 'expenses', ?, ?, 'info', ?)`
    ).run(
      generateId('aud'),
      groupId,
      user.id,
      expenseId,
      JSON.stringify({ category: b.category, amount_minor: b.amount_minor }),
      now
    );

    return {
      expense_id: expenseId,
      status: 'pending',
      amount_minor: b.amount_minor,
    };
  });

  return [201, { ok: true, data: result }];
});

// ---------------- POST /expenses/:id/approve ----------------

route('POST', '/expenses/{id}/approve', async (ctx) => {
  const user = await requirePermission(ctx, 'expenses.approve');
  const id = ctx.params.id;

  const result = await withTx((db) => {
    const groupId = user.group_id;
    const now = nowISO();

    const expense = db
      .prepare(`SELECT * FROM expenses WHERE id = ? AND group_id = ?`)
      .get(id, groupId);
    if (!expense) throw new ApiError('NOT_FOUND', 'Expense not found.', 404);
    if (expense.status !== 'pending') {
      throw new ApiError('BUSINESS_RULE', `Expense is already ${expense.status}.`, 422);
    }

    const cashCode = expense.payment_method === 'bank' ? '1010'
                   : expense.payment_method === 'mpesa' ? '1020'
                   : '1000';
    const cashAcc = db.prepare(`SELECT id FROM accounts WHERE group_id = ? AND code = ?`).get(groupId, cashCode);
    const expAcc  = db.prepare(`SELECT id FROM accounts WHERE group_id = ? AND code = '5000'`).get(groupId);
    if (!cashAcc || !expAcc) {
      throw new ApiError('INTERNAL_ERROR', 'Required accounts missing.', 500);
    }

    // Cash sufficiency check
    const cashBal = db
      .prepare(
        `SELECT COALESCE(SUM(debit_minor),0) - COALESCE(SUM(credit_minor),0) AS bal
         FROM ledger_entries WHERE group_id = ? AND account_id = ?`
      )
      .get(groupId, cashAcc.id);
    if (cashBal.bal < expense.amount_minor) {
      throw new ApiError(
        'BUSINESS_RULE',
        `Insufficient ${cashCode} balance. Need ${expense.amount_minor}, have ${cashBal.bal}.`,
        422
      );
    }

    const txnId = generateId('txn');
    const datePart = now.slice(0, 10).replace(/-/g, '');
    const reference = `TXN-${datePart}-${shortRand()}`;

    db.prepare(
      `INSERT INTO transactions
       (id, group_id, reference, description, transaction_type, state, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'expense', 'created', ?, ?, ?)`
    ).run(
      txnId,
      groupId,
      reference,
      `Expense: ${expense.description} (${expense.currency} ${(expense.amount_minor / 100).toFixed(2)})`,
      user.id,
      now,
      now
    );

    // Dr 5000 Operating Expenses / Cr Cash
    db.prepare(
      `INSERT INTO ledger_entries
       (transaction_id, group_id, account_id, debit_minor, credit_minor, memo, posted_at, created_at)
       VALUES (?, ?, ?, ?, 0, 'Expense incurred', ?, ?)`
    ).run(txnId, groupId, expAcc.id, expense.amount_minor, now, now);

    db.prepare(
      `INSERT INTO ledger_entries
       (transaction_id, group_id, account_id, debit_minor, credit_minor, memo, posted_at, created_at)
       VALUES (?, ?, ?, 0, ?, 'Cash out', ?, ?)`
    ).run(txnId, groupId, cashAcc.id, expense.amount_minor, now, now);

    try {
      db.prepare(
        `UPDATE transactions SET state = 'posted', posted_at = ?, updated_at = ? WHERE id = ?`
      ).run(now, now, txnId);
    } catch (e) {
      throw new ApiError('BUSINESS_RULE', `Ledger rejected: ${e.message}`, 422);
    }

    db.prepare(
      `UPDATE expenses
       SET status = 'posted', approved_at = ?, approved_by = ?, transaction_id = ?, updated_at = ?
       WHERE id = ?`
    ).run(now, user.id, txnId, now, id);

    db.prepare(
      `INSERT INTO audit_logs
       (id, group_id, user_id, action, resource_type, resource_id, after_json, severity, created_at)
       VALUES (?, ?, ?, 'expenses.approve', 'expenses', ?, ?, 'info', ?)`
    ).run(
      generateId('aud'),
      groupId,
      user.id,
      id,
      JSON.stringify({ transaction_id: txnId, amount_minor: expense.amount_minor }),
      now
    );

    return {
      expense_id: id,
      status: 'posted',
      transaction_id: txnId,
      reference,
      amount_minor: expense.amount_minor,
    };
  });

  return { ok: true, data: result };
});

// ---------------- POST /expenses/:id/reject ----------------

route('POST', '/expenses/{id}/reject', async (ctx) => {
  const user = await requirePermission(ctx, 'expenses.approve');
  const reason = ctx.body?.reason || 'Rejected';

  const result = await withTx((db) => {
    const now = nowISO();
    const expense = db
      .prepare(`SELECT * FROM expenses WHERE id = ? AND group_id = ?`)
      .get(ctx.params.id, user.group_id);
    if (!expense) throw new ApiError('NOT_FOUND', 'Expense not found.', 404);
    if (expense.status !== 'pending') {
      throw new ApiError('BUSINESS_RULE', `Expense is already ${expense.status}.`, 422);
    }
    db.prepare(
      `UPDATE expenses SET status = 'rejected', notes = ?, updated_at = ? WHERE id = ?`
    ).run(reason, now, ctx.params.id);

    db.prepare(
      `INSERT INTO audit_logs
       (id, group_id, user_id, action, resource_type, resource_id, after_json, severity, created_at)
       VALUES (?, ?, ?, 'expenses.reject', 'expenses', ?, ?, 'warning', ?)`
    ).run(
      generateId('aud'),
      user.group_id,
      user.id,
      ctx.params.id,
      JSON.stringify({ reason }),
      now
    );

    return { expense_id: ctx.params.id, status: 'rejected' };
  });

  return { ok: true, data: result };
});
