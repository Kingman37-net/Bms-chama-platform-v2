# Reports API

> Base: `/v1/reports`

Reports are read-only, derived from the ledger and business tables.
Every report can be exported as `json`, `csv` or `pdf`.

Common query params:
- `from` (ISO date, inclusive)
- `to` (ISO date, inclusive)
- `format` = `json` | `csv` | `pdf` (default `json`)
- `group_by` = `day` | `week` | `month` | `year` (where applicable)

---

## GET /v1/reports/financial/summary

Group financial snapshot for a period.

**Permission:** `reports.read`

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "from": "2026-10-01",
    "to": "2026-10-31",
    "currency": "KES",
    "income_minor": 2500000,
    "expenses_minor": 800000,
    "net_minor": 1700000,
    "cash_position_minor": 12500000,
    "member_savings_minor": 9800000,
    "loans_outstanding_minor": 3200000,
    "investments_value_minor": 250000000
  }
}
```

---

GET /v1/reports/financial/income-statement

Profit & loss for a period.

Permission: reports.read

Response 200:

```json
{
  "ok": true,
  "data": {
    "from": "2026-01-01",
    "to": "2026-10-31",
    "income": [
      { "code": "4000", "name": "Contribution Income", "amount_minor": 8500000 },
      { "code": "4100", "name": "Loan Interest Income", "amount_minor": 450000 },
      { "code": "4200", "name": "Investment Income", "amount_minor": 1200000 }
    ],
    "total_income_minor": 10150000,
    "expenses": [
      { "code": "5000", "name": "Operating Expenses", "amount_minor": 650000 },
      { "code": "5100", "name": "Welfare Payments", "amount_minor": 300000 }
    ],
    "total_expenses_minor": 950000,
    "net_surplus_minor": 9200000
  }
}
```

---

GET /v1/reports/financial/balance-sheet

Assets / liabilities / equity as of a date.

Permission: reports.read
Query params: as_of

Response 200:

```json
{
  "ok": true,
  "data": {
    "as_of": "2026-10-31T23:59:59.999Z",
    "assets": [
      { "code": "1000", "name": "Cash on Hand", "balance_minor": 2500000 },
      { "code": "1010", "name": "Bank Account", "balance_minor": 10000000 },
      { "code": "1100", "name": "Loans Receivable", "balance_minor": 3200000 }
    ],
    "total_assets_minor": 15700000,
    "liabilities": [
      { "code": "2000", "name": "Member Savings", "balance_minor": 9800000 }
    ],
    "total_liabilities_minor": 9800000,
    "equity": [
      { "code": "3000", "name": "Retained Surplus", "balance_minor": 5900000 }
    ],
    "total_equity_minor": 5900000,
    "balanced": true
  }
}
```

---

GET /v1/reports/financial/trial-balance

Trial balance (debits = credits).

Permission: reports.read
Query params: as_of

---

GET /v1/reports/financial/cash-flow

Cash movements (inflow / outflow) for a period.

Permission: reports.read

---

GET /v1/reports/membership/summary

Membership counts + trends.

Permission: reports.read

Response 200:

```json
{
  "ok": true,
  "data": {
    "as_of": "2026-10-05",
    "total_members": 143,
    "by_status": { "active": 130, "suspended": 5, "exited": 8 },
    "new_this_month": 12,
    "new_this_year": 45,
    "by_gender": { "male": 60, "female": 80, "undisclosed": 3 }
  }
}
```

---

GET /v1/reports/membership/contributions

Contribution compliance report.

Permission: reports.read
Query params: period_label

Response 200:

```json
{
  "ok": true,
  "data": {
    "period_label": "2026-10",
    "expected_count": 143,
    "paid_count": 128,
    "compliance_rate": 0.895,
    "total_expected_minor": 71500000,
    "total_collected_minor": 64000000,
    "defaulters": [
      { "member_id": "mem_04H...", "member_name": "Jane", "days_late": 5 }
    ]
  }
}
```

---

GET /v1/reports/loans/portfolio

Loan book summary.

Permission: reports.read

Response 200:

```json
{
  "ok": true,
  "data": {
    "as_of": "2026-10-31",
    "active_loans": 22,
    "disbursed_total_minor": 12500000,
    "outstanding_total_minor": 3200000,
    "interest_earned_minor": 450000,
    "overdue_loans": 2,
    "overdue_amount_minor": 185000,
    "defaulted_loans": 0,
    "average_loan_minor": 568182
  }
}
```

---

GET /v1/reports/loans/aging

Loan aging buckets (0-30, 31-60, 61-90, 90+ days).

Permission: reports.read

---

GET /v1/reports/investments/performance

Investment performance report.

Permission: reports.read

Response 200:

```json
{
  "ok": true,
  "data": {
    "as_of": "2026-10-31",
    "total_initial_minor": 200000000,
    "total_current_minor": 250000000,
    "total_gain_minor": 50000000,
    "gain_pct": 0.25,
    "by_category": [
      { "category": "land", "current_value_minor": 250000000, "gain_minor": 50000000 }
    ]
  }
}
```

---

GET /v1/reports/audit/summary

Audit activity summary.

Permission: audit.read

Query params: from, to, user_id, action

Response 200:

```json
{
  "ok": true,
  "data": {
    "from": "2026-10-01",
    "to": "2026-10-31",
    "total_events": 1432,
    "by_severity": { "info": 1420, "warning": 10, "critical": 2 },
    "by_action": [
      { "action": "contribution.create", "count": 500 },
      { "action": "loans.approve", "count": 22 }
    ]
  }
}
```

---

Response Formats

· format=json (default): structured JSON as shown above
· format=csv: RFC 4180 CSV with UTF-8 BOM
· format=pdf: generated server-side; Content-Type: application/pdf

For non-JSON formats, response body is the file; use Content-Disposition: attachment; filename="...".

---

Permission Matrix

Endpoint Permission
GET /reports/financial/* reports.read
GET /reports/membership/* reports.read
GET /reports/loans/* reports.read
GET /reports/investments/* reports.read
GET /reports/audit/summary audit.read
All with `format=csv pdf`

