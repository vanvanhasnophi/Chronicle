#!/usr/bin/env bash
set -euo pipefail

echo "Stopping Chronicle dev services..."

# Kill processes listening on common dev ports (3000 backend, 4321 frontend)
for PORT in 3000 4321 4322 4323 5173 5174 5175; do
  PIDS=$(lsof -t -i :${PORT} -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "${PIDS}" ]; then
    echo "Killing processes on port ${PORT}: ${PIDS}"
    echo "${PIDS}" | xargs -r kill -TERM || true
  else
    echo "No listener on port ${PORT}"
  fi
done

# Fallback: try to pkill common dev commands (no-op if none)
pkill -f "node index.js" 2>/dev/null || true
pkill -f "astro dev" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true

echo "Done."

exit 0
