-- ============================================================================
-- BODMAS CHAMAA — Seed: Chart of Accounts
-- File:   database/seeds/0002_chart_of_accounts.sql
-- ============================================================================

INSERT INTO accounts (id, group_id, code, name, type, is_system, is_active, created_at, updated_at) VALUES
  ('acc_1000','grp_bodmas','1000','Cash on Hand',            'asset',    1,1,'2026-10-05T00:00:00Z','2026-10-05T00:00:00Z'),
  ('acc_1010','grp_bodmas','1010','Bank Account',            'asset',    1,1,'2026-10-05T00:00:00Z','2026-10-05T00:00:00Z'),
  ('acc_1020','grp_bodmas','1020','M-Pesa Float',            'asset',    1,1,'2026-10-05T00:00:00Z','2026-10-05T00:00:00Z'),
  ('acc_1100','grp_bodmas','1100','Loans Receivable',        'asset',    1,1,'2026-10-05T00:00:00Z','2026-10-05T00:00:00Z'),
  ('acc_1200','grp_bodmas','1200','Investments',             'asset',    1,1,'2026-10-05T00:00:00Z','2026-10-05T00:00:00Z'),
  ('acc_2000','grp_bodmas','2000','Member Savings',          'liability',1,1,'2026-10-05T00:00:00Z','2026-10-05T00:00:00Z'),
  ('acc_2010','grp_bodmas','2010','Member Welfare',          'liability',1,1,'2026-10-05T00:00:00Z','2026-10-05T00:00:00Z'),
  ('acc_3000','grp_bodmas','3000','Retained Surplus',        'equity',   1,1,'2026-10-05T00:00:00Z','2026-10-05T00:00:00Z'),
  ('acc_4000','grp_bodmas','4000','Contribution Income',     'income',   1,1,'2026-10-05T00:00:00Z','2026-10-05T00:00:00Z'),
  ('acc_4100','grp_bodmas','4100','Loan Interest Income',    'income',   1,1,'2026-10-05T00:00:00Z','2026-10-05T00:00:00Z'),
  ('acc_4200','grp_bodmas','4200','Investment Income',       'income',   1,1,'2026-10-05T00:00:00Z','2026-10-05T00:00:00Z'),
  ('acc_4300','grp_bodmas','4300','Fines Income',            'income',   1,1,'2026-10-05T00:00:00Z','2026-10-05T00:00:00Z'),
  ('acc_5000','grp_bodmas','5000','Operating Expenses',      'expense',  1,1,'2026-10-05T00:00:00Z','2026-10-05T00:00:00Z'),
  ('acc_5100','grp_bodmas','5100','Welfare Payments',        'expense',  1,1,'2026-10-05T00:00:00Z','2026-10-05T00:00:00Z');
