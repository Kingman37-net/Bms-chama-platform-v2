# Contributions API

> Base: `/v1/contributions`

A contribution is a member's payment toward a contribution plan
(e.g. monthly savings). It always produces a balanced transaction:

```

Dr Cash (1000/1010/1020)       amount
Cr Member Savings (2000)              amount

```

---

## GET /v1/contributions

List contributions.

**Permission:** `contributions.read`
**Query params:** `member_id`, `plan_id`, `status`, `period_label`, `from`, `to`, `page`, `per_page`

**Response 200:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "con_01H...",
      "member_id": "mem_01H...",
      "member_name": "Alice Wanjiru",
      "plan_id": "cpp_monthly",
      "plan_name": "Monthly Savings",
      "amount_minor": 500000,
      "currency": "KES",
      "contribution_date": "2026-10-01",
      "period_label": "2026-10",
      "status": "posted",
      "receipt_number": "RCT-2026-00123",
      "transaction_id": "txn_01H..."
    }
  ],
  "meta": { "page": 1, "per_page": 20, "total": 1, "pages": 1 }
}
```

Scoping rules:

· Member role: forces member_id = self
· Treasurer/Chairperson/Auditor: full list

---

GET /v1/contributions/:id

Permission: contributions.read OR owner

---

POST /v1/contributions

Record a contribution.

Permission: contributions.create
Idempotency-Key: required

Request:

```json
{
  "member_id": "mem_01H...",
  "plan_id": "cpp_monthly",
  "amount_minor": 500000,
  "currency": "KES",
  "contribution_date": "2026-10-01",
  "period_label": "2026-10",
  "payment_reference": "MPESA-QJ87HX2P",
  "notes": "October savings"
}
```

Response 201:

```json
{
  "ok": true,
  "data": {
    "contribution_id": "con_01H...",
    "transaction_id": "txn_01H...",
    "receipt_number": "RCT-2026-00124",
    "status": "posted"
  }
}
```

Side effects (in a single DB transaction):

1. Insert contributions row (status pending)
2. Insert transactions row (state created)
3. Insert two ledger_entries:
   · Dr acc_1000 (or 1010/1020 by method)
   · Cr acc_2000 (Member Savings), with member_id
4. Update transactions.state = 'posted', posted_at = now
5. Update contributions.status = 'posted', link transaction_id, generate receipt_number
6. Insert audit_logs row
7. Queue notifications row (in-app + SMS if configured)

Errors:

· 404 NOT_FOUND — member or plan missing
· 422 BUSINESS_RULE — plan inactive, amount below minimum
· 409 CONFLICT — same (member_id, period_label, plan_id) already posted

---

POST /v1/contributions/bulk

Record multiple contributions in one call.

Permission: contributions.create
Idempotency-Key: required

Request:

```json
{
  "items": [
    { "member_id": "mem_01", "plan_id": "cpp_monthly", "amount_minor": 500000, "contribution_date": "2026-10-01", "period_label": "2026-10" },
    { "member_id": "mem_02", "plan_id": "cpp_monthly", "amount_minor": 500000, "contribution_date": "2026-10-01", "period_label": "2026-10" }
  ]
}
```

Response 201 with per-item results.

Behaviour: all-or-nothing. Any failure rolls back the entire batch.

---

POST /v1/contributions/:id/reverse

Reverse a posted contribution (creates a reversal transaction).

Permission: transactions.reverse

Request:

```json
{ "reason": "Duplicate entry" }
```

Response 201:

```json
{
  "ok": true,
  "data": {
    "reversal_transaction_id": "txn_01H_rev...",
    "original_transaction_id": "txn_01H...",
    "new_contribution_status": "reversed"
  }
}
```

Side effects:

· Create new transaction with reverses = original_txn_id
· Ledger entries flip: Dr acc_2000 / Cr acc_1000
· Original transaction: state = 'reversed', reversed_by = new_txn_id
· Original contribution: status = 'reversed'
· Audit log

---

GET /v1/contributions/summary

Aggregated view.

Permission: contributions.read

Query params: member_id (optional), period_label, group_by=member|period|plan

Response 200:

```json
{
  "ok": true,
  "data": {
    "total_minor": 12500000,
    "count": 25,
    "breakdown": [
      { "member_id": "mem_01", "member_name": "Alice", "total_minor": 500000 },
      { "member_id": "mem_02", "member_name": "Bob",   "total_minor": 500000 }
    ]
  }
}
```

---

Field Reference

Field Type Notes
amount_minor int 0
currency string ISO 4217
contribution_date date YYYY-MM-DD
period_label string e.g. "2026-10"
payment_reference string external ref (M-Pesa code, bank ref)
receipt_number string generated on post
status enum pending, posted, reversed

---

Business Rules

1. A member may not have two posted contributions with the same (plan_id, period_label).
2. Contributions cannot be created for a member with status IN ('exited','deceased').
3. Amounts must be positive integers.
4. Backdated contributions beyond 90 days require transactions.reverse permission (audit will flag).
5. Reversals never delete — they create an offsetting transaction.

---

Permission Matrix

Endpoint Required permission
GET /contributions contributions.read
GET /contributions/:id contributions.read OR owner
POST /contributions contributions.create
POST /contributions/bulk contributions.create
POST /contributions/:id/reverse transactions.reverse
GET /contributions/summary contributions.read

