import crypto from 'node:crypto';
import { route } from '../server.js';
import { withConn, withTx } from '../db.js';
import { ApiError } from '../errors.js';
import { requirePermission } from '../deps.js';
import { generateId } from '../security.js';

function nowISO() { return new Date().toISOString(); }
function shortRand() { return crypto.randomBytes(3).toString('hex'); }

const VALID_METHODS = ['cash', 'bank', 'mpesa', 'cheque', 'other'];

// Map income category to income account code
function incomeAccountCode(category) {
  switch (category) {
    case 'interest':    return '4100';
    case 'investment':  return '4200';
    case 'fines':       return '4300';
    default:            return '4200';
  }
}

// ---------------- GET /income ----------------

route('GET', '/income', async (ctx) => {
  const user = await requirePermission(ctx, 'income.read');
  const page = Math.max(1, Number(ctx.query.page || 1));
  const perPage = Math.min(100, Math.max(1, Number(ctx.query.per_page || 20)));
  const offset = (page - 1) * perPage;

  const result = await withConn((db) => {
    const total = db
      .prepare(`SELECT COUNT(*) AS c FROM income WHERE group_id = ?`)
      .get(user.group_id).c;

    const rows = db
      .prepare(
        `SELECT id, category, description, amount_minor, currency, received_at,
                status, transaction_id, created_at
         FROM income WHERE group_id = ?
         ORDER BY received_at DESC LIMIT ? OFFSET ?`
      )
      .all(user.group_id, perPage, offset);

    return { rows, total };
  });

  return {
    ok: true,
    data: result.rows,
    meta: { page, per_page: perPage, total: result.total, pages: Math.ceil(result.total / perPage) },
  };
});

// ---------------- POST /income ----------------

route('POST', '/income', async (ctx) => {
  const user = await requirePermission(ctx, 'income.create');
  const b = ctx.body || {};

  if (!b.category || !b.description || !b.amount_minor || !b.received_at) {
    throw new ApiError(
      'VALIDATION_FAILED',
      'category, description, amount_minor, received_at are required.',
      400
    );
  }
  if (!Number.isInteger(b.amount_minor) || b.amount_minor <= 0) {
    throw new ApiError('VALIDATION_FAILED', 'amount_minor must be positive integer.', 400);
  }

  const result = await withTx((db) => {
    const groupId = user.group_id;
    const now = nowISO();
    const method = b.payment_method || 'cash';
    if (!VALID_METHODS.includes(method)) {
      throw new ApiError('VALIDATION_FAILED', `payment_method must be one of: ${VALID_METHODS.join(', ')}.`, 400);
    }

    const cashCode = method === 'bank' ? '1010' : method === 'mpesa' ? '1020' : '1000';
    const incCode = incomeAccountCode(b.category);

    const cashAcc = db.prepare(`SELECT id FROM accounts WHERE group_id = ? AND code = ?`).get(groupId, cashCode);
    const incAcc  = db.prepare(`SELECT id FROM accounts WHERE group_id = ? AND code = ?`).get(groupId, incCode);
    if (!cashAcc || !incAcc) {
      throw new ApiError('INTERNAL_ERROR', `Required accounts missing (${cashCode}/${incCode}).`, 500);
    }

    const incomeId = generateId('inc');
    const txnId = generateId('txn');
    const datePart = now.slice(0, 10).replace(/-/g, '');
    const reference = `TXN-${datePart}-${shortRand()}`;

    db.prepare(
      `INSERT INTO income
       (id, group_id, category, description, amount_minor, currency,
        received_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'KES', ?, 'pending', ?, ?)`
    ).run(incomeId, groupId, b.category, b.description, b.amount_minor, b.received_at, now, now);

    db.prepare(
      `INSERT INTO transactions
       (id, group_id, reference, description, transaction_type, state, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'income', 'created', ?, ?, ?)`
    ).run(
      txnId,
      groupId,
      reference,
      `Income: ${b.description} (${(b.amount_minor / 100).toFixed(2)} KES)`,
      user.id,
      now,
      now
    );

    // Dr Cash / Cr Income
    db.prepare(
      `INSERT INTO ledger_entries
       (transaction_id, group_id, account_id, debit_minor, credit_minor, memo, posted_at, created_at)
       VALUES (?, ?, ?, ?, 0, 'Income received', ?, ?)`
    ).run(txnId, groupId, cashAcc.id, b.amount_minor, now, now);

    db.prepare(
      `INSERT INTO ledger_entries
       (transaction_id, group_id, account_id, debit_minor, credit_minor, memo, posted_at, created_at)
       VALUES (?, ?, ?, 0, ?, 'Income credit', ?, ?)`
    ).run(txnId, groupId, incAcc.id, b.amount_minor, now, now);

    try {
      db.prepare(
        `UPDATE transactions SET state = 'posted', posted_at = ?, updated_at = ? WHERE id = ?`
      ).run(now, now, txnId);
    } catch (e) {
      throw new ApiError('BUSINESS_RULE', `Ledger rejected: ${e.message}`, 422);
    }

    db.prepare(
      `UPDATE income SET status = 'posted', transaction_id = ?, updated_at = ? WHERE id = ?`
    ).run(txnId, now, incomeId);

    db.prepare(
      `INSERT INTO audit_logs
       (id, group_id, user_id, action, resource_type, resource_id, after_json, severity, created_at)
       VALUES (?, ?, ?, 'income.create', 'income', ?, ?, 'info', ?)`
    ).run(
      generateId('aud'),
      groupId,
      user.id,
      incomeId,
      JSON.stringify({ category: b.category, amount_minor: b.amount_minor, transaction_id: txnId }),
      now
    );

    return {
      income_id: incomeId,
      transaction_id: txnId,
      reference,
      status: 'posted',
      amount_minor: b.amount_minor,
    };
  });

  return [201, { ok: true, data: result }];
});
