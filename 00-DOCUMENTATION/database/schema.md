# BODMAS CHAMAA — Database Schema Specification

> **Version:** 0.1.0 (Phase 6B)
> **Target DB:** SQLite (Cloudflare D1) — designed for portability to PostgreSQL
> **Status:** Blueprint — implementation in `database/schema/*.sql`

---

## Conventions

- **Primary keys:** TEXT ULID-style IDs (e.g. `usr_01H...`). Sortable, URL-safe, distributed-friendly.
  - Exception: `ledger_entries.id` is an INTEGER autoincrement (audit ordering).
- **Timestamps:** ISO-8601 UTC strings (`YYYY-MM-DDTHH:MM:SS.sssZ`) — SQLite has no native datetime.
- **Money:** INTEGER **minor units** (cents). `5000` = KSh 50.00.
- **Booleans:** INTEGER 0/1.
- **Enums:** TEXT with a `CHECK (... IN (...))` constraint.
- **Soft deletes:** `deleted_at` (nullable). Never hard-delete financial rows.
- **Audit columns:** every business table has `created_at`, `updated_at`,
  `created_by`, `updated_by` (nullable FKs to users.id).
- **Group scoping:** every business table has `group_id` — multi-tenant foundation.
- **Foreign keys:** enforced. `PRAGMA foreign_keys = ON` at connection open.

---

## Table Index — Overview

### Core (file `0001_core.sql`)
1. `groups` — tenant root
2. `users` — authentication identities
3. `members` — people (natural persons)
4. `memberships` — links users ↔ groups with member number
5. `roles` — named role bundles (per group)
6. `permissions` — global permission catalogue
7. `role_permissions` — join table
8. `membership_roles` — join table (membership ↔ roles)
9. `sessions` — refresh tokens / active sessions

### Finance (file `0002_finance.sql`)
10. `accounts` — chart of accounts
11. `transactions` — journal headers
12. `ledger_entries` — journal lines (double-entry)
13. `contribution_plans` — savings schedule definitions
14. `contributions` — member contribution entries
15. `income` — non-contribution income
16. `expenses` — group expenses

### Loans (file `0003_loans.sql`)
17. `loan_products` — loan product catalogue
18. `loans` — loan records
19. `loan_schedules` — repayment schedules
20. `loan_repayments` — individual repayments
21. `loan_guarantors` — members guaranteeing loans

### Investments (file `0004_investments.sql`)
22. `investments` — investment records
23. `investment_assets` — assets held
24. `investment_transactions` — capital movements

### Governance (file `0005_governance.sql`)
25. `meetings`
26. `attendance`
27. `minutes`
28. `resolutions`
29. `votes`

### System (file `0006_system.sql`)
30. `documents`
31. `notifications`
32. `audit_logs`
33. `security_events`

### Payments (file `0007_payments.sql`)
34. `payment_accounts`
35. `payment_transactions`
36. `reconciliation_records`

---

## 1. groups

Tenant root. V1 has a single row (`bodmas-chamaa`). Multi-group is future.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | e.g. `grp_bodmas` |
| name | TEXT NOT NULL | "BODMAS CHAMAA" |
| slug | TEXT UNIQUE NOT NULL | "bodmas" |
| currency | TEXT NOT NULL DEFAULT 'KES' | ISO 4217 |
| country | TEXT NOT NULL DEFAULT 'KE' | ISO 3166-1 alpha-2 |
| timezone | TEXT NOT NULL DEFAULT 'Africa/Nairobi' | IANA |
| registration_no | TEXT | Kenya self-help group reg number |
| contact_email | TEXT | |
| contact_phone | TEXT | |
| logo_url | TEXT | |
| is_active | INTEGER NOT NULL DEFAULT 1 | |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

**Indexes:** `idx_groups_slug`

---

## 2. users

