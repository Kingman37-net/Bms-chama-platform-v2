import crypto from 'node:crypto';
import { route } from '../server.js';
import { withConn, withTx } from '../db.js';
import { ApiError } from '../errors.js';
import { requirePermission } from '../deps.js';
import { generateId } from '../security.js';

function nowISO() { return new Date().toISOString(); }
function shortRand() { return crypto.randomBytes(3).toString('hex'); }

// Flat interest: total interest = principal * rate * term/12
// Reducing balance: standard amortization
function generateSchedule(principal, rateBps, termMonths, startDate, method) {
  const rows = [];
  const monthlyRate = rateBps / 10000 / 12;

  if (method === 'flat') {
    const totalInterest = Math.round(principal * (rateBps / 10000) * (termMonths / 12));
    const totalPayable = principal + totalInterest;
    const perInstallment = Math.floor(totalPayable / termMonths);
    let remaining = totalPayable - perInstallment * termMonths;

    const principalPerInst = Math.floor(principal / termMonths);
    const interestPerInst = Math.floor(totalInterest / termMonths);
    let principalRemainder = principal - principalPerInst * termMonths;
    let interestRemainder = totalInterest - interestPerInst * termMonths;

    for (let i = 1; i <= termMonths; i++) {
      let p = principalPerInst;
      let int = interestPerInst;
      if (i === termMonths) {
        p += principalRemainder;
        int += interestRemainder;
      }
      const due = new Date(startDate);
      due.setMonth(due.getMonth() + i);
      rows.push({
        installment_no: i,
        due_date: due.toISOString().slice(0, 10),
        principal_minor: p,
        interest_minor: int,
        total_due_minor: p + int,
      });
    }
    return { schedule: rows, totalPayable };
  }

  // Reducing balance (amortization)
  let balance = principal;
  const payment = Math.round(
    (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths))
  );

  let totalInterest = 0;
  for (let i = 1; i <= termMonths; i++) {
    const interest = Math.round(balance * monthlyRate);
    let principalPart = payment - interest;
    if (i === termMonths) {
      principalPart = balance;
    }
    const totalDue = principalPart + interest;
    totalInterest += interest;

    const due = new Date(startDate);
    due.setMonth(due.getMonth() + i);
    rows.push({
      installment_no: i,
      due_date: due.toISOString().slice(0, 10),
      principal_minor: principalPart,
      interest_minor: interest,
      total_due_minor: totalDue,
    });
    balance -= principalPart;
  }

  return { schedule: rows, totalPayable: principal + totalInterest };
}

// ---------------- GET /loans ----------------

