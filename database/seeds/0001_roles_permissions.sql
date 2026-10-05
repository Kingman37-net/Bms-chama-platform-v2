-- ============================================================================
-- BODMAS CHAMAA — Seed: Permissions and Roles
-- File:   database/seeds/0001_roles_permissions.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Group (single tenant for V1)
-- ---------------------------------------------------------------------------
INSERT INTO groups (id, name, slug, currency, country, timezone,
                    contact_email, contact_phone, created_at, updated_at)
VALUES ('grp_bodmas','BODMAS CHAMAA','bodmas','KES','KE','Africa/Nairobi',
        'bodmaschamaa@gmail.com','+254726145371',
        '2026-10-05T00:00:00Z','2026-10-05T00:00:00Z');

-- ---------------------------------------------------------------------------
-- 2. Permissions catalogue
-- ---------------------------------------------------------------------------
INSERT INTO permissions (code, resource, action, description, created_at) VALUES
  -- members
  ('members.read',           'members',       'read',    'View member records',                   '2026-10-05T00:00:00Z'),
  ('members.create',         'members',       'create',  'Add new members',                       '2026-10-05T00:00:00Z'),
  ('members.update',         'members',       'update',  'Update member records',                 '2026-10-05T00:00:00Z'),
  ('members.delete',         'members',       'delete',  'Deactivate member records',             '2026-10-05T00:00:00Z'),
  -- memberships
  ('memberships.approve',    'memberships',   'approve', 'Approve membership applications',       '2026-10-05T00:00:00Z'),
  -- contributions
  ('contributions.read',     'contributions', 'read',    'View contributions',                    '2026-10-05T00:00:00Z'),
  ('contributions.create',   'contributions', 'create',  'Record contributions',                  '2026-10-05T00:00:00Z'),
  ('contributions.approve',  'contributions', 'approve', 'Approve contributions',                 '2026-10-05T00:00:00Z'),
  -- transactions
  ('transactions.read',      'transactions',  'read',    'View transactions',                     '2026-10-05T00:00:00Z'),
  ('transactions.create',    'transactions',  'create',  'Create transactions',                   '2026-10-05T00:00:00Z'),
  ('transactions.post',      'transactions',  'post',    'Post transactions to the ledger',       '2026-10-05T00:00:00Z'),
  ('transactions.reverse',   'transactions',  'reverse', 'Reverse posted transactions',           '2026-10-05T00:00:00Z'),
  -- expenses
  ('expenses.read',          'expenses',      'read',    'View expenses',                         '2026-10-05T00:00:00Z'),
  ('expenses.create',        'expenses',      'create',  'Record expenses',                       '2026-10-05T00:00:00Z'),
  ('expenses.approve',       'expenses',      'approve', 'Approve expenses',                      '2026-10-05T00:00:00Z'),
  -- income
  ('income.read',            'income',        'read',    'View income records',                   '2026-10-05T00:00:00Z'),
  ('income.create',          'income',        'create',  'Record income',                         '2026-10-05T00:00:00Z'),
  -- loans
  ('loans.read',             'loans',         'read',    'View loans',                            '2026-10-05T00:00:00Z'),
  ('loans.create',           'loans',         'create',  'Create loan applications',              '2026-10-05T00:00:00Z'),
  ('loans.approve',          'loans',         'approve', 'Approve loans',                         '2026-10-05T00:00:00Z'),
  ('loans.disburse',         'loans',         'disburse','Disburse approved loans',               '2026-10-05T00:00:00Z'),
  ('loans.repay',            'loans',         'repay',   'Record loan repayments',                '2026-10-05T00:00:00Z'),
  -- investments
  ('investments.read',       'investments',   'read',    'View investments',                      '2026-10-05T00:00:00Z'),
  ('investments.create',     'investments',   'create',  'Create investment records',             '2026-10-05T00:00:00Z'),
  ('investments.update',     'investments',   'update',  'Update investment records',             '2026-10-05T00:00:00Z'),
  -- reports
  ('reports.read',           'reports',       'read',    'View reports',                          '2026-10-05T00:00:00Z'),
  ('reports.export',         'reports',       'export',  'Export reports',                        '2026-10-05T00:00:00Z'),
  -- governance
  ('meetings.read',          'meetings',      'read',    'View meetings',                         '2026-10-05T00:00:00Z'),
  ('meetings.create',        'meetings',      'create',  'Create meetings',                       '2026-10-05T00:00:00Z'),
  ('meetings.manage',        'meetings',      'manage',  'Manage meetings, attendance, minutes',  '2026-10-05T00:00:00Z'),
  ('resolutions.manage',     'resolutions',   'manage',  'Manage resolutions and votes',          '2026-10-05T00:00:00Z'),
  -- documents
  ('documents.read',         'documents',     'read',    'View documents',                        '2026-10-05T00:00:00Z'),
  ('documents.upload',       'documents',     'upload',  'Upload documents',                      '2026-10-05T00:00:00Z'),
  ('documents.manage',       'documents',     'manage',  'Manage document access and versions',   '2026-10-05T00:00:00Z'),
  -- notifications
  ('notifications.read',     'notifications', 'read',    'View notifications',                    '2026-10-05T00:00:00Z'),
  ('notifications.send',     'notifications', 'send',    'Send notifications',                    '2026-10-05T00:00:00Z'),
  -- audit
  ('audit.read',             'audit',         'read',    'Read audit logs',                       '2026-10-05T00:00:00Z'),
  -- settings
  ('settings.read',          'settings',      'read',    'View settings',                         '2026-10-05T00:00:00Z'),
  ('settings.manage',        'settings',      'manage',  'Manage system settings',                '2026-10-05T00:00:00Z'),
  -- users / roles
  ('users.manage',           'users',         'manage',  'Manage user accounts',                  '2026-10-05T00:00:00Z'),
  ('roles.manage',           'roles',         'manage',  'Manage roles and permissions',          '2026-10-05T00:00:00Z'),
  -- payments
  ('payments.read',          'payments',      'read',    'View payment transactions',             '2026-10-05T00:00:00Z'),
  ('payments.reconcile',     'payments',      'reconcile','Reconcile payments with ledger',       '2026-10-05T00:00:00Z');

