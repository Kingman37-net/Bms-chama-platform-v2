# BODMAS CHAMAA — System Architecture

> **Version:** 0.1.0 (Phase 6A)
> **Status:** Blueprint — no implementation yet
> **Last updated:** 2026-10-05

---

## 1. Purpose

This document describes the complete architecture of the BODMAS CHAMAA Digital System:
a mobile-first platform for managing group membership, savings, loans, investments,
governance, documents, and financial reporting.

The BODMAS implementation is intentionally designed as the first reference deployment
of a reusable group-finance platform (working name: **KDCN GroupOS**).

---

## 2. System Actors

| Actor | Description |
|---|---|
| **Visitor** | Unauthenticated user browsing the public website |
| **Member** | Authenticated member of BODMAS CHAMAA |
| **Official** | Chairperson, Treasurer, Secretary, Auditor |
| **Group Admin** | Operational administrator (not a governance role) |
| **Super Admin** | System-level administrator |
| **Payment Provider** | M-Pesa, Bank, future PSPs (external) |
| **System** | Automated processes (scheduler, reconciliation) |

---

## 3. Layered Architecture

```

+-------------------------------------------------------------+

|                         CLIENTS                             |

|  Public Website  |  Member Portal  |  Admin System          |

|  (static HTML)   |  (static HTML)  |  (static HTML)         |
+---------------------------|---------------------------------+

+---------------------------|---------------------------------+

|                         API LAYER                           |

|  Auth  |  Members  |  Contributions  |  Loans  |  ...      |
+---------------------------|---------------------------------+

|                      BUSINESS LOGIC                         |

|  Eligibility  |  Interest  |  Ledger  |  Reconciliation     |
+---------------------------|---------------------------------+

|                       DATA ACCESS                           |

|  Repositories  |  Transactions  |  Migrations              |
+---------------------------|---------------------------------+

|                        DATABASE                             |

|  Users | Members | Accounts | Transactions | Ledger | ...  |
+---------------------------|---------------------------------+

+---------------------------|---------------------------------+

|                     INTEGRATIONS                            |

|  M-Pesa  |  Bank  |  Email  |  SMS  |  Object Storage      |
+-------------------------------------------------------------+

```

---

## 4. Frontend Zones

The frontend is split into three independent zones, each with its own shell,
styles, and JavaScript. They share the same API but never share state directly.

### Zone 1: Public Website (`docs/`)

- Hosted on GitHub Pages
- Static HTML/CSS/JS only
- No secrets, no API keys, no member data
- Purpose: inform, build trust, funnel visitors toward membership and login

### Zone 2: Member Portal (`member/`)

- Requires authentication
- Purpose: personal dashboard, contributions, loans, statements, notifications
- Never exposes other members' data

### Zone 3: Admin System (`admin/`)

- Requires authentication + role authorization
- Purpose: operational management of members, finance, loans, governance
- Every action is audit-logged

---

## 5. Backend Services

The backend is organized into modules. Each module owns its data and exposes
a small API surface.

| Module | Responsibility |
|---|---|
| **auth** | Login, sessions, tokens, password reset, MFA |
| **members** | Membership records, status, roles |
| **accounts** | Chart of accounts, balances |
| **contributions** | Contribution plans and entries |
| **loans** | Applications, schedules, repayments, guarantors |
| **investments** | Portfolio, projects, assets, returns |
| **transactions** | Double-entry ledger operations |
| **payments** | Provider adapters, reconciliation |
| **reports** | Generated financial and membership reports |
| **notifications** | Email, SMS, in-app |
| **documents** | File uploads, storage, access control |
| **audit** | Immutable event log |

---

## 6. Data Flow — Record a Contribution

```

Admin (Treasurer)

[POST /api/v1/contributions]

[Validate]  <-- member exists, plan active, amount > 0

[Create Transaction]  (state = created)

[Create Ledger Entries]   Dr Cash / Cr Member Savings

[Post Transaction]  (state = posted)

[Update Account Balances]  (derived, not authoritative)

[Emit Event]  -> notifications, reports, audit log

Response 201 Created

```

**Key principle:** Balances are always derived from ledger entries.
Never trust a manually edited "balance" field as the source of truth.

---

## 7. Financial Model — Double-Entry Ledger

Every financial event produces balanced journal entries.

Example — Member contributes KSh 5,000 cash:

| Account | Debit | Credit |
|---|---|---|
| Cash (asset) | 5,000 | |
| Member Savings (liability) | | 5,000 |

Example — Member repays a loan installment of KSh 5,500 (KSh 5,000 principal + KSh 500 interest):

| Account | Debit | Credit |
|---|---|---|
| Cash (asset) | 5,500 | |
| Loans Receivable (asset) | | 5,000 |
| Interest Income | | 500 |

**Invariant:** For every transaction, `SUM(debits) = SUM(credits)`.

The database enforces this with constraints and triggers (Phase 6B).

---

## 8. Transaction Lifecycle

```

created --> validated --> approved --> posted --> reconciled

```

**Rules:**
- Posted transactions are immutable.
- Corrections are made via a **reversal transaction** that references the original.
- The original transaction keeps `status = 'reversed'` and is never deleted.
- Every state change is written to `audit_logs`.

---

## 9. Environments

| Env | Domain | Purpose |
|---|---|---|
| Development | `dev.bodmaschamaa.com` | Feature work |
| Staging | `staging.bodmaschamaa.com` | Pre-production testing |
| Production | `bodmaschamaa.com` | Live system |

Separate databases for each environment. Never share credentials.

---

## 10. Deployment Topology (target)

```

+---------------+              +------------------+

| Cloudflare    |              |  Workers API     |

| Pages         |              |  (auth, biz,     |

| (static site) |              |   ledger, etc.)  |
+---------------+              +---------+--------+

```

GitHub Pages continues serving the **public website** during V1.
Once Phase 9 (production) arrives, the whole site moves behind Cloudflare.

---

## 11. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Mobile-first | 100% functionality on 360px-wide screens |
| Page load (public) | < 1.5s on 3G |
| API response (p95) | < 400ms |
| Availability | 99.5% monthly |
| Backup frequency | Daily automated; hourly for financial data |
| Audit retention | 7 years (financial records) |
| PII encryption | At rest and in transit |
| Currency precision | Integer minor units (cents) — never float |

---

## 12. What This Document Is NOT

- Not an implementation guide (that's `backend.md`)
- Not a database spec (that's `database/schema.md`)
- Not an API reference (that's `api/*.md`)
- Not a security policy (that's `security/*.md`)

Each of those extends this one.