route('GET', '/loans', async (ctx) => {
  const user = await requirePermission(ctx, 'loans.read');
  const page = Math.max(1, Number(ctx.query.page || 1));
  const perPage = Math.min(100, Math.max(1, Number(ctx.query.per_page || 20)));
  const offset = (page - 1) * perPage;

  const onlyMember =
    user.roles.length === 1 &&
    user.roles[0] === 'member' &&
    !user.permissions.includes('loans.approve');

  const result = await withConn((db) => {
    const params = [user.group_id];
    let where = 'l.group_id = ?';
    if (onlyMember) {
      where += ' AND l.member_id = ?';
      params.push(user.member_id);
    }
    if (ctx.query.status) {
      where += ' AND l.status = ?';
      params.push(ctx.query.status);
    }

    const total = db
      .prepare(`SELECT COUNT(*) AS c FROM loans l WHERE ${where}`)
      .get(...params).c;

    const rows = db
      .prepare(
        `SELECT l.id, l.reference, l.member_id, m.full_name AS member_name,
                l.product_id, p.name AS product_name,
                l.principal_minor, l.total_payable_minor, l.amount_paid_minor,
                l.outstanding_minor, l.currency, l.status,
                l.application_date, l.next_due_date
         FROM loans l
         LEFT JOIN members m ON m.id = l.member_id
         LEFT JOIN loan_products p ON p.id = l.product_id
         WHERE ${where}
         ORDER BY l.application_date DESC
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

// ---------------- GET /loans/products ----------------

route('GET', '/loans/products', async (ctx) => {
  const user = await requirePermission(ctx, 'loans.read');
  const rows = await withConn((db) =>
    db
      .prepare(
        `SELECT id, name, description, min_amount_minor, max_amount_minor,
                interest_rate_bps, interest_method, term_months,
                grace_period_days, late_fee_bps, requires_guarantors,
                min_guarantors, eligibility_months, is_active
         FROM loan_products WHERE group_id = ? ORDER BY name`
      )
      .all(user.group_id)
  );
  return { ok: true, data: rows };
});

// ---------------- GET /loans/:id ----------------

route('GET', '/loans/{id}', async (ctx) => {
  const user = await requirePermission(ctx, 'loans.read');
  const id = ctx.params.id;

  const result = await withConn((db) => {
    const loan = db
      .prepare(
        `SELECT l.*, m.full_name AS member_name, p.name AS product_name
         FROM loans l
         LEFT JOIN members m ON m.id = l.member_id
         LEFT JOIN loan_products p ON p.id = l.product_id
         WHERE l.id = ? AND l.group_id = ?`
      )
      .get(id, user.group_id);
    if (!loan) return null;

    if (user.roles.length === 1 && user.roles[0] === 'member' && loan.member_id !== user.member_id) {
      return null;
    }

    const schedule = db
      .prepare(
        `SELECT installment_no, due_date, principal_minor, interest_minor,
                total_due_minor, paid_minor, paid_at, status
         FROM loan_schedules WHERE loan_id = ? ORDER BY installment_no`
      )
      .all(id);

    const repayments = db
      .prepare(
        `SELECT id, amount_minor, principal_minor, interest_minor, penalty_minor,
                repaid_at, payment_method, payment_reference, receipt_number
         FROM loan_repayments WHERE loan_id = ? ORDER BY repaid_at`
      )
      .all(id);

    const guarantors = db
      .prepare(
        `SELECT g.member_id, m.full_name AS member_name, g.guaranteed_minor, g.status
         FROM loan_guarantors g
         LEFT JOIN members m ON m.id = g.member_id
         WHERE g.loan_id = ?`
      )
      .all(id);

    return { ...loan, schedule, repayments, guarantors };
  });

  if (!result) throw new ApiError('NOT_FOUND', 'Loan not found.', 404);
  return { ok: true, data: result };
});

// ---------------- POST /loans (apply) ----------------

route('POST', '/loans', async (ctx) => {
  const user = await requirePermission(ctx, 'loans.create');
  const b = ctx.body || {};

  if (!b.member_id || !b.product_id || !b.principal_minor) {
    throw new ApiError(
      'VALIDATION_FAILED',
      'member_id, product_id, principal_minor are required.',
      400
    );
  }
  if (!Number.isInteger(b.principal_minor) || b.principal_minor <= 0) {
    throw new ApiError('VALIDATION_FAILED', 'principal_minor must be positive integer.', 400);
  }

  const result = await withTx((db) => {
    const groupId = user.group_id;
    const now = nowISO();

    const member = db
      .prepare(`SELECT id, status FROM members WHERE id = ? AND group_id = ? AND deleted_at IS NULL`)
      .get(b.member_id, groupId);
    if (!member) throw new ApiError('NOT_FOUND', 'Member not found.', 404);
    if (member.status !== 'active') {
      throw new ApiError('BUSINESS_RULE', `Member status is "${member.status}" — cannot apply.`, 422);
    }

    const product = db
      .prepare(`SELECT * FROM loan_products WHERE id = ? AND group_id = ? AND is_active = 1`)
      .get(b.product_id, groupId);
    if (!product) throw new ApiError('NOT_FOUND', 'Loan product not found or inactive.', 404);

    if (b.principal_minor < product.min_amount_minor || b.principal_minor > product.max_amount_minor) {
      throw new ApiError(
        'BUSINESS_RULE',
        `Amount must be between ${product.min_amount_minor} and ${product.max_amount_minor} minor units.`,
        422
      );
    }

    // Prevent multiple active loans (simple rule)
    const active = db
      .prepare(
        `SELECT id FROM loans WHERE member_id = ? AND status IN ('submitted','under_review','approved','disbursed','active')`
      )
      .get(b.member_id);
    if (active) {
      throw new ApiError('BUSINESS_RULE', 'Member already has an active or pending loan.', 422);
    }

    // Guarantors required?
    const guarantors = Array.isArray(b.guarantors) ? b.guarantors : [];
    if (product.requires_guarantors && guarantors.length < product.min_guarantors) {
      throw new ApiError(
        'BUSINESS_RULE',
        `This product requires at least ${product.min_guarantors} guarantor(s).`,
        422
      );
    }

    // Validate each guarantor exists
    for (const g of guarantors) {
      const gm = db
        .prepare(`SELECT id FROM members WHERE id = ? AND group_id = ? AND deleted_at IS NULL`)
        .get(g.member_id, groupId);
      if (!gm) throw new ApiError('NOT_FOUND', `Guarantor ${g.member_id} not found.`, 404);
      if (g.member_id === b.member_id) {
        throw new ApiError('BUSINESS_RULE', 'Member cannot guarantee their own loan.', 422);
      }
    }

    // Generate reference
    const datePart = now.slice(0, 10).replace(/-/g, '');
    const rand = shortRand();
    const reference = `LN-${datePart}-${rand}`;
    const loanId = generateId('lon');

    const termMonths = b.term_months || product.term_months;
    const totalPayable = Math.round(
      b.principal_minor * (1 + (product.interest_rate_bps / 10000) * (termMonths / 12))
    );

    db.prepare(
      `INSERT INTO loans
       (id, group_id, member_id, product_id, reference,
        principal_minor, interest_rate_bps, interest_method, term_months,
        total_payable_minor, amount_paid_minor, outstanding_minor,
        currency, status, application_date, notes,
        created_at, created_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'KES', 'submitted', ?, ?, ?, ?, ?)`
    ).run(
      loanId,
      groupId,
      b.member_id,
      b.product_id,
      reference,
      b.principal_minor,
      product.interest_rate_bps,
      product.interest_method,
      termMonths,
      totalPayable,
      totalPayable,
      now.slice(0, 10),
      b.notes || null,
      now,
      user.id,
      now
    );

    // Insert guarantors
    for (const g of guarantors) {
      db.prepare(
        `INSERT INTO loan_guarantors (id, loan_id, member_id, guaranteed_minor, status, created_at)
         VALUES (?, ?, ?, ?, 'active', ?)`
      ).run(generateId('lng'), loanId, g.member_id, g.guaranteed_minor || b.principal_minor, now);
    }

    db.prepare(
      `INSERT INTO audit_logs (id, group_id, user_id, action, resource_type, resource_id, after_json, severity, created_at)
       VALUES (?, ?, ?, 'loans.create', 'loans', ?, ?, 'info', ?)`
    ).run(
      generateId('aud'),
      groupId,
      user.id,
      loanId,
      JSON.stringify({ reference, principal_minor: b.principal_minor, product_id: b.product_id }),
      now
    );

    return { loan_id: loanId, reference, status: 'submitted', total_payable_minor: totalPayable };
  });

  return [201, { ok: true, data: result }];
});

// ---------------- POST /loans/:id/approve ----------------

route('POST', '/loans/{id}/approve', async (ctx) => {
  const user = await requirePermission(ctx, 'loans.approve');
  const id = ctx.params.id;

  const result = await withTx((db) => {
    const groupId = user.group_id;
    const now = nowISO();

    const loan = db
      .prepare(`SELECT * FROM loans WHERE id = ? AND group_id = ?`)
      .get(id, groupId);
    if (!loan) throw new ApiError('NOT_FOUND', 'Loan not found.', 404);
    if (!['submitted', 'under_review'].includes(loan.status)) {
      throw new ApiError('BUSINESS_RULE', `Cannot approve a loan in status "${loan.status}".`, 422);
    }

    // Generate schedule
    const startDate = new Date();
    const { schedule, totalPayable } = generateSchedule(
      loan.principal_minor,
      loan.interest_rate_bps,
      loan.term_months,
      startDate,
      loan.interest_method
    );

    // Remove any existing schedule (idempotent re-approval)
    db.prepare(`DELETE FROM loan_schedules WHERE loan_id = ?`).run(id);

    for (const s of schedule) {
      db.prepare(
        `INSERT INTO loan_schedules
         (id, loan_id, installment_no, due_date, principal_minor, interest_minor,
          total_due_minor, paid_minor, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'pending', ?, ?)`
      ).run(
        generateId('lns'),
        id,
        s.installment_no,
        s.due_date,
        s.principal_minor,
        s.interest_minor,
        s.total_due_minor,
        now,
        now
      );
    }

    db.prepare(
      `UPDATE loans
       SET status = 'approved', approved_at = ?, approved_by = ?,
           total_payable_minor = ?, outstanding_minor = ?,
           next_due_date = ?, updated_at = ?
       WHERE id = ?`
    ).run(now, user.id, totalPayable, totalPayable, schedule[0]?.due_date || null, now, id);

    db.prepare(
      `INSERT INTO audit_logs (id, group_id, user_id, action, resource_type, resource_id, after_json, severity, created_at)
       VALUES (?, ?, ?, 'loans.approve', 'loans', ?, ?, 'info', ?)`
    ).run(
      generateId('aud'),
      groupId,
      user.id,
      id,
      JSON.stringify({ installments: schedule.length, total_payable_minor: totalPayable }),
      now
    );

    return {
      loan_id: id,
      status: 'approved',
      installments: schedule.length,
      total_payable_minor: totalPayable,
      first_due_date: schedule[0]?.due_date,
    };
  });

  return { ok: true, data: result };
});

// ---------------- POST /loans/:id/reject ----------------

route('POST', '/loans/{id}/reject', async (ctx) => {
  const user = await requirePermission(ctx, 'loans.approve');
  const id = ctx.params.id;
  const reason = ctx.body?.reason || 'Rejected';

  await withTx((db) => {
    const loan = db
      .prepare(`SELECT id, status FROM loans WHERE id = ? AND group_id = ?`)
      .get(id, user.group_id);
    if (!loan) throw new ApiError('NOT_FOUND', 'Loan not found.', 404);
    if (!['submitted', 'under_review', 'approved'].includes(loan.status)) {
      throw new ApiError('BUSINESS_RULE', `Cannot reject a loan in status "${loan.status}".`, 422);
    }
    const now = nowISO();
    db.prepare(
      `UPDATE loans SET status = 'rejected', notes = ?, updated_at = ? WHERE id = ?`
    ).run(reason, now, id);

    db.prepare(
      `INSERT INTO audit_logs (id, group_id, user_id, action, resource_type, resource_id, after_json, severity, created_at)
       VALUES (?, ?, ?, 'loans.reject', 'loans', ?, ?, 'warning', ?)`
    ).run(
      generateId('aud'),
      user.group_id,
      user.id,
      id,
      JSON.stringify({ reason }),
      now
    );
  });

  return { ok: true, data: { loan_id: id, status: 'rejected' } };
});

// ---------------- POST /loans/:id/disburse ----------------

route('POST', '/loans/{id}/disburse', async (ctx) => {
  const user = await requirePermission(ctx, 'loans.disburse');
  const id = ctx.params.id;
  const method = ctx.body?.method || 'cash';

  const result = await withTx((db) => {
    const groupId = user.group_id;
    const now = nowISO();

    const loan = db
      .prepare(`SELECT * FROM loans WHERE id = ? AND group_id = ?`)
      .get(id, groupId);
    if (!loan) throw new ApiError('NOT_FOUND', 'Loan not found.', 404);
    if (loan.status !== 'approved') {
      throw new ApiError('BUSINESS_RULE', `Cannot disburse a loan in status "${loan.status}".`, 422);
    }

    const cashCode = method === 'bank' ? '1010' : method === 'mpesa' ? '1020' : '1000';
    const cashAcc = db
      .prepare(`SELECT id FROM accounts WHERE group_id = ? AND code = ?`)
      .get(groupId, cashCode);
    const loansAcc = db
      .prepare(`SELECT id FROM accounts WHERE group_id = ? AND code = '1100'`)
      .get(groupId);
    if (!cashAcc || !loansAcc) {
      throw new ApiError('INTERNAL_ERROR', 'Required accounts missing.', 500);
    }

    // Check cash sufficiency
    const cashBal = db
      .prepare(
        `SELECT COALESCE(SUM(debit_minor), 0) - COALESCE(SUM(credit_minor), 0) AS bal
         FROM ledger_entries WHERE group_id = ? AND account_id = ?`
      )
      .get(groupId, cashAcc.id);
    if (cashBal.bal < loan.principal_minor) {
      throw new ApiError(
        'BUSINESS_RULE',
        `Insufficient cash. Need ${loan.principal_minor}, have ${cashBal.bal}.`,
        422
      );
    }

    const txnId = generateId('txn');
    const datePart = now.slice(0, 10).replace(/-/g, '');
    const reference = `TXN-${datePart}-${shortRand()}`;

    db.prepare(
      `INSERT INTO transactions
       (id, group_id, reference, description, transaction_type, state, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'loan_disbursement', 'created', ?, ?, ?)`
    ).run(
      txnId,
      groupId,
      reference,
      `Loan disbursement ${loan.reference} (${loan.currency} ${(loan.principal_minor / 100).toFixed(2)})`,
      user.id,
      now,
      now
    );

    // Dr Loans Receivable / Cr Cash
    db.prepare(
      `INSERT INTO ledger_entries
       (transaction_id, group_id, account_id, member_id, debit_minor, credit_minor, memo, posted_at, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 'Loan principal disbursed', ?, ?)`
    ).run(txnId, groupId, loansAcc.id, loan.member_id, loan.principal_minor, now, now);

    db.prepare(
      `INSERT INTO ledger_entries
       (transaction_id, group_id, account_id, member_id, debit_minor, credit_minor, memo, posted_at, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 'Cash out to member', ?, ?)`
    ).run(txnId, groupId, cashAcc.id, loan.member_id, loan.principal_minor, now, now);

    // Post
    try {
      db.prepare(
        `UPDATE transactions SET state = 'posted', posted_at = ?, updated_at = ? WHERE id = ?`
      ).run(now, now, txnId);
    } catch (e) {
      throw new ApiError('BUSINESS_RULE', `Ledger rejected: ${e.message}`, 422);
    }

    db.prepare(
      `UPDATE loans
       SET status = 'active', disbursed_at = ?, disbursed_by = ?,
           disbursement_transaction_id = ?, updated_at = ?
       WHERE id = ?`
    ).run(now, user.id, txnId, now, id);

    db.prepare(
      `INSERT INTO audit_logs (id, group_id, user_id, action, resource_type, resource_id, after_json, severity, created_at)
       VALUES (?, ?, ?, 'loans.disburse', 'loans', ?, ?, 'info', ?)`
    ).run(
      generateId('aud'),
      groupId,
      user.id,
      id,
      JSON.stringify({ method, transaction_id: txnId, amount: loan.principal_minor }),
      now
    );

    return {
      loan_id: id,
      status: 'active',
      transaction_id: txnId,
      reference,
      next_due_date: loan.next_due_date,
    };
  });

  return [201, { ok: true, data: result }];
});

// ---------------- POST /loans/:id/repay ----------------
route('POST', '/loans/{id}/repay', async (ctx) => {
  const user = await requirePermission(ctx, 'loans.repay');
  const id = ctx.params.id;
  const b = ctx.body || {};

  if (!b.amount_minor || !b.payment_method) {
    throw new ApiError('VALIDATION_FAILED', 'amount_minor and payment_method are required.', 400);
  }
  if (!Number.isInteger(b.amount_minor) || b.amount_minor <= 0) {
    throw new ApiError('VALIDATION_FAILED', 'amount_minor must be positive integer.', 400);
  }

  const result = await withTx((db) => {
    const groupId = user.group_id;
    const now = nowISO();

    const loan = db
      .prepare(`SELECT * FROM loans WHERE id = ? AND group_id = ?`)
      .get(id, groupId);
    if (!loan) throw new ApiError('NOT_FOUND', 'Loan not found.', 404);
    if (!['active', 'disbursed'].includes(loan.status)) {
      throw new ApiError('BUSINESS_RULE', `Cannot repay a loan in status "${loan.status}".`, 422);
    }

    // Allocate across schedule (oldest first)
    const schedule = db
      .prepare(
        `SELECT * FROM loan_schedules
         WHERE loan_id = ? AND status IN ('pending','partial','overdue')
         ORDER BY installment_no`
      )
      .all(id);

    let remaining = b.amount_minor;
    let principalAlloc = 0;
    let interestAlloc = 0;
    const updates = [];

    for (const s of schedule) {
      if (remaining <= 0) break;
      const owed = s.total_due_minor - s.paid_minor;
      const apply = Math.min(remaining, owed);

      // Split apply into interest first, then principal
      const interestOwed = Math.max(0, s.interest_minor - Math.max(0, s.paid_minor - s.principal_minor));
      const iApply = Math.min(apply, interestOwed);
      const pApply = apply - iApply;

      principalAlloc += pApply;
      interestAlloc += iApply;

      const newPaid = s.paid_minor + apply;
      const newStatus = newPaid >= s.total_due_minor ? 'paid' : 'partial';

      updates.push({ id: s.id, paid: newPaid, status: newStatus });
      remaining -= apply;
    }

    if (remaining > 0) {
      throw new ApiError(
        'BUSINESS_RULE',
        `Repayment exceeds outstanding balance. Max allowed: ${b.amount_minor - remaining}.`,
        422
      );
    }

    // Apply schedule updates
    for (const u of updates) {
      db.prepare(
        `UPDATE loan_schedules
         SET paid_minor = ?, status = ?, paid_at = CASE WHEN ? = 'paid' THEN ? ELSE paid_at END,
             updated_at = ?
         WHERE id = ?`
      ).run(u.paid, u.status, u.status, now, now, u.id);
    }

    // Create ledger transaction
    const cashCode = b.payment_method === 'bank' ? '1010' : b.payment_method === 'mpesa' ? '1020' : '1000';
    const cashAcc = db.prepare(`SELECT id FROM accounts WHERE group_id = ? AND code = ?`).get(groupId, cashCode);
    const loansAcc = db.prepare(`SELECT id FROM accounts WHERE group_id = ? AND code = '1100'`).get(groupId);
    const interestAcc = db.prepare(`SELECT id FROM accounts WHERE group_id = ? AND code = '4100'`).get(groupId);

    const txnId = generateId('txn');
    const datePart = now.slice(0, 10).replace(/-/g, '');
    const reference = `TXN-${datePart}-${shortRand()}`;

    db.prepare(
      `INSERT INTO transactions
       (id, group_id, reference, description, transaction_type, state, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'loan_repayment', 'created', ?, ?, ?)`
    ).run(
      txnId,
      groupId,
      reference,
      `Loan repayment ${loan.reference} (${loan.currency} ${(b.amount_minor / 100).toFixed(2)})`,
      user.id,
      now,
      now
    );

    // Dr Cash
    db.prepare(
      `INSERT INTO ledger_entries (transaction_id, group_id, account_id, member_id, debit_minor, credit_minor, memo, posted_at, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 'Repayment received', ?, ?)`
    ).run(txnId, groupId, cashAcc.id, loan.member_id, b.amount_minor, now, now);

    // Cr Loans Receivable (principal portion)
    if (principalAlloc > 0) {
      db.prepare(
        `INSERT INTO ledger_entries (transaction_id, group_id, account_id, member_id, debit_minor, credit_minor, memo, posted_at, created_at)
         VALUES (?, ?, ?, ?, 0, ?, 'Principal reduction', ?, ?)`
      ).run(txnId, groupId, loansAcc.id, loan.member_id, principalAlloc, now, now);
    }

    // Cr Interest Income (interest portion)
    if (interestAlloc > 0) {
      db.prepare(
        `INSERT INTO ledger_entries (transaction_id, group_id, account_id, member_id, debit_minor, credit_minor, memo, posted_at, created_at)
         VALUES (?, ?, ?, ?, 0, ?, 'Interest earned', ?, ?)`
      ).run(txnId, groupId, interestAcc.id, loan.member_id, interestAlloc, now, now);
    }

    // Post
    try {
      db.prepare(
        `UPDATE transactions SET state = 'posted', posted_at = ?, updated_at = ? WHERE id = ?`
      ).run(now, now, txnId);
    } catch (e) {
      throw new ApiError('BUSINESS_RULE', `Ledger rejected: ${e.message}`, 422);
    }

    // Insert repayment record
    const repaymentId = generateId('lnr');
    const receipt = `RCT-LN-${datePart}-${shortRand()}`;
    db.prepare(
      `INSERT INTO loan_repayments
       (id, group_id, loan_id, amount_minor, principal_minor, interest_minor, penalty_minor,
        repaid_at, payment_method, payment_reference, transaction_id, receipt_number, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      repaymentId,
      groupId,
      id,
      b.amount_minor,
      principalAlloc,
      interestAlloc,
      now,
      b.payment_method,
      b.payment_reference || null,
      txnId,
      receipt,
      now,
      user.id
    );

    // Update loan cached balances + status
    const newPaid = loan.amount_paid_minor + b.amount_minor;
    const newOutstanding = Math.max(0, loan.outstanding_minor - b.amount_minor);
    const nextRow = db
      .prepare(
        `SELECT due_date FROM loan_schedules
         WHERE loan_id = ? AND status IN ('pending','partial','overdue')
         ORDER BY installment_no LIMIT 1`
      )
      .get(id);

    const newStatus = newOutstanding === 0 ? 'completed' : 'active';

    db.prepare(
      `UPDATE loans
       SET amount_paid_minor = ?, outstanding_minor = ?, next_due_date = ?,
           status = ?, updated_at = ?
       WHERE id = ?`
    ).run(newPaid, newOutstanding, nextRow?.due_date || null, newStatus, now, id);

    db.prepare(
      `INSERT INTO audit_logs (id, group_id, user_id, action, resource_type, resource_id, after_json, severity, created_at)
       VALUES (?, ?, ?, 'loans.repay', 'loans', ?, ?, 'info', ?)`
    ).run(
      generateId('aud'),
      groupId,
      user.id,
      id,
      JSON.stringify({ amount: b.amount_minor, principal: principalAlloc, interest: interestAlloc, txn: txnId }),
      now
    );

    return {
      repayment_id: repaymentId,
      transaction_id: txnId,
      reference,
      receipt_number: receipt,
      principal_minor: principalAlloc,
      interest_minor: interestAlloc,
      loan_outstanding_minor: newOutstanding,
      loan_status: newStatus,
    };
  });

  return [201, { ok: true, data: result }];
});