Authentication identity. One row per login account.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `usr_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| email | TEXT UNIQUE NOT NULL | login identifier |
| phone | TEXT UNIQUE | login option |
| password_hash | TEXT NOT NULL | Argon2id |
| display_name | TEXT NOT NULL | |
| is_active | INTEGER NOT NULL DEFAULT 1 | |
| is_locked | INTEGER NOT NULL DEFAULT 0 | |
| failed_login_count | INTEGER NOT NULL DEFAULT 0 | |
| last_login_at | TEXT | |
| password_changed_at | TEXT | |
| mfa_secret | TEXT | nullable; TOTP secret |
| mfa_enabled | INTEGER NOT NULL DEFAULT 0 | |
| email_verified_at | TEXT | |
| deleted_at | TEXT | soft delete |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

**Indexes:** `idx_users_email`, `idx_users_group`

**Rules:**
- Never store plaintext passwords.
- Never expose `password_hash`, `mfa_secret` in API responses.
- One email is globally unique across the platform (future multi-tenant rule).

---

## 3. members

Natural person details — separated from auth identity so a member can exist
without a portal login (e.g. elderly member managed by a family user).

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `mem_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| full_name | TEXT NOT NULL | |
| id_number | TEXT | national ID / passport |
| date_of_birth | TEXT | |
| gender | TEXT | CHECK IN ('male','female','other','undisclosed') |
| phone | TEXT | |
| email | TEXT | |
| address | TEXT | |
| emergency_contact_name | TEXT | |
| emergency_contact_phone | TEXT | |
| photo_url | TEXT | |
| joined_on | TEXT | date membership started |
| status | TEXT NOT NULL | CHECK IN ('active','suspended','exited','deceased') |
| notes | TEXT | |
| deleted_at | TEXT | |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |
| created_by | TEXT FK users(id) | |
| updated_by | TEXT FK users(id) | |

**Indexes:** `idx_members_group_status`, `idx_members_name`, `idx_members_id_number`

**Rules:**
- `id_number` unique per group (enforced in service layer).
- Status changes must be audit-logged.
- Exited/deceased members are retained for historical financial records.

---

## 4. memberships

Links a member to a group with a group-scoped member number.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `mbr_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| member_id | TEXT NOT NULL FK members(id) | |
| user_id | TEXT FK users(id) | nullable — member may not have portal access |
| member_number | TEXT NOT NULL | e.g. "BMS-0001" |
| status | TEXT NOT NULL | CHECK IN ('pending','active','suspended','exited') |
| approved_by | TEXT FK users(id) | |
| approved_at | TEXT | |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

**Unique:** `(group_id, member_number)`, `(group_id, member_id)`

**Indexes:** `idx_memberships_user`, `idx_memberships_status`

---

## 5. roles

Named role bundles. Scoped per group so different groups can define their own.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `rol_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| code | TEXT NOT NULL | e.g. "treasurer" |
| name | TEXT NOT NULL | "Treasurer" |
| description | TEXT | |
| is_system | INTEGER NOT NULL DEFAULT 0 | system roles can't be deleted |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

**Unique:** `(group_id, code)`

**Seeded roles:** super_admin, group_admin, chairperson, treasurer, secretary, auditor, member.

---

## 6. permissions

Global permission catalogue (not group-scoped — the same permissions apply everywhere).

| Column | Type | Notes |
|---|---|---|
| code | TEXT PK | e.g. "contributions.create" |
| resource | TEXT NOT NULL | e.g. "contributions" |
| action | TEXT NOT NULL | e.g. "create" |
| description | TEXT | |
| created_at | TEXT NOT NULL | |

**Seeded:** all `*.read`, `*.create`, `*.update`, `*.approve`, `*.reverse`, etc.
(full list in `documentation/security/access-control.md`).

---

## 7. role_permissions

| Column | Type | Notes |
|---|---|---|
| role_id | TEXT NOT NULL FK roles(id) | |
| permission_code | TEXT NOT NULL FK permissions(code) | |
| granted_at | TEXT NOT NULL | |

**PK:** `(role_id, permission_code)`

---

## 8. membership_roles

| Column | Type | Notes |
|---|---|---|
| membership_id | TEXT NOT NULL FK memberships(id) | |
| role_id | TEXT NOT NULL FK roles(id) | |
| assigned_at | TEXT NOT NULL | |
| assigned_by | TEXT FK users(id) | |

