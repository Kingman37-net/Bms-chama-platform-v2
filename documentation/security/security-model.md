# BODMAS CHAMAA — Security Model

> **Version:** 0.1.0 (Phase 6D)
> **Status:** Blueprint

---

## 1. Threat Model (STRIDE)

| Threat | Vector | Mitigation |
|---|---|---|
| **S**poofing | Stolen credentials | Argon2id, MFA, short-lived JWTs, rate limits |
| **T**ampering | Modified requests / DB rows | HTTPS only, signed JWTs, immutability triggers |
| **R**epudiation | User denies action | Append-only `audit_logs` with request IDs |
| **I**nformation disclosure | PII leakage, timing attacks | Field-level redaction, constant-time compare, log scrubbing |
| **D**enial of service | Floods, expensive queries | Rate limits, pagination caps, query timeouts |
| **E**levation of privilege | Role confusion | Permission checks on every route, least privilege |

---

## 2. Trust Boundaries

```

[ Browser / Mobile ]
│  ← Boundary 1: TLS termination
▼
[ Cloudflare edge ]
│  ← Boundary 2: API auth (JWT)
▼
[ Workers / API runtime ]
│  ← Boundary 3: Service layer authorization
▼
[ Database (D1 / Postgres) ]
│  ← Boundary 4: Row-level scoping (group_id)
▼
[ Object storage ]

```

Each boundary assumes the one above it may be hostile.

---

## 3. Encryption

### In Transit
- TLS 1.3 only (TLS 1.2 minimum with modern ciphers)
- HSTS with 12-month max-age, includeSubDomains, preload
- No mixed content
- Certificate managed by Cloudflare

### At Rest
- Database: encrypted at provider level (D1, RDS, etc.)
- Object storage: server-side encryption enabled
- Backups: encrypted with a KMS-managed key
- Secrets: stored in the platform's secret store (Wrangler secrets, etc.)

### Sensitive Fields (extra care)
- `users.password_hash` — Argon2id, never returned via API
- `users.mfa_secret` — never returned after enrollment
- `members.id_number` — masked in list views (`******1234`)
- `payment_transactions.raw_payload_json` — never returned whole

---

## 4. Password Policy

- Minimum 12 characters
- Must include: 1 lowercase, 1 uppercase, 1 digit
- Checked against a breached-password list (k-anonymity API or local list)
- Hashed with Argon2id:
  - `memory_cost = 65536` (64 MiB)
  - `time_cost = 3`
  - `parallelism = 2`
- Rehash on login if parameters change
- `password_changed_at` updated on change
- After 5 failed logins: 15-minute lock, then `account.lock` security event

---

## 5. Session & Token Model

### Access token (JWT)
- HS256, secret ≥ 256 bits
- TTL: 15 minutes
- Claims: `sub`, `member_id`, `roles`, `permissions`, `iat`, `exp`, `iss`, `aud`
- Not stored client-side in localStorage (in-memory only)

### Refresh token
- Opaque, 32 random bytes (base64url)
- SHA-256 hash stored in `sessions.refresh_token_hash`
- TTL: 7 days, rotating on every refresh
- Sent as httpOnly, Secure, SameSite=Strict cookie
- Revoked on: logout, password change, MFA change, admin revoke

### Session expiry rules
- Access token cannot be extended past the refresh window
- Refresh older than 7 days is rejected even if unused
- Only one refresh per session; old one revoked on rotation

---

## 6. MFA

- TOTP (RFC 6238), 30-second window, SHA-1, 6 digits
- Secret generated server-side, shown once with QR
- Recovery codes: 10 single-use codes, hashed before storage
- Cannot disable MFA without current password + valid TOTP
- MFA required for: `super_admin`, `group_admin`, `treasurer` (V2 mandate)

---

## 7. Input Validation

- Every request body validated against a Zod (or JSON Schema) definition
- Types, lengths, ranges, enums enforced
- Unknown fields rejected (not silently dropped)
- Reject payloads > 1 MB except for document uploads
- Never trust client-computed totals; recompute server-side

---

## 8. SQL Injection Prevention

- Always parameterized queries (prepared statements)
- No string concatenation into SQL
- ORM/query builder only (Drizzle or equivalent)
- Raw SQL restricted to migrations, reviewed in PRs

---

## 9. XSS Prevention

- No `innerHTML` with user data
- Use `textContent` or DOM construction
- Content-Security-Policy header:
```

default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' https: data:;
connect-src 'self' https://api.bodmaschamaa.com\;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';

```

---

## 10. CSRF Prevention

- API uses Bearer tokens (not cookies) for the access token → immune to classic CSRF
- Refresh cookie uses `SameSite=Strict` + path restriction
- Mutation endpoints additionally require `X-Requested-With: XMLHttpRequest`
- No state-changing GET endpoints ever

---

## 11. Rate Limiting

| Scope | Limit | Backing store |
|---|---|---|
| Anonymous | 60/min per IP | Cloudflare KV |
| Authenticated | 300/min per user | KV + user_id |
| Auth attempts | 5/min per IP, 10/hr per email | KV |
| Financial writes | 30/min per user | KV |
| Webhooks | 300/min per provider | IP allowlist + KV |

Exceeded → `429` with `Retry-After`.

---

## 12. Secrets Management

- Never in git (enforced by `.gitignore` + pre-commit hook)
- Never in frontend JS
- Never in `payment_accounts.metadata_json`
- Stored via platform secret store; injected as env vars at runtime
- Rotated quarterly or on team changes
- Access logged

**Required secrets (V1):**
- `JWT_SECRET`
- `DATABASE_URL`
- `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`
- `SMTP_URL`
- `SMS_API_KEY`
- `SENTRY_DSN`

---

## 13. Dependency Security

- `npm audit` / `pnpm audit` in CI
- Lock file committed
- No `^` or `~` ranges in production dependencies (pin exact versions)
- Renovate/Dependabot PRs reviewed before merge
- No packages younger than 30 days without explicit approval

---

## 14. Logging Hygiene

**Never log:**
- Passwords, tokens, secrets
- Full PII (ID numbers, phone numbers, emails)
- Full card / bank account numbers
- Request bodies of auth or payment endpoints

**Always log:**
- `request_id`
- HTTP method, path, status, duration
- `user_id`, `group_id` (IDs only)
- Error stack traces (server-side only, never returned to client)

Mask emails: `jo***@example.com`. Mask phones: `+254712***78`.

---

## 15. Backup & Recovery

- Daily automated snapshots (retained 30 days)
- Weekly off-site backups (retained 1 year)
- Backups encrypted with KMS
- **Restore drill every quarter** — documented in `documentation/operations/backup.md`
- A backup that has never been restored is a hope, not a backup

---

## 16. Compliance Notes

- Data Protection Act, 2019 (Kenya) — user data rights
- 7-year retention for financial records
- Data minimization: collect only what the system needs
- Right to erasure: soft-delete PII, retain financial rows

---

## 17. What This Document Is NOT

- Not an access control spec (see `access-control.md`)
- Not an audit spec (see `audit.md`)
- Not a runbook (see `incident-response.md`)
