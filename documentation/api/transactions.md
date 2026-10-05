# Transactions API

> Base: `/v1/transactions`

A transaction is a journal header. Every financial event in the system
produces exactly one transaction and ≥ 2 ledger entries summing to zero.

## Transaction Lifecycle

```

created --> validated --> approved --> posted --> reconciled

```

- `created`: draft; ledger entries may be added freely
- `validated`: business rules passed
- `approved`: awaiting post (2-person rule for large amounts)
- `posted`: ledger is final; entries immutable
- `reconciled`: matched to bank/M-Pesa statement
- `reversed`: original was undone by a reversal txn

---

## GET /v1/transactions

List transactions.

**Permission:** `transactions.read`
**Query params:** `state`, `type`, `from`, `to`, `member_id`, `account_id`, `page`, `per_page`

**Response 200:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "txn_01H...",
      "reference": "TXN-2026-000123",
      "description": "Alice contribution KSh 5,000",
      "transaction_type": "contribution",
      "state": "posted",
      "posted_at": "2026-10-05T08:14:00.000Z",
      "created_at": "2026-10-05T08:13:50.000Z",
      "entries": 2
    }
  ],
  "meta": { "page": 1, "per_page": 20, "total": 1, "pages": 1 }
}
```

---

GET /v1/transactions/:id

Get one transaction with ledger entries.

Permission: transactions.read

Response 200:

```json
{
  "ok": true,
  "data": {
    "id": "txn_01H...",
    "reference": "TXN-2026-000123",
    "description": "Alice contribution KSh 5,000",
    "transaction_type": "contribution",
    "state": "posted",
    "posted_at": "2026-10-05T08:14:00.000Z",
    "reverses": null,
    "reversed_by": null,
    "entries": [
      { "account_code": "1000", "account_name": "Cash on Hand", "debit_minor": 500000, "credit_minor": 0, "member_id": "mem_01H..." },
      { "account_code": "2000", "account_name": "Member Savings", "debit_minor": 0, "credit_minor": 500000, "member_id": "mem_01H..." }
    ]
  }
}
```

---

POST /v1/transactions

Create a draft transaction (does not post).

Permission: transactions.create
Idempotency-Key: required

Request:

```json
{
  "reference": "TXN-2026-000124",
  "description": "Manual adjustment",
  "transaction_type": "adjustment",
  "entries": [
    { "account_code": "1000", "debit_minor": 100000, "credit_minor": 0, "member_id": null },
    { "account_code": "3000", "debit_minor": 0, "credit_minor": 100000, "member_id": null }
  ]
}
```

Response 201:

```json
{
  "ok": true,
  "data": {
    "transaction_id": "txn_01H...",
    "state": "created"
  }
}
```

Validation:

· ≥ 2 entries
· Each entry has exactly one side (debit XOR credit)
· SUM(debits) = SUM(credits)
· All accounts belong to the group

---

POST /v1/transactions/:id/post

Post a draft transaction to the ledger.

Permission: transactions.post

Response 200:

```json
{ "ok": true, "data": { "state": "posted", "posted_at": "2026-10-05T08:14:00.000Z" } }
```

Rules enforced by DB trigger:

· At least 2 entries
· Balanced
· Cannot post twice

Side effects: update state to posted; write audit_logs; fire reconciliation hooks.

---

POST /v1/transactions/:id/reverse

Reverse a posted transaction.

Permission: transactions.reverse

Request: { "reason": "Duplicate entry" }

Response 201:

```json
{
  "ok": true,
  "data": {
    "reversal_transaction_id": "txn_01H_rev...",
    "original_transaction_id": "txn_01H...",
    "original_state": "reversed"
  }
}
```

Side effects:

· New transaction with reverses = original.id, entries flipped
· Original transaction: state = 'reversed', reversed_by = new.id
· audit_logs row with severity = 'warning'

---

GET /v1/accounts

List chart of accounts.

Permission: transactions.read

Response 200:

```json
{
  "ok": true,
  "data": [
    { "id": "acc_1000", "code": "1000", "name": "Cash on Hand", "type": "asset" },
    { "id": "acc_2000", "code": "2000", "name": "Member Savings", "type": "liability" }
  ]
}
```

---

GET /v1/accounts/:code/balance

Derive balance from ledger entries.

Permission: transactions.read
Query params: as_of (ISO date; default = now)

Response 200:

```json
{
  "ok": true,
  "data": {
    "account_code": "1000",
    "name": "Cash on Hand",
    "as_of": "2026-10-05T23:59:59.999Z",
    "debit_total_minor": 12500000,
    "credit_total_minor": 3250000,
    "balance_minor": 9250000,
    "normal_side": "debit"
  }
}
```

Balance formula:

· Asset / Expense: balance = debits − credits
· Liability / Equity / Income: balance = credits − debits

---

GET /v1/accounts/:code/ledger

Paginated ledger entries for one account.

Permission: transactions.read
Query params: from, to, cursor, limit

---

GET /v1/ledger/trial-balance

Trial balance snapshot.

Permission: reports.read

Response 200:

```json
{
  "ok": true,
  "data": {
    "as_of": "2026-10-05T23:59:59.999Z",
    "rows": [
      { "code": "1000", "name": "Cash on Hand", "debit_minor": 12500000, "credit_minor": 3250000 },
      { "code": "2000", "name": "Member Savings", "debit_minor": 0, "credit_minor": 9250000 }
    ],
    "total_debit_minor": 12500000,
    "total_credit_minor": 12500000,
    "balanced": true
  }
}
```

---

Permission Matrix

Endpoint Permission
GET /transactions transactions.read
GET /transactions/:id transactions.read
POST /transactions transactions.create
POST /transactions/:id/post transactions.post
POST /transactions/:id/reverse transactions.reverse
GET /accounts transactions.read
GET /accounts/:code/balance transactions.read
GET /accounts/:code/ledger transactions.read
GET /ledger/trial-balance reports.read

