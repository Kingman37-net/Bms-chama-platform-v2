# Members API

> Base: `/v1/members`

---

## GET /v1/members

List members.

**Permission:** `members.read`
**Query params:** `q`, `status`, `sort`, `page`, `per_page`

**Response 200:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "mem_01H...",
      "full_name": "Alice Wanjiru",
      "phone": "+254712345678",
      "email": "alice@example.com",
      "status": "active",
      "member_number": "BMS-0001",
      "joined_on": "2026-01-15"
    }
  ],
  "meta": { "page": 1, "per_page": 20, "total": 1, "pages": 1 }
}
```

---

GET /v1/members/:id

Get one member.

Permission: members.read OR self (own record)

Response 200:

```json
{
  "ok": true,
  "data": {
    "id": "mem_01H...",
    "group_id": "grp_bodmas",
    "full_name": "Alice Wanjiru",
    "id_number": "******1234",
    "date_of_birth": "1990-05-12",
    "gender": "female",
    "phone": "+254712345678",
    "email": "alice@example.com",
    "address": "Bamburi, Mombasa",
    "emergency_contact_name": "John Wanjiru",
    "emergency_contact_phone": "+254723456789",
    "photo_url": null,
    "joined_on": "2026-01-15",
    "status": "active",
    "membership": {
      "id": "mbr_01H...",
      "member_number": "BMS-0001",
      "status": "active",
      "roles": ["member"]
    }
  }
}
```

---

POST /v1/members

Create a member + membership in one call.

Permission: members.create

Request:

```json
{
  "full_name": "Alice Wanjiru",
  "id_number": "12345678",
  "date_of_birth": "1990-05-12",
  "gender": "female",
  "phone": "+254712345678",
  "email": "alice@example.com",
  "address": "Bamburi, Mombasa",
  "emergency_contact_name": "John Wanjiru",
  "emergency_contact_phone": "+254723456789",
  "joined_on": "2026-01-15",
  "status": "active"
}
```

Response 201:

```json
{
  "ok": true,
  "data": {
    "member_id": "mem_01H...",
    "membership_id": "mbr_01H...",
    "member_number": "BMS-0001"
  }
}
```

Side effects:

· members row created
· memberships row created with auto-assigned member_number
· audit_logs row: action = members.create

Errors:

· 409 CONFLICT — id_number already exists in group
· 400 VALIDATION_FAILED

---

PATCH /v1/members/:id

Partial update.

Permission: members.update OR self (limited fields)

Self-update allowed fields: phone, email, address, emergency_contact_name, emergency_contact_phone.

Request:

```json
{ "phone": "+254798765432" }
```

Response 200 returns updated member.

Side effects: audit_logs with before/after JSON.

---

POST /v1/members/:id/suspend

Suspend a member.

Permission: members.update

Request: { "reason": "Non-payment for 3 months" }

Response 200 { "ok": true, "data": { "status": "suspended" } }

Business rules: cannot suspend if active loans with outstanding > 0 without chairperson approval.

---

POST /v1/members/:id/reactivate

Permission: members.update

---

POST /v1/members/:id/exit

Mark a member as exited.

Permission: members.update

Business rules:

· Outstanding loans must be zero
· Any member savings balance must be refunded (creates a transaction)

Request:

```json
{
  "exit_date": "2026-12-31",
  "reason": "Relocating"
}
```

---

GET /v1/members/:id/roles

List roles assigned to the member's membership.

Permission: members.read

---

POST /v1/members/:id/roles

Assign a role.

Permission: roles.manage

Request: { "role_code": "treasurer" }

Response 201

Side effects: inserts membership_roles row, writes audit_logs (action = roles.assign), writes security_events (event_type = permission.change).

---

DELETE /v1/members/:id/roles/:role_code

Remove a role.

Permission: roles.manage

Business rule: cannot remove super_admin from the last remaining super_admin.

---

GET /v1/members/:id/statement

Download a member statement as PDF or CSV.

Permission: members.read OR self

Query params: from, to, format=pdf|csv

Response: file stream with Content-Disposition: attachment.

---

Field Reference

Field Type Notes
id string Server-generated, immutable
full_name string Required, 1–200 chars
id_number string Unique per group
phone string E.164 format
email string Valid email
status enum active, suspended, exited, deceased
member_number string Auto-generated: BMS-NNNN
joined_on date YYYY-MM-DD

Permission Matrix

Endpoint Required permission
GET /members members.read
GET /members/:id members.read OR self
POST /members members.create
PATCH /members/:id members.update OR self (limited)
POST /members/:id/suspend members.update
POST /members/:id/reactivate members.update
POST /members/:id/exit members.update
GET /members/:id/roles members.read
POST /members/:id/roles roles.manage
DELETE /members/:id/roles/:code roles.manage
GET /members/:id/statement members.read OR self

