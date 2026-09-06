#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
PORT="${UI_PORT:-8080}"

echo "Serving robot_systems UI at http://127.0.0.1:${PORT}/"
echo "Use External Environment Bridge settings with: http://127.0.0.1:8000"
cd "${REPO_ROOT}"
python3 -m http.server "${PORT}" --bind 127.0.0.1
