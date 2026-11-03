# Investments API

> Base: `/v1/investments`

---

## GET /v1/investments

List investments.

**Permission:** `investments.read`

**Query params:** `status`, `category`, `page`, `per_page`

**Response 200:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "inv_01H...",
      "name": "Bamburi Plot",
      "category": "land",
      "initial_capital_minor": 200000000,
      "current_value_minor": 250000000,
      "currency": "KES",
      "status": "active",
      "started_on": "2025-03-01"
    }
  ],
  "meta": { "page": 1, "per_page": 20, "total": 1, "pages": 1 }
}
```

---

GET /v1/investments/:id

Detail with assets + transaction history.

Permission: investments.read

---

POST /v1/investments

Create an investment.

Permission: investments.create

Request:

```json
{
  "name": "Bamburi Plot",
  "category": "land",
  "description": "1-acre plot in Bamburi",
  "initial_capital_minor": 200000000,
  "current_value_minor": 200000000,
  "currency": "KES",
  "started_on": "2025-03-01"
}
```

Response 201

No ledger impact at creation.

---

PATCH /v1/investments/:id

Permission: investments.update

---

POST /v1/investments/:id/transactions

Record a capital movement, income or expense.

Permission: investments.create
Idempotency-Key: required

Request:

```json
{
  "txn_type": "capital_in",
  "amount_minor": 5000000,
  "occurred_at": "2026-10-05",
  "notes": "Additional capital from savings"
}
```

txn_type enum: capital_in, capital_out, income, expense, revaluation.

Response 201 with transaction_id when a ledger entry was created.

Ledger mapping:

txn_type debit credit
capital_in 1200 Investments 1000/1010 Cash
capital_out 1000/1010 Cash 1200 Investments
income 1000/1010 Cash 4200 Investment Income
expense 5000 Operating Expenses 1000/1010 Cash
revaluation 1200 Investments 3000 Retained Surplus (or reverse)

---

POST /v1/investments/:id/assets

Add an asset.

Permission: investments.create

Request:

```json
{
  "name": "Title Deed CR-12345",
  "asset_type": "land_title",
  "purchase_date": "2025-03-01",
  "purchase_price_minor": 200000000,
  "current_value_minor": 250000000,
  "location": "Bamburi, Mombasa",
  "title_deed_ref": "CR-12345"
}
```

---

GET /v1/investments/summary

Portfolio summary.

Permission: investments.read

Response 200:

```json
{
  "ok": true,
  "data": {
    "total_initial_minor": 200000000,
    "total_current_minor": 250000000,
    "total_gain_minor": 50000000,
    "by_category": [
      { "category": "land", "count": 1, "current_value_minor": 250000000 }
    ]
  }
}
```

---

Permission Matrix

Endpoint Permission
GET /investments investments.read
GET /investments/:id investments.read
POST /investments investments.create
PATCH /investments/:id investments.update
POST /investments/:id/transactions investments.create
POST /investments/:id/assets investments.create
GET /investments/summary investments.read

