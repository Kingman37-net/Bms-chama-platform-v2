# Authentication API

> Base: `/v1/auth`

---

## POST /v1/auth/login

Authenticate and issue tokens.

**Permission:** none (public)
**Rate limit:** 5/min per IP, 10/hour per email

**Request:**
```json
{
  "email": "treasurer@bodmaschamaa.com",
  "password": "correct-horse-battery-staple",
  "mfa_code": "123456"
}
```

mfa_code is required only if mfa_enabled = 1 for the user.

Response 200:

```json
{
  "ok": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1...",
    "expires_in": 900,
    "user": {
      "id": "usr_01H...",
      "email": "treasurer@bodmaschamaa.com",
      "display_name": "Jane Doe",
      "roles": ["treasurer", "member"],
      "permissions": ["contributions.read", "contributions.create", "..."]
    }
  }
}
```

Refresh token set as httpOnly cookie bmc_rt.

Errors:

· 401 UNAUTHENTICATED — bad credentials
· 401 UNAUTHENTICATED — MFA required but not provided
· 403 PERMISSION_DENIED — account locked
· 429 RATE_LIMITED

Side effects: writes security_events row; updates users.last_login_at, resets failed_login_count.

---

POST /v1/auth/refresh

Rotate refresh token and issue new access token.

Permission: none
Requires: bmc_rt httpOnly cookie

Response 200:

```json
{
  "ok": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1...",
    "expires_in": 900
  }
}
```

Rotates the bmc_rt cookie. Old refresh token is revoked.

Errors:

· 401 UNAUTHENTICATED — missing/expired/revoked token

---

POST /v1/auth/logout

Revoke current session.

Permission: authenticated

Response 204 (no body)

Side effects: sets sessions.revoked_at, clears bmc_rt cookie, writes security_events row.

---

POST /v1/auth/forgot-password

Request a password reset link.

Permission: none
Rate limit: 3/min per IP

Request:

```json
{ "email": "treasurer@bodmaschamaa.com" }
```

Response 200 (always, even if email doesn't exist):

```json
{ "ok": true, "data": { "message": "If the email exists, a reset link has been sent." } }
```

Side effects: if email exists, creates single-use token (expires 30 min), sends email.

---

POST /v1/auth/reset-password

Consume reset token and set new password.

Permission: none

Request:

```json
{
  "token": "rst_01H...",
  "new_password": "new-strong-password"
}
```

Response 204

Side effects:

· Updates password_hash, password_changed_at
· Revokes all sessions for that user
· Writes security_events row

Errors:

· 401 UNAUTHENTICATED — invalid/expired/used token
· 422 BUSINESS_RULE — password fails policy

---

POST /v1/auth/change-password

Change password (authenticated user).

Permission: authenticated

Request:

```json
{
  "current_password": "old",
  "new_password": "new-strong-password"
}
```

Response 204

Revokes all sessions except the current one.

---

POST /v1/auth/mfa/setup

Begin MFA enrollment. Returns TOTP secret + QR URI.

Permission: authenticated

Response 200:

```json
{
  "ok": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "otpauth_uri": "otpauth://totp/BODMAS:treasurer@bodmaschamaa.com?secret=...",
    "recovery_codes": ["a1b2c3d4", "..."]
  }
}
```

MFA is not enabled until POST /auth/mfa/verify succeeds.

---

POST /v1/auth/mfa/verify

Confirm enrollment by submitting a TOTP code.

Request: { "code": "123456" }
Response 200 { "ok": true, "data": { "mfa_enabled": true } }

---

POST /v1/auth/mfa/disable

Disable MFA (requires current password + valid code).

---

GET /v1/auth/me

Return the current user profile + permissions.

Permission: authenticated

Response 200:

```json
{
  "ok": true,
  "data": {
    "id": "usr_01H...",
    "email": "treasurer@bodmaschamaa.com",
    "display_name": "Jane Doe",
    "member_id": "mem_01H...",
    "roles": ["treasurer", "member"],
    "permissions": [ "contributions.read", "..." ]
  }
}
```

---

Session Management

GET /v1/auth/sessions

List active sessions for the current user.

DELETE /v1/auth/sessions/:id

Revoke a specific session.

DELETE /v1/auth/sessions

Revoke all sessions except the current one.
