# BODMAS CHAMAA — Access Control

> **Version:** 0.1.0 (Phase 6D)

---

## 1. Principle

Authorization is **permission-based**, not role-based.
Roles are containers; the code only ever checks permissions.

```ts
// Do this
requirePermission('contributions.create')

// Never this
requireRole('treasurer')
```

Reason: role definitions change. Permissions are stable.

---

2. Permission Catalogue (V1)

43 permissions across 11 resources.

Members (members.*)

Code Purpose
members.read View member records
members.create Add members
members.update Update members
members.delete Deactivate members
memberships.approve Approve membership applications

Contributions (contributions.*)

Code Purpose
contributions.read View contributions
contributions.create Record contributions
contributions.approve Approve contributions

Transactions (transactions.*)

Code Purpose
transactions.read View transactions
transactions.create Create draft transactions
transactions.post Post to ledger
transactions.reverse Reverse posted transactions

Expenses (expenses.*)

Code Purpose
expenses.read View expenses
expenses.create Record expenses
expenses.approve Approve expenses

Income (income.*)

Code Purpose
income.read View income
income.create Record income

Loans (loans.*)

Code Purpose
loans.read View loans
loans.create Create loan applications
loans.approve Approve loans
loans.disburse Disburse loans
loans.repay Record repayments

Investments (investments.*)

Code Purpose
investments.read View investments
investments.create Create investments
investments.update Update investments

Reports (reports.*)

Code Purpose
reports.read View reports
reports.export Export reports

Governance (meetings.*, resolutions.*)

Code Purpose
meetings.read View meetings
meetings.create Create meetings
meetings.manage Manage attendance, minutes
resolutions.manage Manage resolutions and votes

Documents (documents.*)

Code Purpose
documents.read View documents
documents.upload Upload documents
documents.manage Manage access and versions

Notifications (notifications.*)

Code Purpose
notifications.read View own notifications
notifications.send Send notifications

Audit (audit.read)

Code Purpose
audit.read Read audit log

Settings (settings.*)

Code Purpose
settings.read View settings
settings.manage Manage system settings

Users / Roles (users.manage, roles.manage)

Code Purpose
users.manage Manage user accounts
roles.manage Manage roles and permissions

Payments (payments.*)

Code Purpose
payments.read View payment transactions
payments.reconcile Reconcile payments

---

3. Roles → Permissions

Role Permissions
super_admin ALL 43
group_admin members.read/create/update, memberships.approve, meetings.read/manage, documents.read/upload/manage, notifications.read/send, reports.read, settings.read, users.manage
chairperson members.read, loans.read/approve, expenses.read/approve, reports.read/export, meetings.read/manage, resolutions.manage, documents.read
treasurer members.read, contributions.read/create/approve, transactions.read/create/post, expenses.read/create, income.read/create, loans.read/repay, investments.read, reports.read/export, payments.read/reconcile
secretary members.read/create/update, meetings.read/manage, resolutions.manage, documents.read/upload, notifications.read/send
auditor members.read, contributions.read, transactions.read, expenses.read, income.read, loans.read, investments.read, reports.read/export, audit.read
member contributions.read (own), transactions.read (own), loans.read (own), investments.read, meetings.read, documents.read, notifications.read, reports.read

---

4. Row-Level Scoping

Permissions grant capability. Row-level rules grant scope.

Rule: group_id scoping

Every query MUST be filtered by group_id = current_user.group_id.

Rule: member scoping

If the user has only the member role, all queries on
contributions, loans, transactions, notifications are additionally
filtered by member_id = current_user.member_id.

Rule: financial ownership

Read endpoints on contributions, loans, statements enforce:

```ts
if (user.hasRole('member') && !user.hasAnyRole(['treasurer','chairperson','auditor','group_admin','super_admin'])) {
  query.member_id = user.member_id;
}
```

Rule: session ownership

GET /auth/sessions returns only the current user's sessions.
Deleting another user's session requires users.manage.

---

5. Two-Person Rule (recommended for V2)

Certain actions require a second approver:

Action Threshold
Expense ≥ KSh 100,000
Loan disbursement ≥ KSh 500,000
Manual ledger adjustment Any amount
Member exit with balance Any amount

Implement via transactions.state: create approved_by, then a second
user with transactions.post completes.

V1: single-approver. Documented for V2.

---

6. Permission Check Layers

Every protected route passes through four gates:

1. Middleware: verify JWT → attach user
2. Route decorator: requirePermission('X')
3. Handler: row-level scoping (group_id, member_id)
4. Service: business-rule checks (e.g. cannot approve own loan)

Failing gate 1 → 401. Failing 2 → 403. Failing 3 or 4 → 404 or 422.

---

7. Deny-by-Default

· New routes have no access until a permission is explicitly attached.
· New roles have no permissions until assigned.
· New tables default to unreachable without an API endpoint.

---

8. Role Assignment Rules

· Only users with roles.manage may assign roles.
· A user cannot assign a role they do not themselves hold (no privilege escalation).
· Only super_admin may grant super_admin.
· Cannot remove the last super_admin from the system.
· Cannot remove treasurer from a group with financial activity without a replacement.
· All role changes write audit_logs + security_events (permission.change).

---

9. Sensitive Operations

These operations always require:

1. A valid permission
2. A fresh access token (issued < 5 minutes ago)
3. An audit_logs row with severity = 'critical'

· Deleting a document
· Reversing a posted transaction
· Changing a role
· Disabling MFA
· Changing group settings
· Bulk member suspension

---

10. Frontend Hiding ≠ Authorization

Frontend may hide buttons based on permissions. This is UX only.
The backend is the sole authority. Every endpoint independently verifies.

Rule: never trust a client-claimed role or permission.

---

11. Testing Access Control

Every PR touching auth/authorization must add tests covering:

· Happy path with correct permission
· Missing permission → 403
· Wrong scope (member accessing another's data) → 404
· Role escalation attempt → 403
· Expired token → 401
· Revoked session → 401

Coverage target: 100% of route decorators.

---

12. What This Document Is NOT

· Not a security policy (see security-model.md)
· Not an audit spec (see audit.md)
