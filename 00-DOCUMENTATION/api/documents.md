# Documents API

> Base: `/v1/documents`

Documents are files (PDF, DOCX, PNG, etc.) with metadata, versioning, and
access control. File bytes are stored in object storage; this API manages
metadata and presigned URLs.

---

## GET /v1/documents

List documents visible to the caller.

**Permission:** `documents.read`

**Query params:** `category`, `visibility`, `status`, `page`, `per_page`

**Response 200:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "doc_01H...",
      "name": "BODMAS Constitution 2026",
      "category": "constitution",
      "mime_type": "application/pdf",
      "file_size_bytes": 245123,
      "visibility": "public",
      "version": 1,
      "status": "active",
      "uploaded_by": "usr_01H...",
      "created_at": "2026-01-15T10:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "per_page": 20, "total": 1, "pages": 1 }
}
```

Visibility rules:

· public → visible to anyone (authenticated or not)
· members → visible to any authenticated member
· officials → chairperson, treasurer, secretary, auditor
· admins → group_admin + super_admin

---

GET /v1/documents/:id

Get metadata + download URL.

Permission: documents.read (subject to visibility)

Response 200:

```json
{
  "ok": true,
  "data": {
    "id": "doc_01H...",
    "name": "BODMAS Constitution 2026",
    "category": "constitution",
    "mime_type": "application/pdf",
    "file_size_bytes": 245123,
    "visibility": "public",
    "version": 1,
    "download_url": "https://cdn.bodmaschamaa.com/docs/...",
    "download_url_expires_at": "2026-10-05T15:14:00.000Z"
  }
}
```

download_url is a short-lived signed URL (15 minutes).

---

POST /v1/documents

Register a document (metadata + upload target).

Permission: documents.upload

Request:

```json
{
  "name": "BODMAS Constitution 2026",
  "category": "constitution",
  "mime_type": "application/pdf",
  "file_size_bytes": 245123,
  "visibility": "public"
}
```

Response 201:

```json
{
  "ok": true,
  "data": {
    "document_id": "doc_01H...",
    "upload_url": "https://upload.bodmaschamaa.com/...",
    "upload_url_expires_at": "2026-10-05T15:14:00.000Z"
  }
}
```

Flow:

1. Client POSTs metadata → gets presigned upload URL
2. Client uploads bytes directly to object storage
3. Client calls POST /documents/:id/complete when done

---

POST /v1/documents/:id/complete

Mark upload complete and validate.

Permission: documents.upload

Response 200 { "ok": true, "data": { "status": "active" } }

Server verifies the object exists in storage and matches declared size/mime.

---

PATCH /v1/documents/:id

Update metadata (name, category, visibility).

Permission: documents.manage

---

DELETE /v1/documents/:id

Soft-delete a document.

Permission: documents.manage

Behaviour: sets status = 'deleted'. Binary is retained 90 days for audit.

---

GET /v1/documents/:id/versions

List versions of a document.

Permission: documents.read

Response 200:

```json
{
  "ok": true,
  "data": [
    { "version": 2, "created_at": "2026-06-01T00:00:00.000Z", "uploaded_by": "usr_01H..." },
    { "version": 1, "created_at": "2026-01-15T10:00:00.000Z", "uploaded_by": "usr_01H..." }
  ]
}
```

---

POST /v1/documents/:id/new-version

Upload a new version (supersedes previous).

Permission: documents.upload

Behaviour: increments version; previous version stays accessible via history.

---

Permission Matrix

Endpoint Permission
GET /documents documents.read
GET /documents/:id documents.read
POST /documents documents.upload
POST /documents/:id/complete documents.upload
PATCH /documents/:id documents.manage
DELETE /documents/:id documents.manage
GET /documents/:id/versions documents.read
POST /documents/:id/new-version documents.upload

