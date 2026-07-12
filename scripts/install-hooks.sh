#!/usr/bin/env bash
# Install Axon Tickets git hooks.
# Run this once after cloning: bash scripts/install-hooks.sh

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"
SCRIPTS_DIR="$REPO_ROOT/scripts/hooks"

echo "Installing Axon Tickets git hooks..."

# pre-push
cat > "$HOOKS_DIR/pre-push" << 'EOF'
#!/usr/bin/env bash
exec "$(git rev-parse --show-toplevel)/scripts/hooks/pre-push.sh"
EOF
chmod +x "$HOOKS_DIR/pre-push"
echo "  ✓ pre-push"

chmod +x "$SCRIPTS_DIR/pre-push.sh"
chmod +x "$SCRIPTS_DIR/claude-stop.sh"

echo ""
echo "Done. Hooks installed:"
echo "  .git/hooks/pre-push → scripts/hooks/pre-push.sh"
echo ""
echo "These run automatically on every git push."
echo "Emergency bypass: git push --no-verify"
