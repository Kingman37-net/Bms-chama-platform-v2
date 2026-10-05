# Payments API

> Base: `/v1/payments`

Handles incoming payments from M-Pesa, banks, and other providers,
plus reconciliation against the ledger.

---

## GET /v1/payments/transactions

List raw payment transactions.

**Permission:** `payments.read`

**Query params:** `status`, `provider`, `from`, `to`, `page`, `per_page`

**Response 200:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "ptx_01H...",
      "provider": "mpesa",
      "provider_ref": "QJ87HX2PQ1",
      "amount_minor": 500000,
      "currency": "KES",
      "payer_phone": "+254712***78",
      "payer_name": "ALICE W",
      "paid_at": "2026-10-01T08:14:00.000Z",
      "status": "matched",
      "matched_member_id": "mem_01H...",
      "matched_transaction_id": "txn_01H..."
    }
  ],
  "meta": { "page": 1, "per_page": 20, "total": 1, "pages": 1 }
}
```

---

POST /v1/payments/webhooks/:provider

Public webhook endpoint. No auth token — verified by signature.

Providers: mpesa, bank.

Behaviour:

1. Verify signature / IP allowlist per provider
2. Check (provider, provider_ref) uniqueness → if duplicate, return 200 and ignore
3. Insert payment_transactions row (status = 'received')
4. Attempt auto-match against open contribution periods by payer phone
5. If matched → create + post contribution transaction
6. Otherwise mark as unmatched for manual review
7. Write audit_logs row

Response 200 (always; do not fail webhooks):

```json
{ "ok": true, "data": { "status": "received" } }
```

Security:

· Idempotency enforced via UNIQUE on (provider, provider_ref)
· Reject payloads older than 24h
· Rate-limit per IP

---

POST /v1/payments/transactions/:id/match

Manually match an unmatched payment to a member + purpose.

Permission: payments.reconcile

Request:

```json
{
  "member_id": "mem_01H...",
  "purpose": "contribution",
  "plan_id": "cpp_monthly",
  "period_label": "2026-10"
}
```

Response 201 with created contribution_id + transaction_id.

---

POST /v1/payments/transactions/:id/reject

Mark a payment as invalid (test payment, wrong paybill, etc.).

Permission: payments.reconcile
Request: { "reason": "Test payment" }

---

GET /v1/payments/accounts

List group payment accounts.

Permission: payments.read

---

POST /v1/payments/accounts

Create a payment account.

Permission: settings.manage

Request:

```json
{
  "provider": "mpesa",
  "display_name": "BODMAS M-Pesa Paybill",
  "account_number": "400200",
  "account_name": "BODMAS CHAMAA"
}
```

Note: provider secrets live in environment variables, not in this table.

---

Reconciliation

GET /v1/payments/reconciliation

List reconciliation runs.

Permission: payments.read

POST /v1/payments/reconciliation

Start a reconciliation for a period.

Permission: payments.reconcile

Request:

```json
{
  "period_start": "2026-10-01",
  "period_end": "2026-10-31",
  "account_id": "acc_1020"
}
```

Response 201:

```json
{
  "ok": true,
  "data": {
    "reconciliation_id": "rec_01H...",
    "opening_minor": 0,
    "closing_minor": 25000000,
    "expected_minor": 25000000,
    "difference_minor": 0,
    "status": "balanced"
  }
}
```

Rules:

· expected_minor is derived from ledger entries for the account in the period
· closing_minor comes from the provider statement upload (or manual entry)
· Status: balanced if diff = 0, otherwise discrepancy

PATCH /v1/payments/reconciliation/:id

Update with notes or resolve a discrepancy.

Permission: payments.reconcile

---

Permission Matrix

Endpoint Permission
GET /payments/transactions payments.read
POST /payments/webhooks/:provider public (signature verified)
POST /payments/transactions/:id/match payments.reconcile
POST /payments/transactions/:id/reject payments.reconcile
GET /payments/accounts payments.read
POST /payments/accounts settings.manage
GET /payments/reconciliation payments.read
POST /payments/reconciliation payments.reconcile
PATCH /payments/reconciliation/:id payments.reconcile

