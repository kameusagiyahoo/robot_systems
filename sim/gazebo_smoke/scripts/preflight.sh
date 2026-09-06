#!/usr/bin/env bash
set -euo pipefail

failed=0
check_cmd(){
  local cmd="$1"
  if command -v "$cmd" >/dev/null 2>&1; then echo "[OK] command $cmd -> $(command -v "$cmd")"; else echo "[NG] command $cmd missing"; failed=1; fi
}

check_cmd python3
check_cmd ros2
check_cmd gz
check_cmd colcon

if [[ -z "${ROS_DISTRO:-}" ]]; then
  echo "[NG] ROS_DISTRO is not set. Run: source /opt/ros/jazzy/setup.bash"
  failed=1
else
  echo "[OK] ROS_DISTRO=${ROS_DISTRO}"
fi

if command -v ros2 >/dev/null 2>&1; then
  for pkg in ros_gz_sim ros_gz_bridge geometry_msgs nav_msgs sensor_msgs; do
    if ros2 pkg prefix "$pkg" >/dev/null 2>&1; then echo "[OK] ROS package $pkg"; else echo "[NG] ROS package $pkg missing"; failed=1; fi
  done
fi

python3 - <<'PY' || failed=1
mods=['fastapi','uvicorn']
missing=[]
for name in mods:
    try: __import__(name)
    except Exception: missing.append(name)
if missing:
    raise SystemExit('[NG] Python modules missing: '+', '.join(missing)+'\nInstall in a venv if needed: python3 -m pip install -r bridges/python/requirements.txt')
print('[OK] Python Bridge modules fastapi / uvicorn')
PY

if [[ "$failed" -ne 0 ]]; then
  echo
  echo "Preflight FAILED. Resolve [NG] items before launching Gazebo."
  exit 2
fi

echo
echo "Preflight PASSED. Next: colcon build --base-paths sim/gazebo_smoke --packages-select robot_systems_gazebo_smoke"