**PK:** `(membership_id, role_id)`

---

## 9. sessions

Active login sessions (refresh tokens).

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `ses_...` |
| user_id | TEXT NOT NULL FK users(id) | |
| refresh_token_hash | TEXT NOT NULL | SHA-256 of the token; raw token never stored |
| user_agent | TEXT | |
| ip_address | TEXT | |
| expires_at | TEXT NOT NULL | |
| revoked_at | TEXT | |
| created_at | TEXT NOT NULL | |

**Indexes:** `idx_sessions_user`, `idx_sessions_token`

---

## 10. accounts

Chart of accounts. Every group has its own set.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `acc_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| code | TEXT NOT NULL | e.g. "1000" |
| name | TEXT NOT NULL | "Cash on Hand" |
| type | TEXT NOT NULL | CHECK IN ('asset','liability','equity','income','expense') |
| parent_id | TEXT FK accounts(id) | for hierarchy |
| is_system | INTEGER NOT NULL DEFAULT 0 | system accounts can't be deleted |
| is_active | INTEGER NOT NULL DEFAULT 1 | |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

**Unique:** `(group_id, code)`

**Balances are NOT stored here.** They are derived from `ledger_entries`.

**Seeded chart (V1):**
- 1000 Cash on Hand (asset)
- 1010 Bank Account (asset)
- 1020 M-Pesa Float (asset)
- 1100 Loans Receivable (asset)
- 1200 Investments (asset)
- 2000 Member Savings (liability)
- 2010 Member Welfare (liability)
- 3000 Retained Surplus (equity)
- 4000 Contribution Income (income)
- 4100 Loan Interest Income (income)
- 4200 Investment Income (income)
- 4300 Fines Income (income)
- 5000 Operating Expenses (expense)
- 5100 Welfare Payments (expense)

---

## 11. transactions

Journal header. One per financial event.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `txn_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| reference | TEXT NOT NULL | human reference, e.g. "TXN-2026-000123" |
| description | TEXT NOT NULL | |
| transaction_type | TEXT NOT NULL | e.g. 'contribution','loan_disbursement','loan_repayment','expense','income','transfer','reversal' |
| state | TEXT NOT NULL | CHECK IN ('created','validated','approved','posted','reconciled','reversed') |
| posted_at | TEXT | when state became 'posted' |
| reversed_by | TEXT FK transactions(id) | if this txn was reversed |
| reverses | TEXT FK transactions(id) | if this txn is the reversal |
| created_by | TEXT FK users(id) | |
| approved_by | TEXT FK users(id) | |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

**Unique:** `(group_id, reference)`
**Indexes:** `idx_transactions_group_date`, `idx_transactions_state`, `idx_transactions_type`

**Rules:**
- Posted transactions are immutable except for state changes to 'reversed'.
- Never delete a posted transaction. Use a reversal.

---

## 12. ledger_entries

Double-entry lines. Every transaction produces ≥ 2 entries summing to zero.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | ordered ledger |
| transaction_id | TEXT NOT NULL FK transactions(id) | |
| group_id | TEXT NOT NULL FK groups(id) | denormalized for fast queries |
| account_id | TEXT NOT NULL FK accounts(id) | |
| debit_minor | INTEGER NOT NULL DEFAULT 0 | |
| credit_minor | INTEGER NOT NULL DEFAULT 0 | |
| member_id | TEXT FK members(id) | for member-scoped views |
| memo | TEXT | |
| posted_at | TEXT NOT NULL | |
| created_at | TEXT NOT NULL | |

**Indexes:** `idx_ledger_account_posted`, `idx_ledger_member`, `idx_ledger_transaction`

**Invariants (enforced by triggers):**
- `debit_minor >= 0 AND credit_minor >= 0`
- `NOT (debit_minor > 0 AND credit_minor > 0)` — one side per line
- For each `transaction_id`: `SUM(debit_minor) = SUM(credit_minor)`

---

## 13. contribution_plans

