#!/usr/bin/env bash
set -euo pipefail

BRIDGE_URL="${BRIDGE_URL:-http://127.0.0.1:8000}"

if [[ -z "${ROS_DISTRO:-}" ]]; then
  echo "ROS 2 environment is not sourced." >&2
  exit 1
fi

required_topics=(/cmd_vel /odom /camera /scan)
all_topics="$(ros2 topic list)"
failed=0
for topic in "${required_topics[@]}"; do
  if grep -qx "$topic" <<<"$all_topics"; then
    echo "[OK] topic $topic"
  else
    echo "[NG] topic $topic"
    failed=1
  fi
done

if command -v curl >/dev/null 2>&1; then
  echo "--- Bridge health ---"
  curl -fsS "${BRIDGE_URL}/health" >/tmp/robot_systems_bridge_health.json
  python3 - <<'PY'
import json
p='/tmp/robot_systems_bridge_health.json'
d=json.load(open(p, encoding='utf-8'))
print('[OK] bridge health' if d.get('ok') else '[NG] bridge health')
env=d.get('environment') or {}
print('environment:', env.get('id'), 'fidelity=', env.get('fidelity'))
print('capabilities:', env.get('capabilities'))
PY

  echo "--- Protocol handshake ---"
  curl -fsS -X POST "${BRIDGE_URL}/environment" \
    -H 'content-type: application/json' \
    -d '{"protocol":"robot_systems.environment_bridge.v1","requestId":"smoke-check","command":"handshake","payload":{"client":{"name":"shell_smoke_check"}}}' \
    >/tmp/robot_systems_bridge_handshake.json
  python3 - <<'PY'
import json
p='/tmp/robot_systems_bridge_handshake.json'
d=json.load(open(p, encoding='utf-8'))
if not d.get('ok'):
    raise SystemExit('[NG] handshake: '+str(d.get('error')))
print('[OK] handshake protocol=', d.get('protocol'))
r=(d.get('state') or {}).get('robot') or {}
print('robot pose:', r.get('x'), r.get('y'), r.get('yaw'))
PY
else
  echo "[WARN] curl not installed; Bridge HTTP check skipped"
fi

if [[ "$failed" -ne 0 ]]; then
  exit 2
fi

echo "Smoke stack contract check passed."
