# BODMAS CHAMAA — Incident Response Plan

> **Version:** 0.1.0 (Phase 6D)
> **Owner:** Super Admin / Chairperson
> **Review cycle:** Quarterly

---

## 1. Purpose

Defines what to do when something goes wrong: security breach,
data loss, service outage, financial discrepancy, or a compromised account.

The goal: **contain → assess → recover → learn**, in that order.

---

## 2. Severity Levels

| Level | Definition | Response time | Example |
|---|---|---|---|
| **P1 — Critical** | Data breach, financial fraud, full outage | Immediate | DB exposed, large unexplained transaction |
| **P2 — High** | Partial outage, single-account compromise, large discrepancy | < 1 hour | Treasurer account hijacked |
| **P3 — Medium** | Degraded service, suspicious activity | < 24 hours | Spike in failed logins |
| **P4 — Low** | Cosmetic bugs, minor issues | Next business day | Broken link, slow page |

---

## 3. Incident Team

| Role | Person | Responsibility |
|---|---|---|
| Incident Commander | Super Admin | Coordinates response |
| Technical Lead | Dev / Super Admin | Root cause + fix |
| Communications | Chairperson | Member-facing comms |
| Finance Lead | Treasurer | Financial verification |
| Scribe | Secretary | Timeline + evidence |

Small team → one person may hold multiple roles. **The scribe is never also the technical lead.**

---

## 4. Common Incidents & Runbooks

### 4.1 Compromised User Account

**Signals:** unexpected logins, unfamiliar IPs, unexplained actions in audit log.

**Steps:**
1. `POST /v1/auth/sessions` revoke all sessions for that user
2. Lock the account: `UPDATE users SET is_locked = 1`
3. Force password reset
4. Review `audit_logs` for the user for last 30 days
5. Review `security_events` for `login.success` from new IPs
6. Reverse any unauthorized transactions (never delete)
7. Notify the user and the committee
8. Write incident report

---

### 4.2 Suspected Data Breach

**Signals:** unusual query volume, exposed credentials, alert from platform provider.

**Steps:**
1. **Contain:** rotate all secrets (`JWT_SECRET`, DB credentials, API keys)
2. **Preserve:** export `audit_logs` + `security_events` to offline storage
3. **Assess:** what data was exposed? How many records?
4. **Notify:** Data Protection Act requires notifying the ODPC if PII is involved
5. **Remediate:** patch the vector; force password resets if needed
6. **Report:** to members if PII was compromised
7. **Review:** post-mortem within 7 days

---

### 4.3 Financial Discrepancy

**Signals:** trial balance fails, cash account doesn't match bank/M-Pesa statement.

**Steps:**
1. Do **not** modify posted transactions
2. Run `GET /v1/ledger/trial-balance` and `GET /v1/payments/reconciliation`
3. Compare against bank/M-Pesa statements
4. Identify the discrepancies
5. Correct via **reversal transactions** with a documented reason
6. Re-run `verify_schema.sh` to confirm ledger invariants
7. Audit log will show who did what, when

---

### 4.4 Data Loss / Corruption

**Signals:** missing rows, corrupted data, failed integrity checks.

**Steps:**
1. Stop writes if corruption is ongoing
2. Take a fresh snapshot of current state (for forensics)
3. Restore from last known-good backup (see `documentation/operations/backup.md`)
4. Replay any transactions since the backup from `audit_logs`
5. Run `verify_schema.sh`
6. Validate ledger balances with the treasurer

---

### 4.5 Service Outage

**Signals:** API down, page 500s, Cloudflare incident.

**Steps:**
1. Check provider status pages (Cloudflare, DB, M-Pesa)
2. Roll back the most recent deploy (`git revert` + redeploy)
3. Restore from last working commit if needed
4. Communicate status to affected users
5. Post-mortem within 72 hours

---

### 4.6 Trigger Bypass (Critical)

**Signals:** audit_logs has UPDATEs, ledger has unbalanced transactions, immutability triggers missing.

**Steps:**
1. Assume DB has been compromised
2. Immediately revoke all sessions
3. Rotate all secrets
4. Restore database from last known-good snapshot
5. Reapply migrations (`verify_schema.sh`)
6. Review every audit_logs row since the breach window
7. Escalate to P1

---

## 5. Communication Templates

### Member-facing (P1/P2)
> We are aware of an issue affecting [description]. Your funds are
> [safe / under review]. We will update you by [time]. Do not act on
> any instructions you receive that are not from official BODMAS channels.

### ODPC notification (if PII breach)
Per Data Protection Act, 2019 — notify within 72 hours of becoming aware.

### Internal (super_admin + chairperson)
Structured format: severity, affected systems, timeline, next action, owner.

---

## 6. Evidence Preservation

Before any remediation:

```bash
# Snapshot the DB
sqlite3 database/production.db ".backup database/backups/incident-$(date +%Y%m%d-%H%M).db"

# Export audit trail
sqlite3 database/production.db "SELECT * FROM audit_logs WHERE created_at > datetime('now','-7 days');" > /secure/incident-audit.csv

# Export security events
sqlite3 database/production.db "SELECT * FROM security_events WHERE created_at > datetime('now','-7 days');" > /secure/incident-security.csv
```

Copy to encrypted offline storage. Never delete evidence, even if it looks irrelevant.

---

7. Post-Mortem (within 7 days)

Every P1 or P2 incident gets a written post-mortem:

1. Timeline — minute-by-minute from first signal to resolution
2. Root cause — the single technical/process failure
3. Impact — who, what, how much
4. Detection — how we found out (and how long it took)
5. Response — what worked, what didn't
6. Prevention — concrete action items with owners and dates
7. Lessons learned — for the team, not for blame

Post-mortems are blameless. The goal is system improvement.

---

8. Contact List (fill in before production)

Role Name Phone Email
Super Admin — — —
Chairperson — — —
Treasurer — — —
Dev / Vendor — — —
Cloudflare support — — —
Bank contact — — —
M-Pesa business line — — —

Store offline. Do not rely on the system being up to reach people.

---

9. Drills

Frequency Drill
Monthly Failed-login alert test
Quarterly Backup restore drill
Quarterly Account takeover tabletop
Semi-annual Full breach simulation
Annual Ledger reconciliation under pressure

Drills are documented in documentation/operations/.

---

10. What This Document Is NOT

· Not a security policy (see security-model.md)
· Not an ops manual (see documentation/operations/)