Defines what a member is expected to contribute.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `cpp_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| name | TEXT NOT NULL | "Monthly Savings" |
| category | TEXT NOT NULL | CHECK IN ('savings','investment','welfare','emergency','project') |
| frequency | TEXT NOT NULL | CHECK IN ('weekly','monthly','quarterly','annual','one_off') |
| amount_minor | INTEGER NOT NULL | expected amount |
| currency | TEXT NOT NULL DEFAULT 'KES' | |
| due_day | INTEGER | day of month/week |
| grace_days | INTEGER NOT NULL DEFAULT 0 | |
| late_fee_minor | INTEGER NOT NULL DEFAULT 0 | |
| is_active | INTEGER NOT NULL DEFAULT 1 | |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

---

## 14. contributions

Member contribution entries. Links to a transaction once posted.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `con_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| member_id | TEXT NOT NULL FK members(id) | |
| plan_id | TEXT FK contribution_plans(id) | |
| amount_minor | INTEGER NOT NULL | |
| currency | TEXT NOT NULL | |
| contribution_date | TEXT NOT NULL | |
| period_label | TEXT | e.g. "2026-10" |
| status | TEXT NOT NULL | CHECK IN ('pending','posted','reversed') |
| transaction_id | TEXT FK transactions(id) | set when posted |
| payment_reference | TEXT | external payment ref |
| receipt_number | TEXT | |
| notes | TEXT | |
| created_at | TEXT NOT NULL | |
| created_by | TEXT FK users(id) | |
| updated_at | TEXT NOT NULL | |

**Indexes:** `idx_contributions_member_date`, `idx_contributions_period`

---

## 15. income

Non-contribution income.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `inc_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| category | TEXT NOT NULL | e.g. 'interest','dividend','grant','fine' |
| description | TEXT NOT NULL | |
| amount_minor | INTEGER NOT NULL | |
| currency | TEXT NOT NULL | |
| received_at | TEXT NOT NULL | |
| status | TEXT NOT NULL | CHECK IN ('pending','posted','reversed') |
| transaction_id | TEXT FK transactions(id) | |
| received_by | TEXT FK users(id) | |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

---

## 16. expenses

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `exp_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| category | TEXT NOT NULL | |
| description | TEXT NOT NULL | |
| payee | TEXT | |
| amount_minor | INTEGER NOT NULL | |
| currency | TEXT NOT NULL | |
| payment_method | TEXT | CHECK IN ('cash','bank','mpesa','cheque','other') |
| paid_at | TEXT NOT NULL | |
| status | TEXT NOT NULL | CHECK IN ('pending','approved','posted','reversed','rejected') |
| approved_by | TEXT FK users(id) | |
| approved_at | TEXT | |
| transaction_id | TEXT FK transactions(id) | |
| receipt_url | TEXT | |
| reference | TEXT | |
| notes | TEXT | |
| created_at | TEXT NOT NULL | |
| created_by | TEXT FK users(id) | |
| updated_at | TEXT NOT NULL | |

**Indexes:** `idx_expenses_group_date`, `idx_expenses_status`

---

## 17. loan_products

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `lnp_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| name | TEXT NOT NULL | e.g. "Emergency Loan" |
| min_amount_minor | INTEGER NOT NULL | |
| max_amount_minor | INTEGER NOT NULL | |
| interest_rate_bps | INTEGER NOT NULL | basis points (e.g. 1500 = 15%) |
| interest_method | TEXT NOT NULL | CHECK IN ('flat','reducing_balance') |
| term_months | INTEGER NOT NULL | |
| grace_period_days | INTEGER NOT NULL DEFAULT 0 | |
| late_fee_bps | INTEGER NOT NULL DEFAULT 0 | |
| requires_guarantors | INTEGER NOT NULL DEFAULT 1 | |
| min_guarantors | INTEGER NOT NULL DEFAULT 2 | |
| eligibility_months | INTEGER NOT NULL DEFAULT 6 | months of membership required |
| is_active | INTEGER NOT NULL DEFAULT 1 | |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

---

## 18. loans

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `lon_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| member_id | TEXT NOT NULL FK members(id) | |
| product_id | TEXT NOT NULL FK loan_products(id) | |
| reference | TEXT NOT NULL | "LN-2026-0001" |
| principal_minor | INTEGER NOT NULL | |
| interest_rate_bps | INTEGER NOT NULL | snapshot at approval |
| interest_method | TEXT NOT NULL | snapshot |
| term_months | INTEGER NOT NULL | snapshot |
| total_payable_minor | INTEGER NOT NULL | computed at approval |
| amount_paid_minor | INTEGER NOT NULL DEFAULT 0 | derived but cached |
| outstanding_minor | INTEGER NOT NULL | derived but cached |
| currency | TEXT NOT NULL | |
| status | TEXT NOT NULL | CHECK IN ('draft','submitted','under_review','approved','rejected','disbursed','active','completed','defaulted','written_off','cancelled') |
| application_date | TEXT NOT NULL | |
| approved_at | TEXT | |
| approved_by | TEXT FK users(id) | |
| disbursed_at | TEXT | |
| disbursed_by | TEXT FK users(id) | |
| disbursement_transaction_id | TEXT FK transactions(id) | |
| next_due_date | TEXT | |
| notes | TEXT | |
| created_at | TEXT NOT NULL | |
| created_by | TEXT FK users(id) | |
| updated_at | TEXT NOT NULL | |

