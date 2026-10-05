-- ============================================================================
-- BODMAS CHAMAA — Loans Schema Migration
-- File:   database/schema/0003_loans.sql
-- Depends on: 0001_core.sql, 0002_finance.sql
-- Scope:  loan_products, loans, loan_schedules, loan_repayments, loan_guarantors
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- 1. loan_products
-- ----------------------------------------------------------------------------
CREATE TABLE loan_products (
    id                  TEXT PRIMARY KEY,
    group_id            TEXT NOT NULL,
    name                TEXT NOT NULL,
    description         TEXT,
    min_amount_minor    INTEGER NOT NULL CHECK (min_amount_minor > 0),
    max_amount_minor    INTEGER NOT NULL CHECK (max_amount_minor >= min_amount_minor),
    interest_rate_bps   INTEGER NOT NULL CHECK (interest_rate_bps >= 0),
    interest_method     TEXT NOT NULL CHECK (interest_method IN ('flat','reducing_balance')),
    term_months         INTEGER NOT NULL CHECK (term_months > 0),
    grace_period_days   INTEGER NOT NULL DEFAULT 0 CHECK (grace_period_days >= 0),
    late_fee_bps        INTEGER NOT NULL DEFAULT 0 CHECK (late_fee_bps >= 0),
    requires_guarantors INTEGER NOT NULL DEFAULT 1 CHECK (requires_guarantors IN (0,1)),
    min_guarantors      INTEGER NOT NULL DEFAULT 2 CHECK (min_guarantors >= 0),
    eligibility_months  INTEGER NOT NULL DEFAULT 6 CHECK (eligibility_months >= 0),
    is_active           INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE RESTRICT
);
CREATE INDEX idx_loan_products_group ON loan_products (group_id, is_active);

-- ----------------------------------------------------------------------------
-- 2. loans
-- ----------------------------------------------------------------------------
CREATE TABLE loans (
    id                            TEXT PRIMARY KEY,
    group_id                      TEXT NOT NULL,
    member_id                     TEXT NOT NULL,
    product_id                    TEXT NOT NULL,
    reference                     TEXT NOT NULL,
    principal_minor               INTEGER NOT NULL CHECK (principal_minor > 0),
    interest_rate_bps             INTEGER NOT NULL CHECK (interest_rate_bps >= 0),
    interest_method               TEXT NOT NULL CHECK (interest_method IN ('flat','reducing_balance')),
    term_months                   INTEGER NOT NULL CHECK (term_months > 0),
    total_payable_minor           INTEGER NOT NULL CHECK (total_payable_minor >= principal_minor),
    amount_paid_minor             INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid_minor >= 0),
    outstanding_minor             INTEGER NOT NULL CHECK (outstanding_minor >= 0),
    currency                      TEXT NOT NULL,
    status                        TEXT NOT NULL CHECK (status IN (
                                      'draft','submitted','under_review','approved','rejected',
                                      'disbursed','active','completed','defaulted','written_off','cancelled'
                                   )),
    application_date              TEXT NOT NULL,
    approved_at                   TEXT,
    approved_by                   TEXT,
    disbursed_at                  TEXT,
    disbursed_by                  TEXT,
    disbursement_transaction_id   TEXT,
    next_due_date                 TEXT,
    notes                         TEXT,
    created_at                    TEXT NOT NULL,
    created_by                    TEXT,
    updated_at                    TEXT NOT NULL,
    FOREIGN KEY (group_id)      REFERENCES groups(id)       ON DELETE RESTRICT,
    FOREIGN KEY (member_id)     REFERENCES members(id)      ON DELETE RESTRICT,
    FOREIGN KEY (product_id)    REFERENCES loan_products(id) ON DELETE RESTRICT,
    FOREIGN KEY (approved_by)   REFERENCES users(id)        ON DELETE SET NULL,
    FOREIGN KEY (disbursed_by)  REFERENCES users(id)        ON DELETE SET NULL,
    FOREIGN KEY (disbursement_transaction_id) REFERENCES transactions(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by)    REFERENCES users(id)        ON DELETE SET NULL,
    UNIQUE (group_id, reference)
);
CREATE INDEX idx_loans_member ON loans (member_id, status, application_date DESC);
CREATE INDEX idx_loans_status ON loans (group_id, status);
CREATE INDEX idx_loans_next_due ON loans (group_id, next_due_date) WHERE next_due_date IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. loan_schedules
-- ----------------------------------------------------------------------------
CREATE TABLE loan_schedules (
    id                TEXT PRIMARY KEY,
    loan_id           TEXT NOT NULL,
    installment_no    INTEGER NOT NULL CHECK (installment_no > 0),
    due_date          TEXT NOT NULL,
    principal_minor   INTEGER NOT NULL CHECK (principal_minor >= 0),
    interest_minor    INTEGER NOT NULL CHECK (interest_minor >= 0),
    total_due_minor   INTEGER NOT NULL CHECK (total_due_minor = principal_minor + interest_minor),
    paid_minor        INTEGER NOT NULL DEFAULT 0 CHECK (paid_minor >= 0),
    paid_at           TEXT,
    status            TEXT NOT NULL CHECK (status IN ('pending','partial','paid','overdue','waived')),
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
    UNIQUE (loan_id, installment_no)
);
CREATE INDEX idx_schedules_loan ON loan_schedules (loan_id, due_date);
CREATE INDEX idx_schedules_due  ON loan_schedules (status, due_date);

