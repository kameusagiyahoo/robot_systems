from __future__ import annotations

import json
import os
from pathlib import Path

from bridges.gazebo.gazebo_ros2_backend import GazeboRos2ForkliftBackend
from bridges.python.http_server import create_app


def _load_world():
    path = os.environ.get("ROBOT_SYSTEMS_WORLD_JSON", "")
    if not path:
        return {}
    return json.loads(Path(path).read_text(encoding="utf-8"))


def build_backend():
    world = _load_world()
    return GazeboRos2ForkliftBackend(
        world_name=os.environ.get("GAZEBO_WORLD", "default"),
        robot_entity=os.environ.get("GAZEBO_ROBOT_ENTITY", "forklift"),
        pallet_entities=world.get("palletEntities") or {},
        world=world,
        odom_topic=os.environ.get("ROBOT_ODOM_TOPIC", "/odom"),
        cmd_vel_topic=os.environ.get("ROBOT_CMD_TOPIC", "/cmd_vel"),
        fork_topic=os.environ.get("ROBOT_FORK_COMMAND_TOPIC") or None,
        fork_joint_name=os.environ.get("ROBOT_FORK_JOINT") or None,
        rgb_topic=os.environ.get("ROBOT_RGB_TOPIC") or None,
        depth_topic=os.environ.get("ROBOT_DEPTH_TOPIC") or None,
        lidar_topic=os.environ.get("ROBOT_LIDAR_TOPIC") or None,
        joint_state_topic=os.environ.get("ROBOT_JOINT_STATE_TOPIC", "/joint_states") or None,
        contact_topic=os.environ.get("ROBOT_CONTACT_TOPIC") or None,
        set_pose_service=os.environ.get("GAZEBO_SET_POSE_SERVICE") or None,
        wheelbase=float(os.environ.get("ROBOT_WHEELBASE", "1.2")),
        body_length=float(os.environ.get("ROBOT_BODY_LENGTH", "1.8")),
        body_width=float(os.environ.get("ROBOT_BODY_WIDTH", "1.0")),
        max_linear_speed=float(os.environ.get("ROBOT_MAX_LINEAR_SPEED", "1.5")),
        max_reverse_speed=float(os.environ.get("ROBOT_MAX_REVERSE_SPEED", "1.0")),
        max_steering_angle_deg=float(os.environ.get("ROBOT_MAX_STEERING_DEG", "35")),
    )


backend = build_backend()
app = create_app(backend)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=os.environ.get("BRIDGE_HOST", "0.0.0.0"), port=int(os.environ.get("BRIDGE_PORT", "8000")))
