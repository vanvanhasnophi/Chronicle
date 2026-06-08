#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_SCRIPT="$SCRIPT_DIR/scripts/delete_all_passkeys.js"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is not installed or not in PATH"
  exit 1
fi

if [ ! -f "$NODE_SCRIPT" ]; then
  echo "Error: Node script not found: $NODE_SCRIPT"
  exit 1
fi

echo "This will backup and remove all stored passkeys in server/data/security.json."
read -r -p "Proceed? [y/N] " answer
case "$answer" in
  [yY]|[yY][eE][sS])
    node "$NODE_SCRIPT"
    ;;
  *)
    echo "Aborted. No changes made."
    exit 0
    ;;
esac

echo "Finished. If server is running, restart it to apply changes." 