**Unique:** `(group_id, reference)`
**Indexes:** `idx_loans_member`, `idx_loans_status`

**Rule:** `amount_paid_minor` and `outstanding_minor` are cached for performance
but are **always** recomputable from `loan_repayments`. Reconciliation jobs verify.

---

## 19. loan_schedules

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `lns_...` |
| loan_id | TEXT NOT NULL FK loans(id) | |
| installment_no | INTEGER NOT NULL | 1-based |
| due_date | TEXT NOT NULL | |
| principal_minor | INTEGER NOT NULL | |
| interest_minor | INTEGER NOT NULL | |
| total_due_minor | INTEGER NOT NULL | |
| paid_minor | INTEGER NOT NULL DEFAULT 0 | |
| paid_at | TEXT | |
| status | TEXT NOT NULL | CHECK IN ('pending','partial','paid','overdue','waived') |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

**Unique:** `(loan_id, installment_no)`
**Indexes:** `idx_schedules_due`, `idx_schedules_status`

---

## 20. loan_repayments

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `lnr_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| loan_id | TEXT NOT NULL FK loans(id) | |
| amount_minor | INTEGER NOT NULL | |
| principal_minor | INTEGER NOT NULL | |
| interest_minor | INTEGER NOT NULL | |
| penalty_minor | INTEGER NOT NULL DEFAULT 0 | |
| repaid_at | TEXT NOT NULL | |
| payment_method | TEXT NOT NULL | |
| payment_reference | TEXT | |
| transaction_id | TEXT FK transactions(id) | |
| receipt_number | TEXT | |
| notes | TEXT | |
| created_at | TEXT NOT NULL | |
| created_by | TEXT FK users(id) | |

**Indexes:** `idx_repayments_loan_date`

---

## 21. loan_guarantors

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `lng_...` |
| loan_id | TEXT NOT NULL FK loans(id) | |
| member_id | TEXT NOT NULL FK members(id) | the guarantor |
| guaranteed_minor | INTEGER NOT NULL | portion guaranteed |
| status | TEXT NOT NULL | CHECK IN ('active','released','called') |
| created_at | TEXT NOT NULL | |
| released_at | TEXT | |

**Unique:** `(loan_id, member_id)`

---

## 22. investments

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `inv_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| name | TEXT NOT NULL | |
| category | TEXT NOT NULL | CHECK IN ('land','property','shares','bonds','business','money_market','project','other') |
| description | TEXT | |
| initial_capital_minor | INTEGER NOT NULL | |
| current_value_minor | INTEGER NOT NULL | |
| currency | TEXT NOT NULL | |
| status | TEXT NOT NULL | CHECK IN ('proposed','active','completed','exited','written_off') |
| started_on | TEXT | |
| closed_on | TEXT | |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

---

