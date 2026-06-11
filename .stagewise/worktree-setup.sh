#!/bin/sh
set -eu

echo "[stagewise setup] started"
echo "cwd: $(pwd)"
echo "source worktree: ${STAGEWISE_SOURCE_WORKTREE_PATH:-unset}"
echo "target worktree: ${STAGEWISE_TARGET_WORKTREE_PATH:-unset}"
echo "main worktree: ${STAGEWISE_MAIN_WORKTREE_PATH:-unset}"

if [ -z "${STAGEWISE_MAIN_WORKTREE_PATH:-}" ]; then
  echo "[stagewise setup] STAGEWISE_MAIN_WORKTREE_PATH is not set" >&2
  exit 1
fi

if [ -z "${STAGEWISE_TARGET_WORKTREE_PATH:-}" ]; then
  echo "[stagewise setup] STAGEWISE_TARGET_WORKTREE_PATH is not set" >&2
  exit 1
fi

main_env_file="$STAGEWISE_MAIN_WORKTREE_PATH/.env.dev"
target_env_file="$STAGEWISE_TARGET_WORKTREE_PATH/.env.dev"

if [ ! -f "$main_env_file" ]; then
  echo "[stagewise setup] Missing $main_env_file" >&2
  exit 1
fi

echo "[stagewise setup] copying .env.dev from main worktree"
cp "$main_env_file" "$target_env_file"

NUCLEO_LICENSE_KEY=$(
  awk '
    /^[[:space:]]*(export[[:space:]]+)?NUCLEO_LICENSE_KEY[[:space:]]*=/ {
      sub(/^[[:space:]]*(export[[:space:]]+)?NUCLEO_LICENSE_KEY[[:space:]]*=[[:space:]]*/, "")
      gsub(/^[[:space:]]+|[[:space:]]+$/, "")
      if ((substr($0, 1, 1) == "\"" && substr($0, length($0), 1) == "\"") || (substr($0, 1, 1) == "'\''" && substr($0, length($0), 1) == "'\''")) {
        $0 = substr($0, 2, length($0) - 2)
      } else {
        sub(/[[:space:]]+#.*$/, "")
        gsub(/^[[:space:]]+|[[:space:]]+$/, "")
      }
      print
      exit
    }
  ' "$target_env_file"
)

if [ -z "$NUCLEO_LICENSE_KEY" ]; then
  echo "[stagewise setup] NUCLEO_LICENSE_KEY is missing in .env.dev" >&2
  exit 1
fi

export NUCLEO_LICENSE_KEY

cd "$STAGEWISE_TARGET_WORKTREE_PATH"

echo "[stagewise setup] running pnpm install"
pnpm install

echo "[stagewise setup] running pnpm build"
pnpm build

echo "[stagewise setup] finished"
