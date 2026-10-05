-- ============================================================================
-- BODMAS CHAMAA — Investments Schema Migration
-- File:   database/schema/0004_investments.sql
-- Depends on: 0001_core.sql, 0002_finance.sql
-- Scope:  investments, investment_assets, investment_transactions
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- 1. investments
-- ----------------------------------------------------------------------------
CREATE TABLE investments (
    id                      TEXT PRIMARY KEY,
    group_id                TEXT NOT NULL,
    name                    TEXT NOT NULL,
    category                TEXT NOT NULL CHECK (category IN (
                                'land','property','shares','bonds','business',
                                'money_market','project','other'
                            )),
    description             TEXT,
    initial_capital_minor   INTEGER NOT NULL CHECK (initial_capital_minor >= 0),
    current_value_minor     INTEGER NOT NULL CHECK (current_value_minor >= 0),
    currency                TEXT NOT NULL,
    status                  TEXT NOT NULL CHECK (status IN (
                                'proposed','active','completed','exited','written_off'
                            )),
    started_on              TEXT,
    closed_on               TEXT,
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL,
    created_by              TEXT,
    FOREIGN KEY (group_id)   REFERENCES groups(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id)  ON DELETE SET NULL
);
CREATE INDEX idx_investments_group  ON investments (group_id, status);
CREATE INDEX idx_investments_category ON investments (group_id, category);

-- ----------------------------------------------------------------------------
-- 2. investment_assets
-- ----------------------------------------------------------------------------
CREATE TABLE investment_assets (
    id                  TEXT PRIMARY KEY,
    investment_id       TEXT NOT NULL,
    name                TEXT NOT NULL,
    asset_type          TEXT NOT NULL,
    purchase_date       TEXT,
    purchase_price_minor INTEGER CHECK (purchase_price_minor IS NULL OR purchase_price_minor >= 0),
    current_value_minor INTEGER CHECK (current_value_minor IS NULL OR current_value_minor >= 0),
    location            TEXT,
    title_deed_ref      TEXT,
    notes               TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE
);
CREATE INDEX idx_investment_assets_inv ON investment_assets (investment_id);

-- ----------------------------------------------------------------------------
-- 3. investment_transactions
-- ----------------------------------------------------------------------------
CREATE TABLE investment_transactions (
    id             TEXT PRIMARY KEY,
    group_id       TEXT NOT NULL,
    investment_id  TEXT NOT NULL,
    txn_type       TEXT NOT NULL CHECK (txn_type IN (
                       'capital_in','capital_out','income','expense','revaluation'
                   )),
    amount_minor   INTEGER NOT NULL CHECK (amount_minor > 0),
    occurred_at    TEXT NOT NULL,
    transaction_id TEXT,
    notes          TEXT,
    created_at     TEXT NOT NULL,
    created_by     TEXT,
    FOREIGN KEY (group_id)       REFERENCES groups(id)       ON DELETE RESTRICT,
    FOREIGN KEY (investment_id)  REFERENCES investments(id)  ON DELETE RESTRICT,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by)     REFERENCES users(id)        ON DELETE SET NULL
);
CREATE INDEX idx_inv_txn_investment ON investment_transactions (investment_id, occurred_at DESC);
CREATE INDEX idx_inv_txn_group_date ON investment_transactions (group_id, occurred_at DESC);

-- ============================================================================
-- Auto-update triggers
-- ============================================================================

CREATE TRIGGER trg_investments_updated_at
AFTER UPDATE ON investments FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE investments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_investment_assets_updated_at
AFTER UPDATE ON investment_assets FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE investment_assets SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

-- ============================================================================
-- End of 0004_investments.sql
-- ============================================================================
