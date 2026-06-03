#!/bin/sh
set -eu

echo "[stagewise dummy setup] started"
echo "cwd: $(pwd)"
echo "source worktree: ${STAGEWISE_SOURCE_WORKTREE_PATH:-unset}"
echo "target worktree: ${STAGEWISE_TARGET_WORKTREE_PATH:-unset}"
echo "main worktree: ${STAGEWISE_MAIN_WORKTREE_PATH:-unset}"

# Make the async setup state visible in the UI.
sleep 8

# Write under .stagewise/ so the generated file stays gitignored and does not
# dirty the worktree (a dirty worktree would block managed-worktree removal).
cat > .stagewise/dummy-setup-result.txt <<EOF
Dummy worktree setup completed at $(date -u +%Y-%m-%dT%H:%M:%SZ)
Source worktree: ${STAGEWISE_SOURCE_WORKTREE_PATH:-unset}
Target worktree: ${STAGEWISE_TARGET_WORKTREE_PATH:-unset}
Main worktree: ${STAGEWISE_MAIN_WORKTREE_PATH:-unset}
EOF

echo "[stagewise dummy setup] wrote .stagewise/dummy-setup-result.txt"
echo "[stagewise dummy setup] finished"