## 23. investment_assets

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `iva_...` |
| investment_id | TEXT NOT NULL FK investments(id) | |
| name | TEXT NOT NULL | |
| asset_type | TEXT NOT NULL | |
| purchase_date | TEXT | |
| purchase_price_minor | INTEGER | |
| current_value_minor | INTEGER | |
| location | TEXT | |
| title_deed_ref | TEXT | |
| notes | TEXT | |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

---

## 24. investment_transactions

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `ivt_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| investment_id | TEXT NOT NULL FK investments(id) | |
| txn_type | TEXT NOT NULL | CHECK IN ('capital_in','capital_out','income','expense','revaluation') |
| amount_minor | INTEGER NOT NULL | |
| occurred_at | TEXT NOT NULL | |
| transaction_id | TEXT FK transactions(id) | linked ledger txn |
| notes | TEXT | |
| created_at | TEXT NOT NULL | |
| created_by | TEXT FK users(id) | |

---

## 25. meetings

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `met_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| title | TEXT NOT NULL | |
| meeting_type | TEXT NOT NULL | CHECK IN ('ordinary','agm','egm','committee','emergency') |
| scheduled_at | TEXT NOT NULL | |
| location | TEXT | |
| agenda | TEXT | |
| status | TEXT NOT NULL | CHECK IN ('scheduled','in_progress','completed','cancelled') |
| is_public | INTEGER NOT NULL DEFAULT 0 | visible on public site |
| created_at | TEXT NOT NULL | |
| created_by | TEXT FK users(id) | |
| updated_at | TEXT NOT NULL | |

---

## 26. attendance

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `att_...` |
| meeting_id | TEXT NOT NULL FK meetings(id) | |
| member_id | TEXT NOT NULL FK members(id) | |
| status | TEXT NOT NULL | CHECK IN ('present','absent','apology','late') |
| checked_in_at | TEXT | |
| notes | TEXT | |

**Unique:** `(meeting_id, member_id)`

---

## 27. minutes

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `min_...` |
| meeting_id | TEXT NOT NULL FK meetings(id) | |
| content | TEXT NOT NULL | |
| status | TEXT NOT NULL | CHECK IN ('draft','approved','published') |
| approved_at | TEXT | |
| approved_by | TEXT FK users(id) | |
| document_url | TEXT | link to a PDF in documents |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

---

## 28. resolutions

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `res_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| meeting_id | TEXT FK meetings(id) | |
| title | TEXT NOT NULL | |
| description | TEXT NOT NULL | |
| status | TEXT NOT NULL | CHECK IN ('proposed','voting','passed','rejected','withdrawn') |
| votes_for | INTEGER NOT NULL DEFAULT 0 | |
| votes_against | INTEGER NOT NULL DEFAULT 0 | |
| votes_abstain | INTEGER NOT NULL DEFAULT 0 | |
| passed_at | TEXT | |
| is_public | INTEGER NOT NULL DEFAULT 0 | |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

---

## 29. votes

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `vot_...` |
| resolution_id | TEXT NOT NULL FK resolutions(id) | |
| member_id | TEXT NOT NULL FK members(id) | |
| choice | TEXT NOT NULL | CHECK IN ('for','against','abstain') |
| cast_at | TEXT NOT NULL | |

**Unique:** `(resolution_id, member_id)`

---

## 30. documents

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `doc_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| name | TEXT NOT NULL | |
| category | TEXT NOT NULL | CHECK IN ('constitution','registration','minutes','policy','report','statement','agreement','receipt','investment','project','member') |
| file_url | TEXT NOT NULL | storage reference |
| file_size_bytes | INTEGER | |
| mime_type | TEXT | |
| visibility | TEXT NOT NULL | CHECK IN ('public','members','officials','admins') |
| uploaded_by | TEXT FK users(id) | |
| version | INTEGER NOT NULL DEFAULT 1 | |
| status | TEXT NOT NULL | CHECK IN ('active','archived','deleted') |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

---

