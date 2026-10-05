# BODMAS CHAMAA — Audit Logging

> **Version:** 0.1.0 (Phase 6D)

---

## 1. Purpose

The audit trail answers four questions for every important action:

- **Who** did it (`user_id`)
- **What** they did (`action`, `resource_type`, `resource_id`)
- **When** (`created_at`)
- **What changed** (`before_json`, `after_json`)

It is the foundation of trust in a financial system.

---

## 2. Immutability

The database enforces:

```sql
-- On audit_logs
CREATE TRIGGER trg_audit_block_update
BEFORE UPDATE ON audit_logs FOR EACH ROW
BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only: UPDATE not permitted'); END;

CREATE TRIGGER trg_audit_block_delete
BEFORE DELETE ON audit_logs FOR EACH ROW
BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only: DELETE not permitted'); END;
```

Same for security_events.

No API endpoint can write to these tables. Only the service layer.

---

3. What Gets Audited

Authentication & Security

· login.success
· login.failed
· logout
· password.change
· password.reset
· mfa.enable / mfa.disable
· session.revoke
· permission.change
· account.lock

Members

· members.create
· members.update
· members.suspend
· members.reactivate
· members.exit
· memberships.approve
· roles.assign / roles.remove

Finance

· contributions.create / contributions.reverse
· transactions.create / transactions.post / transactions.reverse
· expenses.create / expenses.approve / expenses.post
· income.create / income.post
· payments.match / payments.reject / payments.reconcile

Loans

· loans.create / loans.approve / loans.reject
· loans.disburse / loans.repay

Investments

· investments.create / investments.update
· investment_transactions.create

Governance

· meetings.create / meetings.manage
· minutes.publish
· resolutions.create / resolutions.pass
· votes.cast

Documents

· documents.upload / documents.update / documents.delete

System

· settings.update
· users.create / users.disable
· role_permissions.update

---

4. Audit Row Shape

```json
{
  "id": "aud_01H...",
  "group_id": "grp_bodmas",
  "user_id": "usr_01H...",
  "action": "contributions.create",
  "resource_type": "contributions",
  "resource_id": "con_01H...",
  "before_json": null,
  "after_json": "{\"member_id\":\"mem_01H...\",\"amount_minor\":500000,\"period_label\":\"2026-10\"}",
  "ip_address": "41.90.xx.xx",
  "user_agent": "Mozilla/5.0...",
  "request_id": "req_01H...",
  "severity": "info",
  "created_at": "2026-10-01T08:14:00.000Z"
}
```

Field Notes
action dot-separated <resource>.<verb>
resource_type table name (plural)
resource_id PK of affected row
before_json snapshot before change (UPDATE/DELETE)
after_json snapshot after change (CREATE/UPDATE)
severity info / warning / critical
request_id correlates with API access logs

---

5. Severity Levels

Level When
info Normal operations (create, post, approve)
warning Reversals, suspensions, overrides
critical Role changes, MFA disable, permission changes, large reversals (> KSh 100k)

Alert routing:

· info → daily digest
· warning → same-day email to admins
· critical → immediate email + SMS to super_admin

---

6. What Is NOT Logged (full payloads)

· Passwords (never)
· Tokens (never)
· Full PII in after_json — masked where possible
· Request bodies of /auth/login, /auth/refresh, /payments/webhooks/*

IDs and metadata are logged. Content is not.

---

7. Retention

Age Storage Access
0–12 months Hot (indexed) API-queryable
12–24 months Warm (still indexed) API-queryable, slower
2–7 years Cold archive Export only
7+ years Deleted —

Financial regulations (Kenya): 7 years minimum.

---

8. Querying the Audit Trail

By user

```
GET /v1/audit/logs?user_id=usr_01H...
```

By resource (full history)

```
GET /v1/audit/logs/resource/loans/lon_01H...
```

By severity

```
GET /v1/audit/logs?severity=critical
```

By date range

```
GET /v1/audit/logs?from=2026-01-01&to=2026-10-05
```

By action

```
GET /v1/audit/logs?action=contributions.create
```

Export

```
GET /v1/audit/logs?from=2026-01-01&format=csv
```

---

9. Correlating with Logs

Every request has a request_id (returned in error responses).
That ID appears in:

· audit_logs.request_id
· security_events.details_json
· Server access logs
· APM traces

Support workflow: user reports "action X failed at time T" → search logs for request_id → see full picture.

---

10. Verification Job

A daily job runs at 03:00 EAT:

1. Counts audit_logs rows from the last 24 hours
2. Cross-checks the ledger trial balance
3. Confirms no triggers were bypassed (compare trigger existence)
4. Emails a summary to auditor role

Any discrepancy → severity = 'critical' alert.

---

11. Immutability Testing

scripts/verify_schema.sh includes:

```
✅ audit_logs UPDATE blocked
✅ audit_logs DELETE blocked
✅ security_events UPDATE blocked
```

Rerun on every deploy to confirm triggers are still active.

---

12. What This Document Is NOT

· Not an incident response plan (see incident-response.md)
· Not a monitoring spec (see operations docs)
