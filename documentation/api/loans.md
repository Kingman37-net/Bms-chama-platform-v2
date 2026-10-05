# Loans API

> Base: `/v1/loans`

## Loan Lifecycle

```

draft --> submitted --> under_review --> approved --> disbursed --> active

```

---

## GET /v1/loans

List loans.

**Permission:** `loans.read` (member-scoped if role is member)

**Query params:** `member_id`, `status`, `from`, `to`, `page`, `per_page`

**Response 200:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "lon_01H...",
      "reference": "LN-2026-0001",
      "member_id": "mem_01H...",
      "member_name": "Alice Wanjiru",
      "product_name": "Emergency Loan",
      "principal_minor": 500000,
      "outstanding_minor": 425000,
      "currency": "KES",
      "status": "active",
      "next_due_date": "2026-11-05"
    }
  ],
  "meta": { "page": 1, "per_page": 20, "total": 1, "pages": 1 }
}
```

---

GET /v1/loans/:id

Loan detail with schedule + guarantors.

Permission: loans.read OR owner

Response 200:

```json
{
  "ok": true,
  "data": {
    "id": "lon_01H...",
    "reference": "LN-2026-0001",
    "member_id": "mem_01H...",
    "principal_minor": 500000,
    "interest_rate_bps": 1500,
    "interest_method": "reducing_balance",
    "term_months": 6,
    "total_payable_minor": 550000,
    "amount_paid_minor": 125000,
    "outstanding_minor": 425000,
    "status": "active",
    "disbursed_at": "2026-10-05T00:00:00.000Z",
    "next_due_date": "2026-11-05",
    "schedule": [
      { "installment_no": 1, "due_date": "2026-11-05", "principal_minor": 80000, "interest_minor": 12500, "total_due_minor": 92500, "paid_minor": 92500, "status": "paid" },
      { "installment_no": 2, "due_date": "2026-12-05", "principal_minor": 80000, "interest_minor": 10000, "total_due_minor": 90000, "paid_minor": 0, "status": "pending" }
    ],
    "guarantors": [
      { "member_id": "mem_02H...", "member_name": "Bob", "guaranteed_minor": 250000, "status": "active" }
    ]
  }
}
```

---

POST /v1/loans

Create a loan application.

Permission: loans.create
Idempotency-Key: required

Request:

```json
{
  "member_id": "mem_01H...",
  "product_id": "lnp_emergency",
  "principal_minor": 500000,
  "term_months": 6,
  "guarantors": [
    { "member_id": "mem_02H...", "guaranteed_minor": 250000 },
    { "member_id": "mem_03H...", "guaranteed_minor": 250000 }
  ],
  "notes": "Medical emergency"
}
```

Response 201:

```json
{
  "ok": true,
  "data": {
    "loan_id": "lon_01H...",
    "reference": "LN-2026-0001",
    "status": "submitted"
  }
}
```

Eligibility checks:

· Member is active, joined ≥ eligibility_months ago
· No active defaulted loan
· Principal within product min/max
· Guarantors are active members with sufficient free balance

---

POST /v1/loans/:id/approve

Approve and generate schedule + disbursement.

Permission: loans.approve

Request:

```json
{
  "approved_amount_minor": 500000,
  "notes": "Approved by committee"
}
```

Response 200:

```json
{
  "ok": true,
  "data": {
    "loan_id": "lon_01H...",
    "status": "approved",
    "schedule_created": 6,
    "total_payable_minor": 550000
  }
}
```

Side effects:

· Generate loan_schedules rows
· Update loan: status = 'approved', approved_at, approved_by
· Audit log

No ledger impact yet. Disbursement creates the ledger transaction.

---

POST /v1/loans/:id/reject

Permission: loans.approve
Request: { "reason": "Insufficient guarantors" }

---

POST /v1/loans/:id/disburse

Disburse an approved loan.

Permission: loans.disburse
Idempotency-Key: required

Request: { "method": "mpesa", "reference": "MPESA-XY123ABC" }

Response 201:

```json
{
  "ok": true,
  "data": {
    "loan_id": "lon_01H...",
    "status": "active",
    "transaction_id": "txn_01H...",
    "next_due_date": "2026-11-05"
  }
}
```

Ledger impact:

```
Dr 1100 Loans Receivable   500000
Cr 1000/1010/1020 Cash             500000
```

Side effects:

· Insert transactions + 2 ledger_entries
· Post transaction
· Update loan: status = 'active', disbursed_at, disbursement_transaction_id
· Audit log

---

POST /v1/loans/:id/repay

Record a repayment.

Permission: loans.repay
Idempotency-Key: required

Request:

```json
{
  "amount_minor": 92500,
  "principal_minor": 80000,
  "interest_minor": 12500,
  "penalty_minor": 0,
  "repaid_at": "2026-11-03",
  "payment_method": "mpesa",
  "payment_reference": "MPESA-QR8X9Y2P"
}
```

Response 201:

```json
{
  "ok": true,
  "data": {
    "repayment_id": "lnr_01H...",
    "transaction_id": "txn_01H...",
    "schedule_updated": [1],
    "loan_outstanding_minor": 425000,
    "receipt_number": "RCT-LN-2026-0001-01"
  }
}
```

Ledger impact:

```
Dr 1000/1010/1020 Cash              92500
Cr 1100 Loans Receivable                    80000
Cr 4100 Loan Interest Income                12500
```

Side effects:

· Insert loan_repayments row
· Insert + post transaction
· Allocate payment across schedule (oldest installment first)
· Update loan_schedules.paid_minor, status
· Update loans.amount_paid_minor, outstanding_minor, next_due_date
· If outstanding = 0 → status = 'completed'
· Audit log

---

GET /v1/loans/:id/statement

Download loan statement (PDF/CSV).

Permission: loans.read OR owner

---

GET /v1/loans/products

List loan products.

Permission: loans.read

---

Permission Matrix

Endpoint Permission
GET /loans loans.read
GET /loans/:id loans.read OR owner
POST /loans loans.create
POST /loans/:id/approve loans.approve
POST /loans/:id/reject loans.approve
POST /loans/:id/disburse loans.disburse
POST /loans/:id/repay loans.repay
GET /loans/:id/statement loans.read OR owner
GET /loans/products loans.read

