#!/usr/bin/env bash
# Axon Tickets — Pre-push quality gate
# Runs automatically before every git push.
# Emergency bypass only: git push --no-verify

set -uo pipefail

RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; ERRORS=$((ERRORS + 1)); }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; WARNINGS=$((WARNINGS + 1)); }
info() { echo -e "  → $1"; }

echo ""
echo -e "${BOLD}🔒 Axon Tickets — Pre-push quality gate${NC}"
echo "──────────────────────────────────────────"

# ── Collect changed files from stdin (standard git hook protocol) ────────────
CHANGED_FILES=""
while IFS=' ' read -r local_ref local_sha remote_ref remote_sha; do
  # Branch deletion — nothing to check
  [ "$local_sha" = "0000000000000000000000000000000000000000" ] && exit 0

  if [ "$remote_sha" = "0000000000000000000000000000000000000000" ]; then
    # New branch — compare against merge base with main
    BASE=$(git merge-base HEAD origin/main 2>/dev/null || git rev-list --max-parents=0 HEAD 2>/dev/null || echo "")
    if [ -n "$BASE" ]; then
      RANGE="$BASE..$local_sha"
    else
      RANGE="HEAD~1..$local_sha"
    fi
  else
    RANGE="$remote_sha..$local_sha"
  fi

  FILES=$(git diff --name-only "$RANGE" 2>/dev/null || true)
  CHANGED_FILES="$CHANGED_FILES"$'\n'"$FILES"
done

# Deduplicate, remove blanks, filter to files that still exist on disk
CHANGED_FILES=$(echo "$CHANGED_FILES" | sort -u | grep -v '^$' | while IFS= read -r f; do [ -f "$f" ] && echo "$f"; done || true)

if [ -z "$CHANGED_FILES" ]; then
  info "No changed files detected — nothing to check."
  echo ""
  exit 0
fi

# ── 1. Pattern checks (fast, <1s) ─────────────────────────────────────────────
echo ""
echo "Checking code patterns..."

while IFS= read -r f; do
  [[ "$f" =~ \.(ts|tsx|js|jsx)$ ]] || continue

  # process.env.NODE_ENV — must use APP_ENV
  if grep -qE 'process\.env\.NODE_ENV' "$f" 2>/dev/null; then
    fail "process.env.NODE_ENV in ${f} — use APP_ENV instead"
  fi

  # Centavos pattern — price arithmetic that looks like peso↔centavo conversion
  if grep -qE '(price|amount|cost|subtotal|total)\s*[*]\s*100|(price|amount|cost|subtotal|total)\s*/\s*100' "$f" 2>/dev/null; then
    # Exclude known display/formatting files
    if ! echo "$f" | grep -qE 'format|display|render|util'; then
      warn "Possible centavos conversion in ${f} — verify monetary values are PHP pesos (integers)"
    fi
  fi

  # Raw queryRaw with template literals
  if grep -qE '\$queryRaw`' "$f" 2>/dev/null; then
    fail "\$queryRaw with template literal in ${f} — use parameterized \$queryRaw with Prisma.sql or \$executeRaw"
  fi

done <<< "$CHANGED_FILES"

# Hardcoded secrets
while IFS= read -r f; do
  if grep -qE 'sk_live_|pk_live_|-----BEGIN (RSA )?PRIVATE KEY' "$f" 2>/dev/null; then
    fail "Possible hardcoded secret in ${f}"
  fi
done <<< "$CHANGED_FILES"

[ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ] && pass "Pattern checks clean"

# ── 2. Migration safety check ─────────────────────────────────────────────────
MIGRATION_FILES=$(echo "$CHANGED_FILES" | grep "prisma/migrations/" || true)

if [ -n "$MIGRATION_FILES" ]; then
  echo ""
  echo "Checking migrations..."

  DESTRUCTIVE_FOUND=false
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    if grep -qiE 'DROP TABLE|DROP COLUMN|TRUNCATE|ALTER.*DROP|DELETE FROM' "$f" 2>/dev/null; then
      fail "Destructive migration detected: ${f}"
      fail "  Required before pushing:"
      fail "  1. Run /security-review in Claude Code"
      fail "  2. Document rollback SQL in the PR"
      fail "  3. Confirm pg_dump backup of production exists"
      DESTRUCTIVE_FOUND=true
    fi
  done <<< "$MIGRATION_FILES"

  if [ "$DESTRUCTIVE_FOUND" = false ]; then
    pass "Migrations are additive"
  fi
fi

# ── 2b. Pipeline / infra change reminder ─────────────────────────────────────
WORKFLOW_FILES=$(echo "$CHANGED_FILES" | grep -E "^\.github/workflows/|vercel\.json" || true)
if [ -n "$WORKFLOW_FILES" ]; then
  echo ""
  warn "CI/deploy config changed — run the release gate before merging: /gate release <feature>"
fi

# ── 3. TypeScript type-check ──────────────────────────────────────────────────
# Only run for apps with changed TypeScript files.
# packages/ changes affect both apps.

API_CHANGED=$(echo "$CHANGED_FILES" | grep -E "^apps/api/|^packages/" || true)
WEB_CHANGED=$(echo "$CHANGED_FILES" | grep -E "^apps/web/|^packages/" || true)

if [ -n "$API_CHANGED" ]; then
  echo ""
  info "Type-checking API (this takes ~30s)..."
  if (cd apps/api && npx tsc --noEmit 2>&1); then
    pass "API type-check"
  else
    fail "API type-check failed — fix TypeScript errors before pushing"
  fi
fi

if [ -n "$WEB_CHANGED" ]; then
  echo ""
  info "Type-checking Web (this takes ~30s)..."
  if (cd apps/web && npx tsc --noEmit 2>&1); then
    pass "Web type-check"
  else
    fail "Web type-check failed — fix TypeScript errors before pushing"
  fi
fi

# ── Result ────────────────────────────────────────────────────────────────────
echo ""
echo "──────────────────────────────────────────"

if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}✗ Pre-push gate: $ERRORS error(s) found.${NC}"
  echo "  Fix the issues above before pushing."
  echo "  Emergency bypass: git push --no-verify"
  echo ""
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}⚠ Pre-push gate: passed with $WARNINGS warning(s). Review them above.${NC}"
  echo ""
  echo "  Before opening a PR:"
  echo "  /code-review      — review for correctness"
  echo "  /security-review  — check for security issues (required for migration PRs)"
  echo ""
  exit 0
else
  echo -e "${GREEN}✓ Pre-push gate: all checks passed.${NC}"
  echo ""
  echo "  Before opening a PR:"
  echo "  /code-review      — review for correctness"
  echo "  /security-review  — check for security issues"
  echo ""
  exit 0
fi
