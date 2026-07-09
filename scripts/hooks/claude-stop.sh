#!/usr/bin/env bash
# Runs when a Claude Code session ends.
# Shows quality reminders if files were changed in this session.

CHANGED=$(git diff --name-only HEAD 2>/dev/null | grep -E "\.(ts|tsx|sql)$" | head -5 || true)
STAGED=$(git diff --cached --name-only 2>/dev/null | grep -E "\.(ts|tsx|sql)$" | head -5 || true)

if [ -n "$CHANGED" ] || [ -n "$STAGED" ]; then
  echo ""
  echo "─────────────────────────────────────────────"
  echo "  🔒 Quality gates before pushing:"
  echo ""
  echo "     /code-review           review for bugs + correctness"
  echo "     /security-review       required if migrations changed"
  echo "     /verify                run golden paths in browser"
  echo ""
  echo "  📋 Pre-push checklist (CLAUDE.md):"
  echo "     lint + typecheck + tests must pass"
  echo "─────────────────────────────────────────────"
  echo ""
fi
