# BODMAS CHAMAA — Backend Architecture

> **Version:** 0.1.0 (Phase 6A)
> **Status:** Blueprint

---

## 1. Technology Choices

| Layer | V1 (target) | Alternative |
|---|---|---|
| Runtime | Cloudflare Workers | Node.js (Fastify / Express) |
| Language | TypeScript | JavaScript |
| Database | Cloudflare D1 (SQLite) | PostgreSQL |
| ORM | Drizzle | Prisma |
| Auth | JWT (short-lived) + refresh token | Session cookies |
| Password hashing | Argon2id | bcrypt (fallback) |
| Validation | Zod | Joi |
| Testing | Vitest | Jest |
| Deployment | Wrangler | Docker |

The backend must run **entirely serverless** in V1 to match the free-tier
deployment goal. Moving to PostgreSQL later should only require swapping the
database adapter, not rewriting business logic.

---

## 2. Module Boundaries

Each module has three layers:

```

+-------------------------------+

|  routes/       HTTP handlers  |
+-------------------------------+

|  services/     Business logic |
+-------------------------------+

|  repositories/ Data access    |
+-------------------------------+

```

**Rules:**
- Routes NEVER touch the database directly — always via services.
- Services NEVER read HTTP request objects — always via plain data.
- Repositories NEVER contain business rules.

### Modules

```

api/
├── auth/            Login, register, refresh, logout, password reset
├── members/         Member records, status, roles
├── accounts/        Chart of accounts, derived balances
├── contributions/   Contribution plans and entries
├── loans/           Loan applications, schedules, repayments
├── investments/     Portfolio, projects, assets
├── transactions/    Ledger operations (create, post, reverse)
├── payments/        Provider adapters, webhooks, reconciliation
├── reports/         Financial and membership reports
├── notifications/   Email, SMS, in-app
├── documents/       Uploads, metadata, access control
└── audit/           Immutable event log (read-only)

```

---

## 3. Request Pipeline

Every request passes through middleware in this order:

```

1. Request ID       -> attach unique ID for tracing
2. CORS             -> enforce allowed origins per zone
3. Rate limit       -> per IP + per user
4. Auth             -> verify JWT, attach user to context
5. Authorization    -> check permission for route
6. Validation       -> parse + validate body/query with schema
7. Handler          -> route function
8. Response         -> standard JSON envelope
9. Error handler    -> catch-all, map to standard error shape
10. Audit log       -> write sensitive actions to audit_logs

```

---

## 4. Standard Response Envelope

**Success:**
```json
{
  "ok": true,
  "data": { ... },
  "meta": { "page": 1, "per_page": 20, "total": 143 }
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "MEMBER_NOT_FOUND",
    "message": "Member with ID BMS-0099 does not exist.",
    "details": null,
    "request_id": "req_01H..."
  }
}
```

Rule: HTTP status codes are always accurate. 400 for validation,
401 for unauthenticated, 403 for unauthorized, 404 for missing,
409 for conflicts, 422 for business rule violations, 500 for unexpected.

---

5. Authentication

Login flow

```
POST /api/v1/auth/login
  -> verify credentials (Argon2id)
  -> issue:
       access_token   (JWT, 15 min TTL)
       refresh_token  (opaque, 7 days TTL, stored in DB)
  -> audit log entry
```

Access token claims

```json
{
  "sub": "user_01H...",
  "member_id": "BMS-0001",
  "roles": ["member", "treasurer"],
  "permissions": ["contributions.read", "contributions.create", "..."],
  "iat": 1730000000,
  "exp": 1730000900,
  "iss": "bodmaschamaa.com",
  "aud": "bodmas-api"
}
```

Refresh flow

```
POST /api/v1/auth/refresh
  body: { refresh_token }
  -> rotate: issue new access + new refresh, revoke old refresh
```

Logout

```
POST /api/v1/auth/logout
  -> revoke current refresh token
  -> audit log entry
```

Password reset

```
POST /api/v1/auth/forgot-password
  -> if email exists: create single-use token, send email
  -> ALWAYS return 200 (no user enumeration)

POST /api/v1/auth/reset-password
  body: { token, new_password }
  -> verify token, set new hash, revoke all refresh tokens
```

---

6. Authorization — RBAC + Permissions

Roles are collections of permissions. Code checks permissions, never roles.

```
role:       treasurer
permissions: [
  "contributions.read",
  "contributions.create",
  "transactions.read",
  "transactions.create",
  "expenses.create",
  "expenses.approve",
  "loans.read",
  "loans.approve",
  "reports.read",
  "reports.export"
]
```

Route example:

```ts
app.post('/api/v1/contributions',
  requirePermission('contributions.create'),
  createContributionHandler);
```

Roles (V1):

· super_admin (all permissions)
· group_admin
· chairperson
· treasurer
· secretary
· auditor (read-only across finance)
· member (own data only)

Member-scoped routes additionally check req.user.member_id === target.member_id.

---

7. Error Codes (partial list)

Code HTTP Meaning
VALIDATION_FAILED 400 Schema validation failed
UNAUTHENTICATED 401 Missing or invalid token
PERMISSION_DENIED 403 Authenticated but lacks permission
NOT_FOUND 404 Resource missing
CONFLICT 409 Duplicate or state conflict
BUSINESS_RULE 422 Rule violation (e.g. loan exceeds limit)
RATE_LIMITED 429 Too many requests
INTERNAL_ERROR 500 Unhandled exception (never leak stack)

---

8. Logging

Structure: JSON, one line per event.

Required fields:

```
timestamp, level, request_id, user_id, member_id,
action, resource, resource_id, duration_ms, status
```

Rules:

· Never log: passwords, tokens, full card numbers, unmasked PII.
· Mask emails like jo***@example.com in non-audit logs.
· Full PII goes only to audit_logs (which itself is access-controlled).

---

9. Jobs & Scheduling

Some work must run outside requests:

Job Frequency Purpose
loan_due_reminder Daily 08:00 EAT Notify members of upcoming due dates
overdue_fines Daily 09:00 EAT Apply fines for missed contributions
payment_reconcile Every 15 min Match incoming payments to records
statement_generate Monthly 1st, 02:00 Produce statements for prior month
backup_snapshot Daily 01:00 EAT Encrypted database snapshot

V1: Cloudflare Cron Triggers. Later: dedicated scheduler.

---

10. What This Document Is NOT

· Not a database spec (see database/schema.md)
· Not an API reference (see api/*.md)
· Not a security policy (see security/*.md)
  EOF
