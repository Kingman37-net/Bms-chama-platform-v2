# BODMAS CHAMAA — Database Relationships (ERD in Text Form)

> **Version:** 0.1.0 (Phase 6B)

---

## 1. Core Relationships

```

groups (1) ───< (many) users
groups (1) ───< (many) members
groups (1) ───< (many) memberships
members (1) ───< (many) memberships
users  (1) ───< (many) memberships          [nullable — a member may have no portal login]

memberships (many) >──< (many) roles
via membership_roles

roles (many) >──< (many) permissions
via role_permissions

users (1) ───< (many) sessions

```

**Cardinality summary:**
- A group has many users and many members.
- A member may optionally be linked to a user (for portal login).
- A membership is a member's enrolment in a specific group with a member number.
- A membership may hold multiple roles (e.g. member + treasurer).
- A role bundles multiple permissions.
- A user may have multiple concurrent sessions.

---

## 2. Financial Relationships

```

members (1) ───< (many) contributions
contribution_plans (1) ───< (many) contributions

transactions (1) ───< (many) ledger_entries
accounts     (1) ───< (many) ledger_entries
members      (0/1) ───< (many) ledger_entries   [only for member-scoped lines]

contributions (0/1) ─── (1) transactions
expenses      (0/1) ─── (1) transactions
income        (0/1) ─── (1) transactions
loan_repayments (0/1) ─── (1) transactions
investment_transactions (0/1) ─── (1) transactions

```

**Key relationships:**
- Every financial event is one **transaction**.
- Every transaction has ≥ 2 **ledger_entries** (one debit, one credit minimum).
- Every **account** accumulates ledger entries; balances are derived.
- Business events (contribution, expense, repayment, etc.) each link to their transaction.

---

## 3. Loan Relationships

```

members      (1) ───< (many) loans
loan_products (1) ───< (many) loans
loans        (1) ───< (many) loan_schedules
loans        (1) ───< (many) loan_repayments
loans        (1) ───< (many) loan_guarantors

members      (1) ───< (many) loan_guarantors  [as guarantor]

loans (0/1) ─── (1) transactions  [disbursement]
loan_repayments (0/1) ─── (1) transactions

```

**Flow:**
```

member --> loan application --> loan record
--> schedule (installments)
--> guarantors
--> disbursement transaction
--> repayments (each linked to a transaction)
--> completion

```

---

## 4. Investment Relationships

```

groups      (1) ───< (many) investments
investments (1) ───< (many) investment_assets
investments (1) ───< (many) investment_transactions

investment_transactions (0/1) ─── (1) transactions

```

---

## 5. Governance Relationships

```

groups      (1) ───< (many) meetings
meetings    (1) ───< (many) attendance
meetings    (1) ───< (1)   minutes
meetings    (0/1) ───< (many) resolutions
resolutions (1) ───< (many) votes

members     (1) ───< (many) attendance
members     (1) ───< (many) votes

```

---

## 6. Payment Relationships

```

groups       (1) ───< (many) payment_accounts
groups       (1) ───< (many) payment_transactions
groups       (1) ───< (many) reconciliation_records

payment_transactions (0/1) ─── (1) members     [once matched]
payment_transactions (0/1) ─── (1) transactions [once matched]

reconciliation_records (0/1) ─── (1) accounts

```

---

## 7. Audit / System Relationships

```

users (1) ───< (many) audit_logs
users (1) ───< (many) security_events
groups (1) ───< (many) audit_logs
groups (1) ───< (many) notifications
groups (1) ───< (many) documents

users (1) ───< (many) notifications  [as recipient]
members (0/1) ───< (many) notifications

```

**Rule:** `audit_logs` and `security_events` are **append-only**.
No updates, no deletes, enforced by database triggers.

---

## 8. Full Entity Map (visual, text)

```

+----------+                 |                        |

| sessions |                 |                        |
+----------+                 |                        |

+-----------------+    +-------------+          +------------------+

| memberships     |    |contributions|          | transactions     |
+--------+--------+    +------+------+          +---------+--------+

+-----------------+    +-------------+          +------------------+

| membership_roles|    |  loans      |          | ledger_entries   |
+--------+--------+    +------+------+          +------------------+

+-----------------+    +-------------+

| roles           |    | loan_        |
+--------+--------+    | schedules   |
|             +-------------+
v
+-----------------+

| role_permissions|
+--------+--------+

+-----------------+

| permissions     |
+-----------------+

```

---

## 9. Referential Integrity Rules

| From | To | On Delete |
|---|---|---|
| users.group_id | groups.id | RESTRICT |
| members.group_id | groups.id | RESTRICT |
| memberships.member_id | members.id | RESTRICT |
| memberships.user_id | users.id | SET NULL |
| ledger_entries.transaction_id | transactions.id | RESTRICT |
| ledger_entries.account_id | accounts.id | RESTRICT |
| contributions.member_id | members.id | RESTRICT |
| loans.member_id | members.id | RESTRICT |
| loan_schedules.loan_id | loans.id | CASCADE |
| attendance.meeting_id | meetings.id | CASCADE |
| votes.resolution_id | resolutions.id | CASCADE |
| audit_logs.user_id | users.id | SET NULL |

**Financial records never cascade-delete.** Use soft delete + status flags.

---

## 10. Multi-Tenancy Note

Every business table carries `group_id` even when it could be inferred.
This is intentional:

1. Simplifies row-level security policies
2. Makes `WHERE group_id = ?` the default filter everywhere
3. Allows future sharding by group without schema changes

**Rule:** Every query in the API layer MUST include `group_id = :current_group`
except for tables explicitly marked global (`permissions`).
