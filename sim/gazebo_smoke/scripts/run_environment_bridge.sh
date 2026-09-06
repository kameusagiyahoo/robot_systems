#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMOKE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${SMOKE_DIR}/../.." && pwd)"

if [[ -z "${ROS_DISTRO:-}" ]]; then
  echo "ROS 2 environment is not sourced. Example: source /opt/ros/jazzy/setup.bash" >&2
  exit 1
fi

export PYTHONPATH="${REPO_ROOT}:${PYTHONPATH:-}"
export ROBOT_SYSTEMS_WORLD_JSON="${ROBOT_SYSTEMS_WORLD_JSON:-${SMOKE_DIR}/config/environment.json}"
export GAZEBO_WORLD="${GAZEBO_WORLD:-default}"
export GAZEBO_ROBOT_ENTITY="${GAZEBO_ROBOT_ENTITY:-forklift}"
export ROBOT_ODOM_TOPIC="${ROBOT_ODOM_TOPIC:-/odom}"
export ROBOT_CMD_TOPIC="${ROBOT_CMD_TOPIC:-/cmd_vel}"
export ROBOT_RGB_TOPIC="${ROBOT_RGB_TOPIC:-/camera}"
export ROBOT_LIDAR_TOPIC="${ROBOT_LIDAR_TOPIC:-/scan}"
export ROBOT_JOINT_STATE_TOPIC="${ROBOT_JOINT_STATE_TOPIC:-}"
export ROBOT_WHEELBASE="${ROBOT_WHEELBASE:-1.12}"
export ROBOT_BODY_LENGTH="${ROBOT_BODY_LENGTH:-1.7}"
export ROBOT_BODY_WIDTH="${ROBOT_BODY_WIDTH:-1.0}"
export ROBOT_MAX_LINEAR_SPEED="${ROBOT_MAX_LINEAR_SPEED:-1.2}"
export ROBOT_MAX_REVERSE_SPEED="${ROBOT_MAX_REVERSE_SPEED:-0.8}"
export BRIDGE_HOST="${BRIDGE_HOST:-0.0.0.0}"
export BRIDGE_PORT="${BRIDGE_PORT:-8000}"
export ROBOT_SYSTEMS_ALLOWED_ORIGINS="${ROBOT_SYSTEMS_ALLOWED_ORIGINS:-http://127.0.0.1:8080,http://localhost:8080}"

cat <<EOF
robot_systems Environment Bridge
  ROS_DISTRO : ${ROS_DISTRO}
  world      : ${ROBOT_SYSTEMS_WORLD_JSON}
  odom       : ${ROBOT_ODOM_TOPIC}
  command    : ${ROBOT_CMD_TOPIC}
  rgb        : ${ROBOT_RGB_TOPIC}
  lidar      : ${ROBOT_LIDAR_TOPIC}
  endpoint   : http://127.0.0.1:${BRIDGE_PORT}/environment
  CORS       : ${ROBOT_SYSTEMS_ALLOWED_ORIGINS}
EOF

cd "${REPO_ROOT}"
python3 -m bridges.gazebo.run_bridge
