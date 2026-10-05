# BODMAS CHAMAA — Indexing Strategy

> **Version:** 0.1.0 (Phase 6B)

---

## Principle

Index only what queries actually need.
Every index costs writes. Financial systems are write-heavy.

We index:
1. Foreign keys used in joins
2. Columns used in `WHERE` filters on hot paths
3. Columns used for `ORDER BY` in list views
4. Uniqueness constraints (implied index)

We do NOT index:
- Low-cardinality status columns alone (combine with date)
- Text fields except for name search
- `payload_json` or `raw_payload_json` blobs

---

## Hot Query Patterns

### Authentication
```sql
-- login by email
SELECT * FROM users WHERE email = ? AND deleted_at IS NULL;
-- → index: users(email) UNIQUE

-- find session
SELECT * FROM sessions WHERE refresh_token_hash = ? AND revoked_at IS NULL;
-- → index: sessions(refresh_token_hash)
```

Member dashboard

```sql
-- contributions for one member, latest first
SELECT * FROM contributions
WHERE group_id = ? AND member_id = ?
ORDER BY contribution_date DESC LIMIT 20;
-- → index: (group_id, member_id, contribution_date DESC)
```

Ledger queries (reports)

```sql
-- all ledger entries for one account in a date range
SELECT * FROM ledger_entries
WHERE group_id = ? AND account_id = ? AND posted_at BETWEEN ? AND ?
ORDER BY id;
-- → index: (group_id, account_id, posted_at)
```

Loan list

```sql
-- active loans for a member
SELECT * FROM loans
WHERE member_id = ? AND status IN ('active','disbursed')
ORDER BY application_date DESC;
-- → index: (member_id, status, application_date DESC)
```

Audit trail

```sql
-- recent audit events for one user
SELECT * FROM audit_logs
WHERE user_id = ? ORDER BY created_at DESC LIMIT 100;
-- → index: (user_id, created_at DESC)
```

---

Index List

Table Index Columns
groups idx_groups_slug slug UNIQUE
users idx_users_email email UNIQUE
users idx_users_group (group_id, is_active)
members idx_members_group_status (group_id, status)
members idx_members_name (full_name)
members idx_members_id_number (group_id, id_number)
memberships idx_memberships_user (user_id)
memberships idx_memberships_status (group_id, status)
sessions idx_sessions_user (user_id, expires_at)
sessions idx_sessions_token refresh_token_hash
accounts idx_accounts_group (group_id, code) UNIQUE
transactions idx_transactions_group_date (group_id, created_at DESC)
transactions idx_transactions_state (group_id, state)
transactions idx_transactions_type (group_id, transaction_type, created_at DESC)
ledger_entries idx_ledger_account_posted (group_id, account_id, posted_at)
ledger_entries idx_ledger_member (group_id, member_id, posted_at)
ledger_entries idx_ledger_transaction (transaction_id)
contributions idx_contributions_member_date (group_id, member_id, contribution_date DESC)
contributions idx_contributions_period (group_id, period_label, status)
expenses idx_expenses_group_date (group_id, paid_at DESC)
expenses idx_expenses_status (group_id, status)
loans idx_loans_member (member_id, status, application_date DESC)
loans idx_loans_status (group_id, status)
loan_schedules idx_schedules_due (loan_id, due_date)
loan_schedules idx_schedules_status (status, due_date)
loan_repayments idx_repayments_loan_date (loan_id, repaid_at DESC)
loan_guarantors idx_guarantors_member (member_id, status)
investment_transactions idx_inv_txn_investment (investment_id, occurred_at DESC)
attendance idx_attendance_meeting (meeting_id)
attendance idx_attendance_member (member_id, status)
audit_logs idx_audit_user_date (user_id, created_at DESC)
audit_logs idx_audit_resource (resource_type, resource_id)
audit_logs idx_audit_action (action, created_at DESC)
security_events idx_security_event_type_date (event_type, created_at DESC)
notifications idx_notifications_recipient (recipient_user_id, status, created_at DESC)
payment_transactions idx_payment_txn_status (group_id, status)
payment_transactions idx_payment_txn_member (matched_member_id)
payment_transactions idx_payment_txn_provider_ref (provider, provider_ref) UNIQUE

---

Rules

1. Every foreign key gets an index. SQLite doesn't do this automatically.
2. Every list view's sort column is indexed.
3. Composite indexes put equality columns first, range columns last.
   Example: (group_id, member_id, contribution_date DESC) — group and member
   are equality; date is range.
4. Never index booleans alone. Combine with a filter column.
5. Denormalize group_id into child tables (ledger_entries, contributions, etc.)
   to avoid joins on hot paths.

---

Query Plans to Verify

After migrations, run EXPLAIN QUERY PLAN on:

· Member dashboard contribution list
· Account ledger range query
· Loan list for a member
· Audit trail for a user
· Unreconciled payment transactions

Target: no full table scans on tables > 10,000 rows.

---

Growth Assumptions

Table Year 1 rows (est.) Year 3 rows (est.)
members 200 2,000
contributions 10,000 200,000
transactions 30,000 600,000
ledger_entries 90,000 1,800,000
audit_logs 200,000 4,000,000

At these volumes, SQLite handles everything comfortably.
Migration to PostgreSQL becomes relevant only beyond ~10M ledger rows.
