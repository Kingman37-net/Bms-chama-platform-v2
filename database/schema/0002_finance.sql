-- ============================================================================
-- BODMAS CHAMAA — Finance Schema Migration
-- File:   database/schema/0002_finance.sql
-- Depends on: 0001_core.sql
-- Scope:  accounts, transactions, ledger_entries, contribution_plans,
--         contributions, income, expenses
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- 1. accounts — chart of accounts
-- ----------------------------------------------------------------------------
CREATE TABLE accounts (
    id           TEXT PRIMARY KEY,
    group_id     TEXT NOT NULL,
    code         TEXT NOT NULL,
    name         TEXT NOT NULL,
    type         TEXT NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
    parent_id    TEXT,
    is_system    INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)),
    is_active    INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    FOREIGN KEY (group_id)  REFERENCES groups(id)   ON DELETE RESTRICT,
    FOREIGN KEY (parent_id) REFERENCES accounts(id) ON DELETE RESTRICT,
    UNIQUE (group_id, code)
);
CREATE INDEX idx_accounts_group ON accounts (group_id, code);

-- ----------------------------------------------------------------------------
-- 2. transactions — journal headers
-- ----------------------------------------------------------------------------
CREATE TABLE transactions (
    id                 TEXT PRIMARY KEY,
    group_id           TEXT NOT NULL,
    reference          TEXT NOT NULL,
    description        TEXT NOT NULL,
    transaction_type   TEXT NOT NULL CHECK (transaction_type IN (
                          'contribution','loan_disbursement','loan_repayment',
                          'expense','income','transfer','investment',
                          'welfare_payout','fine','reversal','adjustment'
                       )),
    state              TEXT NOT NULL CHECK (state IN (
                          'created','validated','approved','posted','reconciled','reversed'
                       )),
    posted_at          TEXT,
    reverses           TEXT,
    reversed_by        TEXT,
    created_by         TEXT,
    approved_by        TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL,
    FOREIGN KEY (group_id)    REFERENCES groups(id)       ON DELETE RESTRICT,
    FOREIGN KEY (reverses)    REFERENCES transactions(id) ON DELETE RESTRICT,
    FOREIGN KEY (reversed_by) REFERENCES transactions(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by)  REFERENCES users(id)        ON DELETE SET NULL,
    FOREIGN KEY (approved_by) REFERENCES users(id)        ON DELETE SET NULL,
    UNIQUE (group_id, reference)
);
CREATE INDEX idx_transactions_group_date ON transactions (group_id, created_at DESC);
CREATE INDEX idx_transactions_state      ON transactions (group_id, state);
CREATE INDEX idx_transactions_type       ON transactions (group_id, transaction_type, created_at DESC);

-- ----------------------------------------------------------------------------
-- 3. ledger_entries — the double-entry lines
-- ----------------------------------------------------------------------------
CREATE TABLE ledger_entries (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT NOT NULL,
    group_id       TEXT NOT NULL,
    account_id     TEXT NOT NULL,
    member_id      TEXT,
    debit_minor    INTEGER NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
    credit_minor   INTEGER NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
    memo           TEXT,
    posted_at      TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE RESTRICT,
    FOREIGN KEY (group_id)       REFERENCES groups(id)       ON DELETE RESTRICT,
    FOREIGN KEY (account_id)     REFERENCES accounts(id)     ON DELETE RESTRICT,
    FOREIGN KEY (member_id)      REFERENCES members(id)      ON DELETE RESTRICT,
    CHECK (
        (debit_minor > 0 AND credit_minor = 0) OR
        (credit_minor > 0 AND debit_minor = 0)
    )
);
CREATE INDEX idx_ledger_account_posted ON ledger_entries (group_id, account_id, posted_at);
CREATE INDEX idx_ledger_member         ON ledger_entries (group_id, member_id, posted_at);
CREATE INDEX idx_ledger_transaction    ON ledger_entries (transaction_id);