## 31. notifications

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `ntf_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| recipient_user_id | TEXT FK users(id) | null = broadcast |
| recipient_member_id | TEXT FK members(id) | |
| channel | TEXT NOT NULL | CHECK IN ('in_app','email','sms') |
| category | TEXT NOT NULL | e.g. 'contribution_received','loan_due','meeting' |
| title | TEXT NOT NULL | |
| body | TEXT NOT NULL | |
| payload_json | TEXT | structured data |
| status | TEXT NOT NULL | CHECK IN ('pending','sent','failed','read') |
| sent_at | TEXT | |
| read_at | TEXT | |
| created_at | TEXT NOT NULL | |

**Indexes:** `idx_notifications_recipient`, `idx_notifications_status`

---

## 32. audit_logs

Immutable. Append-only.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `aud_...` |
| group_id | TEXT FK groups(id) | |
| user_id | TEXT FK users(id) | who did it |
| action | TEXT NOT NULL | e.g. 'contribution.create' |
| resource_type | TEXT NOT NULL | e.g. 'contributions' |
| resource_id | TEXT | |
| before_json | TEXT | state before change |
| after_json | TEXT | state after change |
| ip_address | TEXT | |
| user_agent | TEXT | |
| request_id | TEXT | |
| severity | TEXT NOT NULL | CHECK IN ('info','warning','critical') |
| created_at | TEXT NOT NULL | |

**Indexes:** `idx_audit_user_date`, `idx_audit_resource`, `idx_audit_action`

**Rule:** no UPDATE or DELETE permitted. Enforced by trigger.

---

## 33. security_events

Auth-specific events, separated for fast security queries.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `sec_...` |
| user_id | TEXT FK users(id) | nullable for failed logins |
| event_type | TEXT NOT NULL | 'login.success','login.failed','logout','password.change','mfa.enable','mfa.disable','session.revoke','permission.change' |
| email_attempted | TEXT | for failed logins |
| ip_address | TEXT | |
| user_agent | TEXT | |
| details_json | TEXT | |
| created_at | TEXT NOT NULL | |

**Indexes:** `idx_security_event_type_date`

---

## 34. payment_accounts

Payment channels (M-Pesa paybill, bank accounts).

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `pac_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| provider | TEXT NOT NULL | 'mpesa','bank','cash','manual' |
| display_name | TEXT NOT NULL | |
| account_number | TEXT | e.g. paybill number |
| account_name | TEXT | |
| is_active | INTEGER NOT NULL DEFAULT 1 | |
| metadata_json | TEXT | provider-specific config (never secrets) |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

**Rule:** API secrets live in environment variables, never in this table.

---

## 35. payment_transactions

Raw incoming payments from providers, before matching.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `ptx_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| provider | TEXT NOT NULL | |
| provider_ref | TEXT NOT NULL | e.g. M-Pesa confirmation code |
| amount_minor | INTEGER NOT NULL | |
| currency | TEXT NOT NULL | |
| payer_phone | TEXT | |
| payer_name | TEXT | |
| paid_at | TEXT NOT NULL | |
| raw_payload_json | TEXT | full webhook body |
| matched_member_id | TEXT FK members(id) | |
| matched_transaction_id | TEXT FK transactions(id) | |
| status | TEXT NOT NULL | CHECK IN ('received','matched','unmatched','duplicate','rejected') |
| created_at | TEXT NOT NULL | |

**Unique:** `(provider, provider_ref)`
**Indexes:** `idx_payment_txn_status`, `idx_payment_txn_member`

---

## 36. reconciliation_records

Manual or automated reconciliation runs.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `rec_...` |
| group_id | TEXT NOT NULL FK groups(id) | |
| period_start | TEXT NOT NULL | |
| period_end | TEXT NOT NULL | |
| account_id | TEXT FK accounts(id) | |
| opening_minor | INTEGER NOT NULL | |
| closing_minor | INTEGER NOT NULL | |
| expected_minor | INTEGER NOT NULL | ledger-derived |
| difference_minor | INTEGER NOT NULL | |
| status | TEXT NOT NULL | CHECK IN ('in_progress','balanced','discrepancy','resolved') |
| notes | TEXT | |
| reconciled_by | TEXT FK users(id) | |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

---

## What This Document Is NOT

- Not runnable SQL (see `database/schema/*.sql`)
- Not an ERD diagram (see `relationships.md`)
- Not an indexing strategy (see `indexes.md`)
