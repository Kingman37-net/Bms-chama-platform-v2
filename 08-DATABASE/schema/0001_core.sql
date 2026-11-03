-- ============================================================================
-- BODMAS CHAMAA — Core Schema Migration
-- File:   database/schema/0001_core.sql
-- Target: SQLite (Cloudflare D1 compatible)
-- Scope:  groups, users, members, memberships, roles, permissions, sessions
-- ============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- ----------------------------------------------------------------------------
-- 1. groups — tenant root
-- ----------------------------------------------------------------------------
CREATE TABLE groups (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    slug             TEXT NOT NULL UNIQUE,
    currency         TEXT NOT NULL DEFAULT 'KES',
    country          TEXT NOT NULL DEFAULT 'KE',
    timezone         TEXT NOT NULL DEFAULT 'Africa/Nairobi',
    registration_no  TEXT,
    contact_email    TEXT,
    contact_phone    TEXT,
    logo_url         TEXT,
    is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
);
CREATE INDEX idx_groups_slug ON groups (slug);

-- ----------------------------------------------------------------------------
-- 2. users — authentication identities
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id                   TEXT PRIMARY KEY,
    group_id             TEXT NOT NULL,
    email                TEXT NOT NULL UNIQUE,
    phone                TEXT UNIQUE,
    password_hash        TEXT NOT NULL,
    display_name         TEXT NOT NULL,
    is_active            INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    is_locked            INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0,1)),
    failed_login_count   INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
    last_login_at        TEXT,
    password_changed_at  TEXT,
    mfa_secret           TEXT,
    mfa_enabled          INTEGER NOT NULL DEFAULT 0 CHECK (mfa_enabled IN (0,1)),
    email_verified_at    TEXT,
    deleted_at           TEXT,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE RESTRICT
);
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_group ON users (group_id, is_active);

-- ----------------------------------------------------------------------------
-- 3. members — natural persons (may or may not have a user login)
-- ----------------------------------------------------------------------------
CREATE TABLE members (
    id                      TEXT PRIMARY KEY,
    group_id                TEXT NOT NULL,
    full_name               TEXT NOT NULL,
    id_number               TEXT,
    date_of_birth           TEXT,
    gender                  TEXT CHECK (gender IN ('male','female','other','undisclosed')),
    phone                   TEXT,
    email                   TEXT,
    address                 TEXT,
    emergency_contact_name  TEXT,
    emergency_contact_phone TEXT,
    photo_url               TEXT,
    joined_on               TEXT,
    status                  TEXT NOT NULL CHECK (status IN ('active','suspended','exited','deceased')),
    notes                   TEXT,
    deleted_at              TEXT,
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL,
    created_by              TEXT,
    updated_by              TEXT,
    FOREIGN KEY (group_id)   REFERENCES groups(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id)  ON DELETE SET NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id)  ON DELETE SET NULL
);
CREATE INDEX idx_members_group_status ON members (group_id, status);
CREATE INDEX idx_members_name         ON members (full_name);
CREATE INDEX idx_members_id_number    ON members (group_id, id_number);

-- ----------------------------------------------------------------------------
-- 4. memberships — a member enrolled in a group
-- ----------------------------------------------------------------------------
CREATE TABLE memberships (
    id             TEXT PRIMARY KEY,
    group_id       TEXT NOT NULL,
    member_id      TEXT NOT NULL,
    user_id        TEXT,
    member_number  TEXT NOT NULL,
    status         TEXT NOT NULL CHECK (status IN ('pending','active','suspended','exited')),
    approved_by    TEXT,
    approved_at    TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    FOREIGN KEY (group_id)  REFERENCES groups(id)  ON DELETE RESTRICT,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT,
    FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE SET NULL,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (group_id, member_number),
    UNIQUE (group_id, member_id)
);
CREATE INDEX idx_memberships_user   ON memberships (user_id);
CREATE INDEX idx_memberships_status ON memberships (group_id, status);

-- ----------------------------------------------------------------------------
-- 5. permissions — global catalogue (not group-scoped)
-- ----------------------------------------------------------------------------
CREATE TABLE permissions (
    code         TEXT PRIMARY KEY,
    resource     TEXT NOT NULL,
    action       TEXT NOT NULL,
    description  TEXT,
    created_at   TEXT NOT NULL
);
CREATE INDEX idx_permissions_resource ON permissions (resource, action);

-- ----------------------------------------------------------------------------
-- 6. roles — named role bundles, per group
-- ----------------------------------------------------------------------------
CREATE TABLE roles (
    id           TEXT PRIMARY KEY,
    group_id     TEXT NOT NULL,
    code         TEXT NOT NULL,
    name         TEXT NOT NULL,
    description  TEXT,
    is_system    INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)),
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE RESTRICT,
    UNIQUE (group_id, code)
);
CREATE INDEX idx_roles_group ON roles (group_id);

-- ----------------------------------------------------------------------------
-- 7. role_permissions — role ↔ permission
-- ----------------------------------------------------------------------------
CREATE TABLE role_permissions (
    role_id         TEXT NOT NULL,
    permission_code TEXT NOT NULL,
    granted_at      TEXT NOT NULL,
    PRIMARY KEY (role_id, permission_code),
    FOREIGN KEY (role_id)         REFERENCES roles(id)       ON DELETE CASCADE,
    FOREIGN KEY (permission_code) REFERENCES permissions(code) ON DELETE CASCADE
);
CREATE INDEX idx_role_perms_perm ON role_permissions (permission_code);

-- ----------------------------------------------------------------------------
-- 8. membership_roles — membership ↔ role
-- ----------------------------------------------------------------------------
CREATE TABLE membership_roles (
    membership_id TEXT NOT NULL,
    role_id       TEXT NOT NULL,
    assigned_at   TEXT NOT NULL,
    assigned_by   TEXT,
    PRIMARY KEY (membership_id, role_id),
    FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id)       REFERENCES roles(id)       ON DELETE CASCADE,
    FOREIGN KEY (assigned_by)   REFERENCES users(id)       ON DELETE SET NULL
);
CREATE INDEX idx_membership_roles_role ON membership_roles (role_id);

-- ----------------------------------------------------------------------------
-- 9. sessions — active login sessions (refresh tokens)
-- ----------------------------------------------------------------------------
CREATE TABLE sessions (
    id                 TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL,
    refresh_token_hash TEXT NOT NULL,
    user_agent         TEXT,
    ip_address         TEXT,
    expires_at         TEXT NOT NULL,
    revoked_at         TEXT,
    created_at         TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_sessions_user  ON sessions (user_id, expires_at);
CREATE INDEX idx_sessions_token ON sessions (refresh_token_hash);

-- ============================================================================
-- Triggers: auto-update updated_at on UPDATE
-- ============================================================================

CREATE TRIGGER trg_groups_updated_at
AFTER UPDATE ON groups FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE groups SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_users_updated_at
AFTER UPDATE ON users FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE users SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_members_updated_at
AFTER UPDATE ON members FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE members SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_memberships_updated_at
AFTER UPDATE ON memberships FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE memberships SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_roles_updated_at
AFTER UPDATE ON roles FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE roles SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

-- ============================================================================
-- End of 0001_core.sql
-- ============================================================================