-- ----------------------------------------------------------------------------
-- 4. loan_repayments
-- ----------------------------------------------------------------------------
CREATE TABLE loan_repayments (
    id                 TEXT PRIMARY KEY,
    group_id           TEXT NOT NULL,
    loan_id            TEXT NOT NULL,
    amount_minor       INTEGER NOT NULL CHECK (amount_minor > 0),
    principal_minor    INTEGER NOT NULL CHECK (principal_minor >= 0),
    interest_minor     INTEGER NOT NULL CHECK (interest_minor >= 0),
    penalty_minor      INTEGER NOT NULL DEFAULT 0 CHECK (penalty_minor >= 0),
    repaid_at          TEXT NOT NULL,
    payment_method     TEXT NOT NULL CHECK (payment_method IN ('cash','bank','mpesa','cheque','other')),
    payment_reference  TEXT,
    transaction_id     TEXT,
    receipt_number     TEXT,
    notes              TEXT,
    created_at         TEXT NOT NULL,
    created_by         TEXT,
    FOREIGN KEY (group_id)       REFERENCES groups(id)       ON DELETE RESTRICT,
    FOREIGN KEY (loan_id)        REFERENCES loans(id)        ON DELETE RESTRICT,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by)     REFERENCES users(id)        ON DELETE SET NULL,
    CHECK (amount_minor = principal_minor + interest_minor + penalty_minor)
);
CREATE INDEX idx_repayments_loan_date ON loan_repayments (loan_id, repaid_at DESC);
CREATE INDEX idx_repayments_group_date ON loan_repayments (group_id, repaid_at DESC);

-- ----------------------------------------------------------------------------
-- 5. loan_guarantors
-- ----------------------------------------------------------------------------
CREATE TABLE loan_guarantors (
    id                 TEXT PRIMARY KEY,
    loan_id            TEXT NOT NULL,
    member_id          TEXT NOT NULL,
    guaranteed_minor   INTEGER NOT NULL CHECK (guaranteed_minor > 0),
    status             TEXT NOT NULL CHECK (status IN ('active','released','called')),
    created_at         TEXT NOT NULL,
    released_at        TEXT,
    FOREIGN KEY (loan_id)   REFERENCES loans(id)   ON DELETE RESTRICT,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT,
    UNIQUE (loan_id, member_id)
);
CREATE INDEX idx_guarantors_member ON loan_guarantors (member_id, status);
CREATE INDEX idx_guarantors_loan   ON loan_guarantors (loan_id, status);

-- ============================================================================
-- Auto-update triggers
-- ============================================================================

CREATE TRIGGER trg_loan_products_updated_at
AFTER UPDATE ON loan_products FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE loan_products SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_loans_updated_at
AFTER UPDATE ON loans FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE loans SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_loan_schedules_updated_at
AFTER UPDATE ON loan_schedules FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE loan_schedules SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

-- ============================================================================
-- End of 0003_loans.sql
-- ============================================================================
