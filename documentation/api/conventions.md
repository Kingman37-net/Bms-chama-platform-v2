# BODMAS CHAMAA — API Conventions

> **Version:** 0.1.0 (Phase 6C)
> **Base URL (target):** `https://api.bodmaschamaa.com/v1`
> **Content-Type:** `application/json; charset=utf-8`

---

## 1. Versioning

All endpoints are prefixed with `/v1`. Breaking changes ship as `/v2`.
Non-breaking additions are added to `/v1` without notice.

---

## 2. HTTP Verbs

| Verb | Use |
|---|---|
| GET | Read one or list resources |
| POST | Create |
| PATCH | Partial update |
| PUT | Full replace (rare; used for idempotent state transitions) |
| DELETE | Soft-delete where allowed; forbidden for financial records |

No verb overloads. No POST-to-read.

---

## 3. Response Envelope

**Success (single):**
```json
{ "ok": true, "data": { "id": "mem_01H...", "full_name": "Alice" } }
```

Success (list):

```json
{
  "ok": true,
  "data": [ { ... }, { ... } ],
  "meta": { "page": 1, "per_page": 20, "total": 143, "pages": 8 }
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "amount_minor must be a positive integer",
    "details": { "field": "amount_minor" },
    "request_id": "req_01H..."
  }
}
```

---

4. HTTP Status Codes

Status Meaning
200 OK (GET, PATCH, PUT)
201 Created (POST success)
204 No Content (DELETE success)
400 Validation failed
401 Unauthenticated
403 Permission denied
404 Not found
409 Conflict (duplicate, state clash)
422 Business rule violation
429 Rate limited
500 Internal error

---

5. Pagination

Query params:

· page (default 1, min 1)
· per_page (default 20, max 100)

Response meta includes page, per_page, total, pages.

Cursor pagination is used for large ledger queries:

· cursor (opaque token)
· limit (default 50, max 500)

---

6. Filtering and Sorting

Filter: ?status=active&member_id=mem_01H...
Sort: ?sort=-created_at (minus = descending)
Range: ?from=2026-01-01&to=2026-10-05
Search: ?q=alice (fuzzy on names; exact on IDs)

---

7. Idempotency

Any non-GET request may include:

```
Idempotency-Key: <uuid>
```

Server caches response for 24h. Retries return the same result.

Required for: POST /transactions, POST /payments/*, POST /loans/*/disburse.

---

8. Authentication

Every protected route requires:

```
Authorization: Bearer <access_token>
```

Tokens are JWT (HS256), TTL 15 min. Refresh via POST /auth/refresh.

---

9. Authorization

Routes declare a required permission (e.g. contributions.create).
Missing permission → 403 PERMISSION_DENIED.
Member-scoped routes additionally enforce ownership.

---

10. Rate Limits

Scope Limit
Anonymous 60 req/min per IP
Authenticated 300 req/min per user
Financial writes 30 req/min per user
Auth attempts 5 req/min per IP + 10/hour per email

Exceeded → 429 RATE_LIMITED with Retry-After header.

---

11. Standard Error Codes

Code HTTP Meaning
VALIDATION_FAILED 400 Schema invalid
UNAUTHENTICATED 401 Missing/expired token
PERMISSION_DENIED 403 Lacks permission
NOT_FOUND 404 Resource missing
CONFLICT 409 Duplicate / state clash
BUSINESS_RULE 422 Domain rule broken
RATE_LIMITED 429 Too many requests
INTERNAL_ERROR 500 Unhandled

---

12. Timestamps

All timestamps are ISO-8601 UTC with Z suffix:

```
2026-10-05T14:27:53.313Z
```

Never send local time. Never send Unix epoch in bodies.

---

13. Money

All amounts are INTEGER minor units (cents).
5000 = KSh 50.00. Currency is always sent alongside.

```json
{ "amount_minor": 500000, "currency": "KES" }
```

Never use floats. Never use decimal strings.

---

14. IDs

Resource IDs are prefixed ULIDs:

· grp_, usr_, mem_, mbr_, rol_, con_, txn_, lon_, inv_, etc.

Never expose sequential integers. Never expose internal DB row IDs.

---

15. Request IDs

Every response includes a request_id in the error body.
Server logs the same ID → easy correlation for support.

Clients may send X-Request-Id; server echoes it or generates one.

---

16. CORS

Allowed origins:

· https://bodmaschamaa.co.ke
· https://www.bodmaschamaa.co.ke
· http://localhost:8080 (dev only)

No wildcard. Credentials allowed for member/admin zones.

---

17. Sensitive Fields — Never in Responses

· password_hash
· mfa_secret
· refresh_token_hash
· raw_payload_json (payments)
· Full national ID numbers (mask as ******1234)

---

18. Audit Trail

Every mutation writes to audit_logs with:
actor_user_id, action, resource_type, resource_id, before_json, after_json, request_id, ip_address.

Audit rows are immutable.

---

19. Health and Info

Endpoint Purpose
GET /health Liveness probe (returns 200)
GET /ready Readiness probe (DB reachable)
GET /version Build info

