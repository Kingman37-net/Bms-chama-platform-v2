-- ============================================================================
-- BODMAS CHAMAA — Payments Schema Migration
-- File:   database/schema/0007_payments.sql
-- Depends on: 0001_core.sql, 0002_finance.sql
-- Scope:  payment_accounts, payment_transactions, reconciliation_records
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- 1. payment_accounts
-- ----------------------------------------------------------------------------
CREATE TABLE payment_accounts (
    id              TEXT PRIMARY KEY,
    group_id        TEXT NOT NULL,
    provider        TEXT NOT NULL CHECK (provider IN ('mpesa','bank','cash','manual')),
    display_name    TEXT NOT NULL,
    account_number  TEXT,
    account_name    TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    metadata_json   TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE RESTRICT
);
CREATE INDEX idx_payment_accounts_group ON payment_accounts (group_id, is_active);

-- ----------------------------------------------------------------------------
-- 2. payment_transactions — raw provider events before matching
-- ----------------------------------------------------------------------------
CREATE TABLE payment_transactions (
    id                     TEXT PRIMARY KEY,
    group_id               TEXT NOT NULL,
    provider               TEXT NOT NULL,
    provider_ref           TEXT NOT NULL,
    amount_minor           INTEGER NOT NULL CHECK (amount_minor > 0),
    currency               TEXT NOT NULL,
    payer_phone            TEXT,
    payer_name             TEXT,
    paid_at                TEXT NOT NULL,
    raw_payload_json       TEXT,
    matched_member_id      TEXT,
    matched_transaction_id TEXT,
    status                 TEXT NOT NULL CHECK (status IN (
                              'received','matched','unmatched','duplicate','rejected'
                           )),
    created_at             TEXT NOT NULL,
    FOREIGN KEY (group_id)               REFERENCES groups(id)       ON DELETE RESTRICT,
    FOREIGN KEY (matched_member_id)      REFERENCES members(id)      ON DELETE SET NULL,
    FOREIGN KEY (matched_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
    UNIQUE (provider, provider_ref)
);
CREATE INDEX idx_payment_txn_status   ON payment_transactions (group_id, status);
CREATE INDEX idx_payment_txn_member   ON payment_transactions (matched_member_id);
CREATE INDEX idx_payment_txn_date     ON payment_transactions (group_id, paid_at DESC);

-- ----------------------------------------------------------------------------
-- 3. reconciliation_records
-- ----------------------------------------------------------------------------
CREATE TABLE reconciliation_records (
    id                TEXT PRIMARY KEY,
    group_id          TEXT NOT NULL,
    period_start      TEXT NOT NULL,
    period_end        TEXT NOT NULL,
    account_id        TEXT,
    opening_minor     INTEGER NOT NULL,
    closing_minor     INTEGER NOT NULL,
    expected_minor    INTEGER NOT NULL,
    difference_minor  INTEGER NOT NULL,
    status            TEXT NOT NULL CHECK (status IN ('in_progress','balanced','discrepancy','resolved')),
    notes             TEXT,
    reconciled_by     TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    FOREIGN KEY (group_id)      REFERENCES groups(id)    ON DELETE RESTRICT,
    FOREIGN KEY (account_id)    REFERENCES accounts(id)  ON DELETE SET NULL,
    FOREIGN KEY (reconciled_by) REFERENCES users(id)     ON DELETE SET NULL
);
CREATE INDEX idx_recon_group_period ON reconciliation_records (group_id, period_start, period_end);
CREATE INDEX idx_recon_status       ON reconciliation_records (group_id, status);

-- ============================================================================
-- Auto-update triggers
-- ============================================================================

CREATE TRIGGER trg_payment_accounts_updated_at
AFTER UPDATE ON payment_accounts FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE payment_accounts SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_reconciliation_updated_at
AFTER UPDATE ON reconciliation_records FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE reconciliation_records SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

-- ============================================================================
-- End of 0007_payments.sql
-- ============================================================================