-- ---------------------------------------------------------------------------
-- 3. Roles
-- ---------------------------------------------------------------------------
INSERT INTO roles (id, group_id, code, name, description, is_system, created_at, updated_at) VALUES
  ('rol_super_admin','grp_bodmas','super_admin','Super Admin',  'Full system authority',                          1,'2026-10-05T00:00:00Z','2026-10-05T00:00:00Z'),
  ('rol_group_admin','grp_bodmas','group_admin','Group Admin',  'Operational administrator',                      1,'2026-10-05T00:00:00Z','2026-10-05T00:00:00Z'),
  ('rol_chair',      'grp_bodmas','chairperson','Chairperson',  'Governance, approvals, oversight',               1,'2026-10-05T00:00:00Z','2026-10-05T00:00:00Z'),
  ('rol_treasurer',  'grp_bodmas','treasurer',  'Treasurer',    'Finance, contributions, loans, reconciliation',  1,'2026-10-05T00:00:00Z','2026-10-05T00:00:00Z'),
  ('rol_secretary',  'grp_bodmas','secretary',  'Secretary',    'Members, meetings, minutes, announcements',      1,'2026-10-05T00:00:00Z','2026-10-05T00:00:00Z'),
  ('rol_auditor',    'grp_bodmas','auditor',    'Auditor',      'Read-only financial oversight',                  1,'2026-10-05T00:00:00Z','2026-10-05T00:00:00Z'),
  ('rol_member',     'grp_bodmas','member',     'Member',       'Ordinary member of the group',                   1,'2026-10-05T00:00:00Z','2026-10-05T00:00:00Z');

-- ---------------------------------------------------------------------------
-- 4. Role → Permission mappings
-- ---------------------------------------------------------------------------

-- SUPER ADMIN: every permission
INSERT INTO role_permissions (role_id, permission_code, granted_at)
SELECT 'rol_super_admin', code, '2026-10-05T00:00:00Z' FROM permissions;

-- GROUP ADMIN: operational everything except financial approvals
INSERT INTO role_permissions (role_id, permission_code, granted_at) VALUES
  ('rol_group_admin','members.read','2026-10-05T00:00:00Z'),
  ('rol_group_admin','members.create','2026-10-05T00:00:00Z'),
  ('rol_group_admin','members.update','2026-10-05T00:00:00Z'),
  ('rol_group_admin','memberships.approve','2026-10-05T00:00:00Z'),
  ('rol_group_admin','meetings.read','2026-10-05T00:00:00Z'),
  ('rol_group_admin','meetings.manage','2026-10-05T00:00:00Z'),
  ('rol_group_admin','documents.read','2026-10-05T00:00:00Z'),
  ('rol_group_admin','documents.upload','2026-10-05T00:00:00Z'),
  ('rol_group_admin','documents.manage','2026-10-05T00:00:00Z'),
  ('rol_group_admin','notifications.read','2026-10-05T00:00:00Z'),
  ('rol_group_admin','notifications.send','2026-10-05T00:00:00Z'),
  ('rol_group_admin','reports.read','2026-10-05T00:00:00Z'),
  ('rol_group_admin','settings.read','2026-10-05T00:00:00Z'),
  ('rol_group_admin','users.manage','2026-10-05T00:00:00Z');

