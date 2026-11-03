-- ============================================================================
-- BODMAS CHAMAA — System Schema Migration
-- File:   database/schema/0006_system.sql
-- Depends on: 0001_core.sql
-- Scope:  documents, notifications, audit_logs, security_events
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- 1. documents
-- ----------------------------------------------------------------------------
CREATE TABLE documents (
    id               TEXT PRIMARY KEY,
    group_id         TEXT NOT NULL,
    name             TEXT NOT NULL,
    category         TEXT NOT NULL CHECK (category IN (
                        'constitution','registration','minutes','policy','report',
                        'statement','agreement','receipt','investment','project','member'
                     )),
    file_url         TEXT NOT NULL,
    file_size_bytes  INTEGER CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
    mime_type        TEXT,
    visibility       TEXT NOT NULL CHECK (visibility IN ('public','members','officials','admins')),
    uploaded_by      TEXT,
    version          INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    status           TEXT NOT NULL CHECK (status IN ('active','archived','deleted')),
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    FOREIGN KEY (group_id)    REFERENCES groups(id) ON DELETE RESTRICT,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)  ON DELETE SET NULL
);
CREATE INDEX idx_documents_group_cat ON documents (group_id, category, status);
CREATE INDEX idx_documents_visibility ON documents (group_id, visibility);

-- ----------------------------------------------------------------------------
-- 2. notifications
-- ----------------------------------------------------------------------------
CREATE TABLE notifications (
    id                  TEXT PRIMARY KEY,
    group_id            TEXT NOT NULL,
    recipient_user_id   TEXT,
    recipient_member_id TEXT,
    channel             TEXT NOT NULL CHECK (channel IN ('in_app','email','sms')),
    category            TEXT NOT NULL,
    title               TEXT NOT NULL,
    body                TEXT NOT NULL,
    payload_json        TEXT,
    status              TEXT NOT NULL CHECK (status IN ('pending','sent','failed','read')),
    sent_at             TEXT,
    read_at             TEXT,
    created_at          TEXT NOT NULL,
    FOREIGN KEY (group_id)            REFERENCES groups(id)  ON DELETE RESTRICT,
    FOREIGN KEY (recipient_user_id)   REFERENCES users(id)   ON DELETE CASCADE,
    FOREIGN KEY (recipient_member_id) REFERENCES members(id) ON DELETE CASCADE,
    CHECK (recipient_user_id IS NOT NULL OR recipient_member_id IS NOT NULL)
);
CREATE INDEX idx_notifications_recipient ON notifications (recipient_user_id, status, created_at DESC);
CREATE INDEX idx_notifications_member    ON notifications (recipient_member_id, status, created_at DESC);
CREATE INDEX idx_notifications_status    ON notifications (group_id, status);

-- ----------------------------------------------------------------------------
-- 3. audit_logs — immutable, append-only
-- ----------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id             TEXT PRIMARY KEY,
    group_id       TEXT,
    user_id        TEXT,
    action         TEXT NOT NULL,
    resource_type  TEXT NOT NULL,
    resource_id    TEXT,
    before_json    TEXT,
    after_json     TEXT,
    ip_address     TEXT,
    user_agent     TEXT,
    request_id     TEXT,
    severity       TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
    created_at     TEXT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE SET NULL
);
CREATE INDEX idx_audit_user_date  ON audit_logs (user_id, created_at DESC);
CREATE INDEX idx_audit_resource   ON audit_logs (resource_type, resource_id);
CREATE INDEX idx_audit_action     ON audit_logs (action, created_at DESC);
CREATE INDEX idx_audit_group_date ON audit_logs (group_id, created_at DESC);

-- Prevent UPDATE on audit_logs
CREATE TRIGGER trg_audit_block_update
BEFORE UPDATE ON audit_logs FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'audit_logs is append-only: UPDATE not permitted');
END;

-- Prevent DELETE on audit_logs
CREATE TRIGGER trg_audit_block_delete
BEFORE DELETE ON audit_logs FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'audit_logs is append-only: DELETE not permitted');
END;

-- ----------------------------------------------------------------------------
-- 4. security_events
-- ----------------------------------------------------------------------------
CREATE TABLE security_events (
    id               TEXT PRIMARY KEY,
    user_id          TEXT,
    event_type       TEXT NOT NULL CHECK (event_type IN (
                        'login.success','login.failed','logout',
                        'password.change','password.reset',
                        'mfa.enable','mfa.disable',
                        'session.revoke','permission.change','account.lock'
                     )),
    email_attempted  TEXT,
    ip_address       TEXT,
    user_agent       TEXT,
    details_json     TEXT,
    created_at       TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_security_event_type_date ON security_events (event_type, created_at DESC);
CREATE INDEX idx_security_event_user      ON security_events (user_id, created_at DESC);

-- Prevent UPDATE on security_events
CREATE TRIGGER trg_security_block_update
BEFORE UPDATE ON security_events FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'security_events is append-only: UPDATE not permitted');
END;

-- Prevent DELETE on security_events
CREATE TRIGGER trg_security_block_delete
BEFORE DELETE ON security_events FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'security_events is append-only: DELETE not permitted');
END;

-- ============================================================================
-- Auto-update triggers
-- ============================================================================

CREATE TRIGGER trg_documents_updated_at
AFTER UPDATE ON documents FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE documents SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

-- ============================================================================
-- End of 0006_system.sql
-- ============================================================================
