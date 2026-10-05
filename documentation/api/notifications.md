# Notifications API

> Base: `/v1/notifications`

Notifications may be delivered via in-app, email, or SMS.

---

## GET /v1/notifications

List notifications for the current user.

**Permission:** `notifications.read`

**Query params:** `status` (`pending` | `sent` | `read`), `channel`, `page`, `per_page`

**Response 200:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "ntf_01H...",
      "channel": "in_app",
      "category": "contribution_received",
      "title": "Contribution received",
      "body": "Your KSh 5,000 October savings was recorded.",
      "status": "read",
      "sent_at": "2026-10-01T08:14:05.000Z",
      "read_at": "2026-10-01T08:20:00.000Z",
      "created_at": "2026-10-01T08:14:00.000Z"
    }
  ],
  "meta": { "page": 1, "per_page": 20, "total": 1, "pages": 1 }
}
```

Scoping:

· Member role: only their own notifications
· Admin: can pass recipient_user_id or recipient_member_id

---

POST /v1/notifications/:id/read

Mark one notification as read.

Permission: owner

Response 204

---

POST /v1/notifications/read-all

Mark all as read for the current user.

Permission: owner
Response 204

---

POST /v1/notifications/send

Send a notification (admin).

Permission: notifications.send

Request:

```json
{
  "channel": "in_app",
  "category": "meeting_reminder",
  "title": "Meeting on 2026-10-15",
  "body": "Reminder: monthly meeting at 4 PM at the group office.",
  "recipients": {
    "type": "all_members"
  }
}
```

Recipient options:

· { "type": "all_members" }
· { "type": "members", "ids": ["mem_01H..."] }
· { "type": "role", "code": "treasurer" }
· { "type": "user", "id": "usr_01H..." }

Response 201:

```json
{
  "ok": true,
  "data": {
    "queued": 143,
    "channel": "in_app"
  }
}
```

Side effects:

· One notifications row per recipient
· audit_logs entry with action = notifications.send
· Background job delivers email/SMS; in-app appears immediately

---

Notification Categories (V1)

Category Triggered by
contribution_received Contribution posted
contribution_missed Contribution window ended without payment
loan_approved Loan approved
loan_disbursed Loan disbursed
loan_due Installment due in 3 days
loan_overdue Installment past due
repayment_received Loan repayment posted
meeting_scheduled New meeting created
meeting_reminder 24 hours before meeting
resolution_published Resolution passed + public
document_uploaded New document shared
membership_status Status changed
system_alert Security or operational alert

---

Permission Matrix

Endpoint Permission
GET /notifications notifications.read
POST /notifications/:id/read owner
POST /notifications/read-all owner
POST /notifications/send notifications.send

