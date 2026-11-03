-- ============================================================================
-- BODMAS CHAMAA — Governance Schema Migration
-- File:   database/schema/0005_governance.sql
-- Depends on: 0001_core.sql
-- Scope:  meetings, attendance, minutes, resolutions, votes
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- 1. meetings
-- ----------------------------------------------------------------------------
CREATE TABLE meetings (
    id            TEXT PRIMARY KEY,
    group_id      TEXT NOT NULL,
    title         TEXT NOT NULL,
    meeting_type  TEXT NOT NULL CHECK (meeting_type IN ('ordinary','agm','egm','committee','emergency')),
    scheduled_at  TEXT NOT NULL,
    location      TEXT,
    agenda        TEXT,
    status        TEXT NOT NULL CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
    is_public     INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0,1)),
    created_at    TEXT NOT NULL,
    created_by    TEXT,
    updated_at    TEXT NOT NULL,
    FOREIGN KEY (group_id)   REFERENCES groups(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id)  ON DELETE SET NULL
);
CREATE INDEX idx_meetings_group_date ON meetings (group_id, scheduled_at DESC);
CREATE INDEX idx_meetings_status     ON meetings (group_id, status);

-- ----------------------------------------------------------------------------
-- 2. attendance
-- ----------------------------------------------------------------------------
CREATE TABLE attendance (
    id              TEXT PRIMARY KEY,
    meeting_id      TEXT NOT NULL,
    member_id       TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('present','absent','apology','late')),
    checked_in_at   TEXT,
    notes           TEXT,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id)  REFERENCES members(id)  ON DELETE RESTRICT,
    UNIQUE (meeting_id, member_id)
);
CREATE INDEX idx_attendance_meeting ON attendance (meeting_id);
CREATE INDEX idx_attendance_member  ON attendance (member_id, status);

-- ----------------------------------------------------------------------------
-- 3. minutes
-- ----------------------------------------------------------------------------
CREATE TABLE minutes (
    id            TEXT PRIMARY KEY,
    meeting_id    TEXT NOT NULL UNIQUE,
    content       TEXT NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('draft','approved','published')),
    approved_at   TEXT,
    approved_by   TEXT,
    document_url  TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    FOREIGN KEY (meeting_id)  REFERENCES meetings(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id)    ON DELETE SET NULL
);

-- ----------------------------------------------------------------------------
-- 4. resolutions
-- ----------------------------------------------------------------------------
CREATE TABLE resolutions (
    id             TEXT PRIMARY KEY,
    group_id       TEXT NOT NULL,
    meeting_id     TEXT,
    title          TEXT NOT NULL,
    description    TEXT NOT NULL,
    status         TEXT NOT NULL CHECK (status IN ('proposed','voting','passed','rejected','withdrawn')),
    votes_for      INTEGER NOT NULL DEFAULT 0 CHECK (votes_for >= 0),
    votes_against  INTEGER NOT NULL DEFAULT 0 CHECK (votes_against >= 0),
    votes_abstain  INTEGER NOT NULL DEFAULT 0 CHECK (votes_abstain >= 0),
    passed_at      TEXT,
    is_public      INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0,1)),
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    FOREIGN KEY (group_id)   REFERENCES groups(id)   ON DELETE RESTRICT,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE SET NULL
);
CREATE INDEX idx_resolutions_group ON resolutions (group_id, status);

-- ----------------------------------------------------------------------------
-- 5. votes
-- ----------------------------------------------------------------------------
CREATE TABLE votes (
    id             TEXT PRIMARY KEY,
    resolution_id  TEXT NOT NULL,
    member_id      TEXT NOT NULL,
    choice         TEXT NOT NULL CHECK (choice IN ('for','against','abstain')),
    cast_at        TEXT NOT NULL,
    FOREIGN KEY (resolution_id) REFERENCES resolutions(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id)     REFERENCES members(id)     ON DELETE RESTRICT,
    UNIQUE (resolution_id, member_id)
);
CREATE INDEX idx_votes_resolution ON votes (resolution_id);
CREATE INDEX idx_votes_member     ON votes (member_id);

-- ============================================================================
-- Auto-update triggers
-- ============================================================================

CREATE TRIGGER trg_meetings_updated_at
AFTER UPDATE ON meetings FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE meetings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_minutes_updated_at
AFTER UPDATE ON minutes FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE minutes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_resolutions_updated_at
AFTER UPDATE ON resolutions FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE resolutions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

-- ============================================================================
-- End of 0005_governance.sql
-- ============================================================================