-- ----------------------------------------------------------------------------
-- 4. contribution_plans
-- ----------------------------------------------------------------------------
CREATE TABLE contribution_plans (
    id              TEXT PRIMARY KEY,
    group_id        TEXT NOT NULL,
    name            TEXT NOT NULL,
    category        TEXT NOT NULL CHECK (category IN ('savings','investment','welfare','emergency','project')),
    frequency       TEXT NOT NULL CHECK (frequency IN ('weekly','monthly','quarterly','annual','one_off')),
    amount_minor    INTEGER NOT NULL CHECK (amount_minor > 0),
    currency        TEXT NOT NULL DEFAULT 'KES',
    due_day         INTEGER,
    grace_days      INTEGER NOT NULL DEFAULT 0 CHECK (grace_days >= 0),
    late_fee_minor  INTEGER NOT NULL DEFAULT 0 CHECK (late_fee_minor >= 0),
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE RESTRICT
);
CREATE INDEX idx_contribution_plans_group ON contribution_plans (group_id, is_active);

-- ----------------------------------------------------------------------------
-- 5. contributions
-- ----------------------------------------------------------------------------
CREATE TABLE contributions (
    id                 TEXT PRIMARY KEY,
    group_id           TEXT NOT NULL,
    member_id          TEXT NOT NULL,
    plan_id            TEXT,
    amount_minor       INTEGER NOT NULL CHECK (amount_minor > 0),
    currency           TEXT NOT NULL,
    contribution_date  TEXT NOT NULL,
    period_label       TEXT,
    status             TEXT NOT NULL CHECK (status IN ('pending','posted','reversed')),
    transaction_id     TEXT,
    payment_reference  TEXT,
    receipt_number     TEXT,
    notes              TEXT,
    created_at         TEXT NOT NULL,
    created_by         TEXT,
    updated_at         TEXT NOT NULL,
    FOREIGN KEY (group_id)       REFERENCES groups(id)            ON DELETE RESTRICT,
    FOREIGN KEY (member_id)      REFERENCES members(id)           ON DELETE RESTRICT,
    FOREIGN KEY (plan_id)        REFERENCES contribution_plans(id) ON DELETE SET NULL,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)      ON DELETE RESTRICT,
    FOREIGN KEY (created_by)     REFERENCES users(id)             ON DELETE SET NULL
);
CREATE INDEX idx_contributions_member_date ON contributions (group_id, member_id, contribution_date DESC);
CREATE INDEX idx_contributions_period      ON contributions (group_id, period_label, status);

-- ----------------------------------------------------------------------------
-- 6. income
-- ----------------------------------------------------------------------------
CREATE TABLE income (
    id             TEXT PRIMARY KEY,
    group_id       TEXT NOT NULL,
    category       TEXT NOT NULL,
    description    TEXT NOT NULL,
    amount_minor   INTEGER NOT NULL CHECK (amount_minor > 0),
    currency       TEXT NOT NULL,
    received_at    TEXT NOT NULL,
    status         TEXT NOT NULL CHECK (status IN ('pending','posted','reversed')),
    transaction_id TEXT,
    received_by    TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    FOREIGN KEY (group_id)       REFERENCES groups(id)       ON DELETE RESTRICT,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE RESTRICT,
    FOREIGN KEY (received_by)    REFERENCES users(id)        ON DELETE SET NULL
);
CREATE INDEX idx_income_group_date ON income (group_id, received_at DESC);
CREATE INDEX idx_income_status     ON income (group_id, status);

-- ----------------------------------------------------------------------------
-- 7. expenses
-- ----------------------------------------------------------------------------
CREATE TABLE expenses (
    id              TEXT PRIMARY KEY,
    group_id        TEXT NOT NULL,
    category        TEXT NOT NULL,
    description     TEXT NOT NULL,
    payee           TEXT,
    amount_minor    INTEGER NOT NULL CHECK (amount_minor > 0),
    currency        TEXT NOT NULL,
    payment_method  TEXT CHECK (payment_method IN ('cash','bank','mpesa','cheque','other')),
    paid_at         TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('pending','approved','posted','reversed','rejected')),
    approved_by     TEXT,
    approved_at     TEXT,
    transaction_id  TEXT,
    receipt_url     TEXT,
    reference       TEXT,
    notes           TEXT,
    created_at      TEXT NOT NULL,
    created_by      TEXT,
    updated_at      TEXT NOT NULL,
    FOREIGN KEY (group_id)       REFERENCES groups(id)       ON DELETE RESTRICT,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE RESTRICT,
    FOREIGN KEY (approved_by)    REFERENCES users(id)        ON DELETE SET NULL,
    FOREIGN KEY (created_by)     REFERENCES users(id)        ON DELETE SET NULL
);
CREATE INDEX idx_expenses_group_date ON expenses (group_id, paid_at DESC);
CREATE INDEX idx_expenses_status     ON expenses (group_id, status);

