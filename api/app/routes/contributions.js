import crypto from 'node:crypto';
import { route } from '../server.js';
import { withConn, withTx } from '../db.js';
import { ApiError } from '../errors.js';
import { requirePermission } from '../deps.js';
import { generateId } from '../security.js';

function nowISO() { return new Date().toISOString(); }

function shortRand() {
  return crypto.randomBytes(3).toString('hex');
}

// ---------------- GET /contributions ----------------

route('GET', '/contributions', async (ctx) => {
  const user = await requirePermission(ctx, 'contributions.read');
  const page = Math.max(1, Number(ctx.query.page || 1));
  const perPage = Math.min(100, Math.max(1, Number(ctx.query.per_page || 20)));
  const offset = (page - 1) * perPage;

  // Member-scoped if the caller is ONLY a member (no elevated role)
  const onlyMember =
    user.roles.length === 1 && user.roles[0] === 'member' && !user.permissions.includes('contributions.create');

  const result = await withConn((db) => {
    const params = [user.group_id];
    let where = 'c.group_id = ?';
    if (onlyMember) {
      where += ' AND c.member_id = ?';
      params.push(user.member_id);
    }
    if (ctx.query.member_id && !onlyMember) {
      where += ' AND c.member_id = ?';
      params.push(ctx.query.member_id);
    }
    if (ctx.query.status) {
      where += ' AND c.status = ?';
      params.push(ctx.query.status);
    }
    if (ctx.query.period_label) {
      where += ' AND c.period_label = ?';
      params.push(ctx.query.period_label);
    }

    const total = db
      .prepare(`SELECT COUNT(*) AS c FROM contributions c WHERE ${where}`)
      .get(...params).c;

    const rows = db
      .prepare(
        `SELECT c.id, c.member_id, m.full_name AS member_name,
                c.plan_id, c.amount_minor, c.currency, c.contribution_date,
                c.period_label, c.status, c.receipt_number, c.transaction_id,
                c.payment_reference, c.created_at
         FROM contributions c
         LEFT JOIN members m ON m.id = c.member_id
         WHERE ${where}
         ORDER BY c.contribution_date DESC, c.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, perPage, offset);

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

// ---------------- GET /contributions/:id ----------------

route('GET', '/contributions/{id}', async (ctx) => {
  const user = await requirePermission(ctx, 'contributions.read');
  const id = ctx.params.id;

  const result = await withConn((db) => {
    const row = db
      .prepare(
        `SELECT c.*, m.full_name AS member_name
         FROM contributions c
         LEFT JOIN members m ON m.id = c.member_id
         WHERE c.id = ? AND c.group_id = ?`
      )
      .get(id, user.group_id);
    if (!row) return null;

    // Enforce member-scope
    if (user.roles.length === 1 && user.roles[0] === 'member' && row.member_id !== user.member_id) {
      return null;
    }
    return row;
  });

  if (!result) throw new ApiError('NOT_FOUND', 'Contribution not found.', 404);
  return { ok: true, data: result };
});

// ---------------- POST /contributions (THE BIG ONE) ----------------

route('POST', '/contributions', async (ctx) => {
  const user = await requirePermission(ctx, 'contributions.create');
  const b = ctx.body || {};

  if (!b.member_id || !b.amount_minor || !b.currency || !b.contribution_date) {
    throw new ApiError(
      'VALIDATION_FAILED',
      'member_id, amount_minor, currency, contribution_date are required.',
      400
    );
  }
  if (!Number.isInteger(b.amount_minor) || b.amount_minor <= 0) {
    throw new ApiError('VALIDATION_FAILED', 'amount_minor must be a positive integer.', 400);
  }

  const result = await withTx((db) => {
    const groupId = user.group_id;
    const now = nowISO();

    // 1. Member must exist and be contribute-able
    const member = db
      .prepare(
        `SELECT id, status FROM members
         WHERE id = ? AND group_id = ? AND deleted_at IS NULL`
      )
      .get(b.member_id, groupId);
    if (!member) throw new ApiError('NOT_FOUND', 'Member not found.', 404);
    if (member.status === 'exited' || member.status === 'deceased') {
      throw new ApiError(
        'BUSINESS_RULE',
        `Cannot record contribution for member with status "${member.status}".`,
        422
      );
    }

    // 2. Plan (optional) must exist and be active
    if (b.plan_id) {
      const plan = db
        .prepare(
          `SELECT id FROM contribution_plans
           WHERE id = ? AND group_id = ? AND is_active = 1`
        )
        .get(b.plan_id, groupId);
      if (!plan) throw new ApiError('NOT_FOUND', 'Contribution plan not found or inactive.', 404);

      // 3. Duplicate check
      if (b.period_label) {
        const dup = db
          .prepare(
            `SELECT id FROM contributions
             WHERE group_id = ? AND member_id = ? AND plan_id = ?
               AND period_label = ? AND status = 'posted'`
          )
          .get(groupId, b.member_id, b.plan_id, b.period_label);
        if (dup) {
          throw new ApiError(
            'CONFLICT',
            `A posted contribution already exists for member/plan/period.`,
            409
          );
        }
      }
    }

    // 4. Look up system accounts by code
    const cashAcc = db
      .prepare(`SELECT id FROM accounts WHERE group_id = ? AND code = '1000'`)
      .get(groupId);
    const savingsAcc = db
      .prepare(`SELECT id FROM accounts WHERE group_id = ? AND code = '2000'`)
      .get(groupId);
    if (!cashAcc || !savingsAcc) {
      throw new ApiError('INTERNAL_ERROR', 'Required system accounts (1000/2000) missing.', 500);
    }

    // 5. Generate IDs
    const contributionId = generateId('con');
    const transactionId = generateId('txn');
    const datePart = now.slice(0, 10).replace(/-/g, '');
    const rand = shortRand();
    const reference = `TXN-${datePart}-${rand}`;
    const receipt = `RCT-${String(b.contribution_date).slice(0, 7).replace('-', '')}-${rand}`;

    // 6. Insert contribution (pending)
    db.prepare(
      `INSERT INTO contributions
       (id, group_id, member_id, plan_id, amount_minor, currency,
        contribution_date, period_label, status, payment_reference, notes,
        created_at, created_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
    ).run(
      contributionId,
      groupId,
      b.member_id,
      b.plan_id || null,
      b.amount_minor,
      b.currency,
      b.contribution_date,
      b.period_label || null,
      b.payment_reference || null,
      b.notes || null,
      now,
      user.id,
      now
    );

    // 7. Insert transaction (created)
    db.prepare(
      `INSERT INTO transactions
       (id, group_id, reference, description, transaction_type, state,
        created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'contribution', 'created', ?, ?, ?)`
    ).run(
      transactionId,
      groupId,
      reference,
      `Contribution ${b.currency} ${(b.amount_minor / 100).toFixed(2)} from member ${b.member_id}`,
      user.id,
      now,
      now
    );

    // 8. Insert two ledger entries (double-entry)
    db.prepare(
      `INSERT INTO ledger_entries
       (transaction_id, group_id, account_id, member_id, debit_minor, credit_minor,
        memo, posted_at, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
    ).run(
      transactionId,
      groupId,
      cashAcc.id,
      b.member_id,
      b.amount_minor,
      'Contribution received',
      now,
      now
    );

    db.prepare(
      `INSERT INTO ledger_entries
       (transaction_id, group_id, account_id, member_id, debit_minor, credit_minor,
        memo, posted_at, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`
    ).run(
      transactionId,
      groupId,
      savingsAcc.id,
      b.member_id,
      b.amount_minor,
      'Member savings credit',
      now,
      now
    );

    // 9. Post the transaction — DB trigger validates SUM(debits)=SUM(credits)
    try {
      db.prepare(
        `UPDATE transactions
         SET state = 'posted', posted_at = ?, updated_at = ?
         WHERE id = ?`
      ).run(now, now, transactionId);
    } catch (e) {
      throw new ApiError('BUSINESS_RULE', `Ledger rejected: ${e.message}`, 422);
    }

    // 10. Mark contribution posted
    db.prepare(
      `UPDATE contributions
       SET status = 'posted', transaction_id = ?, receipt_number = ?, updated_at = ?
       WHERE id = ?`
    ).run(transactionId, receipt, now, contributionId);

    // 11. Audit
    db.prepare(
      `INSERT INTO audit_logs
       (id, group_id, user_id, action, resource_type, resource_id,
        after_json, severity, created_at)
       VALUES (?, ?, ?, 'contributions.create', 'contributions', ?, ?, 'info', ?)`
    ).run(
      generateId('aud'),
      groupId,
      user.id,
      contributionId,
      JSON.stringify({
        member_id: b.member_id,
        amount_minor: b.amount_minor,
        plan_id: b.plan_id,
        period_label: b.period_label,
        transaction_id: transactionId,
      }),
      now
    );

    return {
      contribution_id: contributionId,
      transaction_id: transactionId,
      reference,
      receipt_number: receipt,
      status: 'posted',
      amount_minor: b.amount_minor,
      currency: b.currency,
    };
  });

  return [201, { ok: true, data: result }];
});

// ---------------- POST /contributions/:id/reverse ----------------

route('POST', '/contributions/{id}/reverse', async (ctx) => {
  const user = await requirePermission(ctx, 'transactions.reverse');
  const id = ctx.params.id;
  const reason = ctx.body?.reason || 'Reversal';

  const result = await withTx((db) => {
    const groupId = user.group_id;
    const now = nowISO();

    // 1. Original contribution must exist and be posted
    const contribution = db
      .prepare(`SELECT * FROM contributions WHERE id = ? AND group_id = ?`)
      .get(id, groupId);
    if (!contribution) throw new ApiError('NOT_FOUND', 'Contribution not found.', 404);
    if (contribution.status !== 'posted') {
      throw new ApiError(
        'BUSINESS_RULE',
        `Cannot reverse a contribution in status "${contribution.status}".`,
        422
      );
    }

    // 2. Original transaction must exist and be posted
    const originalTxn = db
      .prepare(`SELECT * FROM transactions WHERE id = ? AND group_id = ?`)
      .get(contribution.transaction_id, groupId);
    if (!originalTxn) throw new ApiError('NOT_FOUND', 'Original transaction not found.', 404);
    if (originalTxn.state !== 'posted') {
      throw new ApiError(
        'BUSINESS_RULE',
        `Cannot reverse a transaction in state "${originalTxn.state}".`,
        422
      );
    }

    // 3. Load original ledger entries (must not have already been reversed)
    if (originalTxn.reversed_by) {
      throw new ApiError('CONFLICT', 'Transaction already reversed.', 409);
    }

    const originalEntries = db
      .prepare(
        `SELECT account_id, member_id, debit_minor, credit_minor, memo
         FROM ledger_entries WHERE transaction_id = ?`
      )
      .all(originalTxn.id);

    if (originalEntries.length === 0) {
      throw new ApiError('INTERNAL_ERROR', 'Original transaction has no ledger entries.', 500);
    }

    // 4. Create the reversal transaction
    const reversalTxnId = generateId('txn');
    const datePart = now.slice(0, 10).replace(/-/g, '');
    const reference = `TXN-${datePart}-REV-${shortRand()}`;

    db.prepare(
      `INSERT INTO transactions
       (id, group_id, reference, description, transaction_type, state,
        reverses, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'reversal', 'created', ?, ?, ?, ?)`
    ).run(
      reversalTxnId,
      groupId,
      reference,
      `Reversal of ${originalTxn.reference}: ${reason}`,
      originalTxn.id,
      user.id,
      now,
      now
    );

    // 5. Flip every entry: Dr ↔ Cr
    for (const e of originalEntries) {
      db.prepare(
        `INSERT INTO ledger_entries
         (transaction_id, group_id, account_id, member_id, debit_minor, credit_minor,
          memo, posted_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        reversalTxnId,
        groupId,
        e.account_id,
        e.member_id,
        e.credit_minor,
        e.debit_minor,
        `Reversal: ${e.memo || ''}`.trim(),
        now,
        now
      );
    }

    // 6. Post the reversal
    try {
      db.prepare(
        `UPDATE transactions SET state = 'posted', posted_at = ?, updated_at = ? WHERE id = ?`
      ).run(now, now, reversalTxnId);
    } catch (e) {
      throw new ApiError('BUSINESS_RULE', `Ledger rejected reversal: ${e.message}`, 422);
    }

    // 7. Mark original transaction reversed
    db.prepare(
      `UPDATE transactions SET state = 'reversed', reversed_by = ?, updated_at = ? WHERE id = ?`
    ).run(reversalTxnId, now, originalTxn.id);

    // 8. Mark contribution reversed
    db.prepare(
      `UPDATE contributions SET status = 'reversed', updated_at = ? WHERE id = ?`
    ).run(now, id);

    // 9. Audit
    db.prepare(
      `INSERT INTO audit_logs
       (id, group_id, user_id, action, resource_type, resource_id, after_json, severity, created_at)
       VALUES (?, ?, ?, 'contributions.reverse', 'contributions', ?, ?, 'warning', ?)`
    ).run(
      generateId('aud'),
      groupId,
      user.id,
      id,
      JSON.stringify({
        reason,
        original_transaction_id: originalTxn.id,
        reversal_transaction_id: reversalTxnId,
      }),
      now
    );

    return {
      contribution_id: id,
      original_transaction_id: originalTxn.id,
      reversal_transaction_id: reversalTxnId,
      reference,
      contribution_status: 'reversed',
    };
  });

  return [201, { ok: true, data: result }];
});
