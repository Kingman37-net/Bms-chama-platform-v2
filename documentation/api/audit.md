# Audit API

> Base: `/v1/audit`

Read-only access to the immutable audit trail. **No writes, no deletes.**
Audit rows are written automatically by the system, never by clients.

---

## GET /v1/audit/logs

List audit events.

**Permission:** `audit.read`

**Query params:**
- `user_id`
- `action` (exact match)
- `resource_type`
- `resource_id`
- `severity` (`info` | `warning` | `critical`)
- `from`, `to`
- `page`, `per_page` (max 100)

**Response 200:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "aud_01H...",
      "user_id": "usr_01H...",
      "user_name": "Jane Doe",
      "action": "contributions.create",
      "resource_type": "contributions",
      "resource_id": "con_01H...",
      "before_json": null,
      "after_json": "{\"amount_minor\":500000,\"member_id\":\"mem_01H...\"}",
      "ip_address": "41.90.xx.xx",
      "user_agent": "Mozilla/5.0...",
      "request_id": "req_01H...",
      "severity": "info",
      "created_at": "2026-10-01T08:14:00.000Z"
    }
  ],
  "meta": { "page": 1, "per_page": 50, "total": 1432, "pages": 29 }
}
```

---

GET /v1/audit/logs/:id

Fetch a single audit row (full before/after JSON).

Permission: audit.read

---

GET /v1/audit/logs/resource/:resource_type/:resource_id

Full history for a specific resource.

Permission: audit.read

Example:

```
GET /v1/audit/logs/resource/loans/lon_01H...
```

Response 200 (chronological, oldest first):

```json
{
  "ok": true,
  "data": [
    { "action": "loans.create",    "user_name": "Jane Doe", "created_at": "..." },
    { "action": "loans.approve",   "user_name": "Chair",    "created_at": "..." },
    { "action": "loans.disburse",  "user_name": "Treasurer","created_at": "..." },
    { "action": "loans.repay",     "user_name": "Treasurer","created_at": "..." }
  ]
}
```

---

GET /v1/audit/security-events

List security-related events.

Permission: audit.read

Query params: event_type, user_id, from, to, page, per_page

Event types:

· login.success
· login.failed
· logout
· password.change
· password.reset
· mfa.enable
· mfa.disable
· session.revoke
· permission.change
· account.lock

Response 200:

```json
{
  "ok": true,
  "data": [
    {
      "id": "sec_01H...",
      "event_type": "login.failed",
      "user_id": null,
      "email_attempted": "j***@bodmaschamaa.com",
      "ip_address": "41.90.xx.xx",
      "user_agent": "Mozilla/5.0...",
      "created_at": "2026-10-05T03:14:00.000Z"
    }
  ],
  "meta": { "page": 1, "per_page": 50, "total": 12, "pages": 1 }
}
```

---

GET /v1/audit/summary

Aggregated audit statistics.

Permission: audit.read

Query params: from, to, group_by (action | user | resource | day)

---

Export

Any audit endpoint supports format=csv:

```
GET /v1/audit/logs?from=2026-01-01&to=2026-10-05&format=csv
```

Returns RFC 4180 CSV with all columns (severity, action, user, resource, IP, timestamps, request ID). Streamed; not wrapped in JSON envelope.

---

Immutability Guarantees

The database enforces:

· No UPDATE on audit_logs — trigger aborts
· No DELETE on audit_logs — trigger aborts
· No UPDATE on security_events — trigger aborts
· No DELETE on security_events — trigger aborts

Any attempt returns 500 INTERNAL_ERROR with the trigger message.

Retention: 7 years (financial compliance). Cold storage after 2 years.

---

What Gets Audited

Every mutation in the system writes an audit_logs row, including:

· Member create/update/suspend/exit
· Membership approval
· Role assignment/removal
· Contribution create/post/reverse
· Transaction create/post/reverse
· Loan create/approve/reject/disburse/repay
· Investment create/update/transaction
· Expense create/approve/post/reverse
· Income create/post/reverse
· Payment match/reject/reconcile
· Document upload/update/delete
· Settings changes
· User create/disable
· Password change by admin

Each row captures: user_id, action, resource_type, resource_id,
before_json, after_json, request_id, ip_address, user_agent, severity.

---

Permission Matrix

Endpoint Permission
GET /audit/logs audit.read
GET /audit/logs/:id audit.read
GET /audit/logs/resource/:type/:id audit.read
GET /audit/security-events audit.read
GET /audit/summary audit.read
CSV exports audit.read