-- ============================================================================
-- LEDGER PROTECTION TRIGGERS
-- ============================================================================

-- 1. Prevent ledger entries from being INSERTED into a posted transaction.
--    Entries may only be added while the transaction is in 'created',
--    'validated' or 'approved' state.
CREATE TRIGGER trg_ledger_block_insert_on_posted
BEFORE INSERT ON ledger_entries FOR EACH ROW
WHEN (SELECT state FROM transactions WHERE id = NEW.transaction_id)
     IN ('posted','reconciled','reversed')
BEGIN
    SELECT RAISE(ABORT, 'Cannot insert ledger entry into a posted transaction');
END;

-- 2. Prevent UPDATE of ledger entries that belong to a posted transaction.
CREATE TRIGGER trg_ledger_block_update_on_posted
BEFORE UPDATE ON ledger_entries FOR EACH ROW
WHEN (SELECT state FROM transactions WHERE id = OLD.transaction_id)
     IN ('posted','reconciled','reversed')
BEGIN
    SELECT RAISE(ABORT, 'Cannot update ledger entry of a posted transaction');
END;

-- 3. Prevent DELETE of ledger entries that belong to a posted transaction.
CREATE TRIGGER trg_ledger_block_delete_on_posted
BEFORE DELETE ON ledger_entries FOR EACH ROW
WHEN (SELECT state FROM transactions WHERE id = OLD.transaction_id)
     IN ('posted','reconciled','reversed')
BEGIN
    SELECT RAISE(ABORT, 'Cannot delete ledger entry of a posted transaction');
END;

-- 4. Verify the double-entry invariant at the moment a transaction becomes
--    'posted'. Every transaction must have SUM(debits) = SUM(credits) > 0
--    and at least two ledger entries.
CREATE TRIGGER trg_transactions_enforce_balanced_on_post
BEFORE UPDATE ON transactions FOR EACH ROW
WHEN NEW.state = 'posted' AND OLD.state <> 'posted'
BEGIN
    SELECT CASE
        WHEN (SELECT COUNT(*) FROM ledger_entries WHERE transaction_id = NEW.id) < 2
        THEN RAISE(ABORT, 'Transaction must have at least 2 ledger entries')
    END;

    SELECT CASE
        WHEN (SELECT IFNULL(SUM(debit_minor), 0) FROM ledger_entries WHERE transaction_id = NEW.id)
           <> (SELECT IFNULL(SUM(credit_minor), 0) FROM ledger_entries WHERE transaction_id = NEW.id)
        THEN RAISE(ABORT, 'Transaction is unbalanced: SUM(debits) <> SUM(credits)')
    END;

    SELECT CASE
        WHEN (SELECT IFNULL(SUM(debit_minor), 0) FROM ledger_entries WHERE transaction_id = NEW.id) = 0
        THEN RAISE(ABORT, 'Transaction has zero value')
    END;
END;

-- 5. Prevent re-posting / unposting of a transaction once posted.
CREATE TRIGGER trg_transactions_block_state_regression
BEFORE UPDATE ON transactions FOR EACH ROW
WHEN OLD.state IN ('posted','reconciled','reversed')
     AND NEW.state NOT IN ('posted','reconciled','reversed')
BEGIN
    SELECT RAISE(ABORT, 'Posted transactions cannot be un-posted; use a reversal');
END;

-- 6. Prevent DELETE of posted transactions.
CREATE TRIGGER trg_transactions_block_delete_posted
BEFORE DELETE ON transactions FOR EACH ROW
WHEN OLD.state IN ('posted','reconciled','reversed')
BEGIN
    SELECT RAISE(ABORT, 'Posted transactions cannot be deleted; use a reversal');
END;

-- ============================================================================
-- Auto-update triggers
-- ============================================================================

CREATE TRIGGER trg_accounts_updated_at
AFTER UPDATE ON accounts FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE accounts SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_transactions_updated_at
AFTER UPDATE ON transactions FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE transactions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_contribution_plans_updated_at
AFTER UPDATE ON contribution_plans FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE contribution_plans SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_contributions_updated_at
AFTER UPDATE ON contributions FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE contributions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_income_updated_at
AFTER UPDATE ON income FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE income SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_expenses_updated_at
AFTER UPDATE ON expenses FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE expenses SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

-- ============================================================================
-- End of 0002_finance.sql
-- ============================================================================
