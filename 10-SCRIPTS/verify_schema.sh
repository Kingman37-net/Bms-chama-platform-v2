#!/usr/bin/env bash
# ============================================================================
# BODMAS CHAMAA — Schema Verification Script
# Runs all migrations + seeds against a throwaway DB and checks invariants.
# Exit code 0 = all good. Non-zero = something is broken.
# ============================================================================

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="$ROOT/database/backups/verify.db"
SCHEMA_DIR="$ROOT/database/schema"
SEED_DIR="$ROOT/database/seeds"

PASS=0
FAIL=0

ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
step() { echo ""; echo "▶ $1"; }

# ---------------------------------------------------------------------------
step "Preparing throwaway database"
rm -f "$DB" "$DB-shm" "$DB-wal"

# ---------------------------------------------------------------------------
step "Applying schema migrations"
for f in "$SCHEMA_DIR"/*.sql; do
  if sqlite3 "$DB" < "$f" >/dev/null 2>&1; then
    ok "applied $(basename "$f")"
  else
    bad "failed $(basename "$f")"
    exit 1
  fi
done

# ---------------------------------------------------------------------------
step "Applying seeds"
for f in "$SEED_DIR"/*.sql; do
  if sqlite3 "$DB" < "$f" >/dev/null 2>&1; then
    ok "seeded $(basename "$f")"
  else
    bad "seed failed $(basename "$f")"
    exit 1
  fi
done

# ---------------------------------------------------------------------------
step "Checking table count"
TABLES=$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
if [ "$TABLES" = "36" ]; then
  ok "36 tables present"
else
  bad "expected 36 tables, got $TABLES"
fi

# ---------------------------------------------------------------------------
step "Checking trigger count"
TRIGGERS=$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger';")
if [ "$TRIGGERS" -ge 30 ]; then
  ok "$TRIGGERS triggers installed"
else
  bad "expected ≥30 triggers, got $TRIGGERS"
fi

# ---------------------------------------------------------------------------
step "Checking seeded data"
PERMS=$(sqlite3 "$DB" "SELECT COUNT(*) FROM permissions;")
ROLES=$(sqlite3 "$DB" "SELECT COUNT(*) FROM roles;")
ACCTS=$(sqlite3 "$DB" "SELECT COUNT(*) FROM accounts;")
[ "$PERMS" -ge 40 ] && ok "$PERMS permissions seeded"      || bad "permissions: $PERMS"
[ "$ROLES" -eq 7  ] && ok "7 roles seeded"                 || bad "roles: $ROLES"
[ "$ACCTS" -eq 14 ] && ok "14 accounts seeded"             || bad "accounts: $ACCTS"

# ---------------------------------------------------------------------------
step "Testing: FK violation must fail"
if sqlite3 -cmd "PRAGMA foreign_keys = ON;" "$DB" \
  "INSERT INTO members (id, group_id, full_name, status, created_at, updated_at) VALUES ('mem_x','grp_missing','X','active','2026','2026');" 2>/dev/null; then
  bad "FK violation was NOT blocked"
else
  ok "FK violation blocked"
fi

# ---------------------------------------------------------------------------
step "Testing: CHECK violation must fail"
if sqlite3 -cmd "PRAGMA foreign_keys = ON;" "$DB" \
  "INSERT INTO members (id, group_id, full_name, status, created_at, updated_at) VALUES ('mem_y','grp_bodmas','Y','flying','2026','2026');" 2>/dev/null; then
  bad "CHECK violation was NOT blocked"
else
  ok "CHECK violation blocked"
fi

# ---------------------------------------------------------------------------
step "Testing: unbalanced transaction must fail to post"
sqlite3 -cmd "PRAGMA foreign_keys = ON;" "$DB" << 'SQL' >/dev/null 2>&1
INSERT INTO transactions (id, group_id, reference, description, transaction_type, state, created_at, updated_at)
VALUES ('txn_unbal','grp_bodmas','TXN-UNBAL','test','contribution','created','2026','2026');
INSERT INTO ledger_entries (transaction_id, group_id, account_id, debit_minor, credit_minor, posted_at, created_at)
VALUES
  ('txn_unbal','grp_bodmas','acc_1000',100000,0,'2026','2026'),
  ('txn_unbal','grp_bodmas','acc_2000',0,50000,'2026','2026');
SQL
if sqlite3 -cmd "PRAGMA foreign_keys = ON;" "$DB" \
  "UPDATE transactions SET state='posted', posted_at='2026' WHERE id='txn_unbal';" 2>/dev/null; then
  bad "unbalanced post was NOT blocked"
else
  ok "unbalanced post blocked"
fi

# ---------------------------------------------------------------------------
step "Testing: balanced transaction posts successfully"
sqlite3 -cmd "PRAGMA foreign_keys = ON;" "$DB" << 'SQL' >/dev/null 2>&1
INSERT INTO transactions (id, group_id, reference, description, transaction_type, state, created_at, updated_at)
VALUES ('txn_ok','grp_bodmas','TXN-OK','test','contribution','created','2026','2026');
INSERT INTO ledger_entries (transaction_id, group_id, account_id, debit_minor, credit_minor, posted_at, created_at)
VALUES
  ('txn_ok','grp_bodmas','acc_1000',100000,0,'2026','2026'),
  ('txn_ok','grp_bodmas','acc_2000',0,100000,'2026','2026');
UPDATE transactions SET state='posted', posted_at='2026' WHERE id='txn_ok';
SQL
STATE=$(sqlite3 "$DB" "SELECT state FROM transactions WHERE id='txn_ok';")
if [ "$STATE" = "posted" ]; then
  ok "balanced post succeeded (state=$STATE)"
else
  bad "balanced post failed (state=$STATE)"
fi

# ---------------------------------------------------------------------------
step "Testing: posted ledger entries are immutable"
if sqlite3 -cmd "PRAGMA foreign_keys = ON;" "$DB" \
  "DELETE FROM ledger_entries WHERE transaction_id='txn_ok';" 2>/dev/null; then
  bad "posted ledger deletion was NOT blocked"
else
  ok "posted ledger deletion blocked"
fi

# ---------------------------------------------------------------------------
step "Testing: audit_logs is append-only"
sqlite3 -cmd "PRAGMA foreign_keys = ON;" "$DB" \
  "INSERT INTO audit_logs (id,action,resource_type,severity,created_at) VALUES ('aud_v','x','y','info','2026');" >/dev/null 2>&1
if sqlite3 -cmd "PRAGMA foreign_keys = ON;" "$DB" \
  "UPDATE audit_logs SET action='z' WHERE id='aud_v';" 2>/dev/null; then
  bad "audit_logs UPDATE was NOT blocked"
else
  ok "audit_logs UPDATE blocked"
fi

# ---------------------------------------------------------------------------
step "Testing: super_admin has all permissions"
SUPER=$(sqlite3 "$DB" "SELECT COUNT(*) FROM role_permissions WHERE role_id='rol_super_admin';")
TOTAL=$(sqlite3 "$DB" "SELECT COUNT(*) FROM permissions;")
if [ "$SUPER" = "$TOTAL" ]; then
  ok "super_admin has all $TOTAL permissions"
else
  bad "super_admin has $SUPER/$TOTAL permissions"
fi

# ---------------------------------------------------------------------------
step "Testing: treasurer cannot approve loans via role definition"
TREAS_APPROVE=$(sqlite3 "$DB" "SELECT COUNT(*) FROM role_permissions WHERE role_id='rol_treasurer' AND permission_code='loans.approve';")
if [ "$TREAS_APPROVE" = "0" ]; then
  ok "treasurer does NOT have loans.approve"
else
  bad "treasurer unexpectedly has loans.approve"
fi

# ---------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════"
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
echo "═══════════════════════════════════════════════"

rm -f "$DB" "$DB-shm" "$DB-wal"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