-- CHAIRPERSON: oversight, governance, high-level approvals
INSERT INTO role_permissions (role_id, permission_code, granted_at) VALUES
  ('rol_chair','members.read','2026-10-05T00:00:00Z'),
  ('rol_chair','loans.read','2026-10-05T00:00:00Z'),
  ('rol_chair','loans.approve','2026-10-05T00:00:00Z'),
  ('rol_chair','expenses.read','2026-10-05T00:00:00Z'),
  ('rol_chair','expenses.approve','2026-10-05T00:00:00Z'),
  ('rol_chair','reports.read','2026-10-05T00:00:00Z'),
  ('rol_chair','reports.export','2026-10-05T00:00:00Z'),
  ('rol_chair','meetings.read','2026-10-05T00:00:00Z'),
  ('rol_chair','meetings.manage','2026-10-05T00:00:00Z'),
  ('rol_chair','resolutions.manage','2026-10-05T00:00:00Z'),
  ('rol_chair','documents.read','2026-10-05T00:00:00Z');

-- TREASURER: finance-heavy
INSERT INTO role_permissions (role_id, permission_code, granted_at) VALUES
  ('rol_treasurer','members.read','2026-10-05T00:00:00Z'),
  ('rol_treasurer','contributions.read','2026-10-05T00:00:00Z'),
  ('rol_treasurer','contributions.create','2026-10-05T00:00:00Z'),
  ('rol_treasurer','contributions.approve','2026-10-05T00:00:00Z'),
  ('rol_treasurer','transactions.read','2026-10-05T00:00:00Z'),
  ('rol_treasurer','transactions.create','2026-10-05T00:00:00Z'),
  ('rol_treasurer','transactions.post','2026-10-05T00:00:00Z'),
  ('rol_treasurer','expenses.read','2026-10-05T00:00:00Z'),
  ('rol_treasurer','expenses.create','2026-10-05T00:00:00Z'),
  ('rol_treasurer','income.read','2026-10-05T00:00:00Z'),
  ('rol_treasurer','income.create','2026-10-05T00:00:00Z'),
  ('rol_treasurer','loans.read','2026-10-05T00:00:00Z'),
  ('rol_treasurer','loans.repay','2026-10-05T00:00:00Z'),
  ('rol_treasurer','investments.read','2026-10-05T00:00:00Z'),
  ('rol_treasurer','reports.read','2026-10-05T00:00:00Z'),
  ('rol_treasurer','reports.export','2026-10-05T00:00:00Z'),
  ('rol_treasurer','payments.read','2026-10-05T00:00:00Z'),
  ('rol_treasurer','payments.reconcile','2026-10-05T00:00:00Z');

-- SECRETARY: governance + membership
INSERT INTO role_permissions (role_id, permission_code, granted_at) VALUES
  ('rol_secretary','members.read','2026-10-05T00:00:00Z'),
  ('rol_secretary','members.create','2026-10-05T00:00:00Z'),
  ('rol_secretary','members.update','2026-10-05T00:00:00Z'),
  ('rol_secretary','meetings.read','2026-10-05T00:00:00Z'),
  ('rol_secretary','meetings.manage','2026-10-05T00:00:00Z'),
  ('rol_secretary','resolutions.manage','2026-10-05T00:00:00Z'),
  ('rol_secretary','documents.read','2026-10-05T00:00:00Z'),
  ('rol_secretary','documents.upload','2026-10-05T00:00:00Z'),
  ('rol_secretary','notifications.read','2026-10-05T00:00:00Z'),
  ('rol_secretary','notifications.send','2026-10-05T00:00:00Z');

-- AUDITOR: read-only across finance
INSERT INTO role_permissions (role_id, permission_code, granted_at) VALUES
  ('rol_auditor','members.read','2026-10-05T00:00:00Z'),
  ('rol_auditor','contributions.read','2026-10-05T00:00:00Z'),
  ('rol_auditor','transactions.read','2026-10-05T00:00:00Z'),
  ('rol_auditor','expenses.read','2026-10-05T00:00:00Z'),
  ('rol_auditor','income.read','2026-10-05T00:00:00Z'),
  ('rol_auditor','loans.read','2026-10-05T00:00:00Z'),
  ('rol_auditor','investments.read','2026-10-05T00:00:00Z'),
  ('rol_auditor','reports.read','2026-10-05T00:00:00Z'),
  ('rol_auditor','reports.export','2026-10-05T00:00:00Z'),
  ('rol_auditor','audit.read','2026-10-05T00:00:00Z');

-- MEMBER: minimal
INSERT INTO role_permissions (role_id, permission_code, granted_at) VALUES
  ('rol_member','contributions.read','2026-10-05T00:00:00Z'),
  ('rol_member','transactions.read','2026-10-05T00:00:00Z'),
  ('rol_member','loans.read','2026-10-05T00:00:00Z'),
  ('rol_member','investments.read','2026-10-05T00:00:00Z'),
  ('rol_member','meetings.read','2026-10-05T00:00:00Z'),
  ('rol_member','documents.read','2026-10-05T00:00:00Z'),
  ('rol_member','notifications.read','2026-10-05T00:00:00Z'),
  ('rol_member','reports.read','2026-10-05T00:00:00Z');
