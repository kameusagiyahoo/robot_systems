from __future__ import annotations

import json
import os
from pathlib import Path

from bridges.python.http_server import create_app
from bridges.ros2.ros2_twist_backend import Ros2TwistForkliftBackend


def _load_world():
    path = os.environ.get("ROBOT_SYSTEMS_WORLD_JSON")
    if not path:
        return {}
    return json.loads(Path(path).read_text(encoding="utf-8"))


backend = Ros2TwistForkliftBackend(
    odom_topic=os.environ.get("ROBOT_SYSTEMS_ODOM_TOPIC", "/odom"),
    cmd_vel_topic=os.environ.get("ROBOT_SYSTEMS_CMD_VEL_TOPIC", "/cmd_vel"),
    fork_topic=os.environ.get("ROBOT_SYSTEMS_FORK_TOPIC") or None,
    world=_load_world(),
    wheelbase=float(os.environ.get("ROBOT_SYSTEMS_WHEELBASE", "1.2")),
    body_length=float(os.environ.get("ROBOT_SYSTEMS_BODY_LENGTH", "1.8")),
    body_width=float(os.environ.get("ROBOT_SYSTEMS_BODY_WIDTH", "1.0")),
    max_linear_speed=float(os.environ.get("ROBOT_SYSTEMS_MAX_SPEED", "1.5")),
    max_reverse_speed=float(os.environ.get("ROBOT_SYSTEMS_MAX_REVERSE_SPEED", "1.0")),
    max_steering_angle_deg=float(os.environ.get("ROBOT_SYSTEMS_MAX_STEERING_DEG", "35")),
    rear_steer_sign=float(os.environ.get("ROBOT_SYSTEMS_REAR_STEER_SIGN", "-1")),
    detection_range=float(os.environ.get("ROBOT_SYSTEMS_DETECTION_RANGE", "3.0")),
)

app = create_app(backend)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=os.environ.get("ROBOT_SYSTEMS_BIND", "127.0.0.1"), port=int(os.environ.get("ROBOT_SYSTEMS_PORT", "8765")))
