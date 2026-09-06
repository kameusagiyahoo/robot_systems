#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import os
import time
import urllib.request

PROTOCOL = "robot_systems.environment_bridge.v1"
URL = os.environ.get("BRIDGE_ENDPOINT", "http://127.0.0.1:8000/environment")


def call(command: str, payload=None):
    body = json.dumps({
        "protocol": PROTOCOL,
        "requestId": f"bridge-drive-{command}-{time.time_ns()}",
        "command": command,
        "payload": payload or {},
    }).encode("utf-8")
    request = urllib.request.Request(URL, data=body, headers={"content-type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=5) as response:
        result = json.loads(response.read().decode("utf-8"))
    if not result.get("ok"):
        raise RuntimeError(result.get("error") or f"bridge command failed: {command}")
    return result


def robot_pose(result):
    state = result.get("state") or {}
    robot = state.get("robot") or {}
    return float(robot.get("x", 0.0)), float(robot.get("y", 0.0)), float(robot.get("yaw", 0.0))


def main():
    handshake = call("handshake", {"client": {"name": "gazebo_bridge_drive_test"}})
    descriptor = handshake.get("descriptor") or {}
    print("environment:", descriptor.get("id"), "fidelity=", descriptor.get("fidelity"))

    before = call("observe")
    x0, y0, yaw0 = robot_pose(before)
    print(f"before: x={x0:.3f} y={y0:.3f} yaw={yaw0:.1f}")

    try:
        for _ in range(15):
            call("step", {"action": {"type": "drive", "speed": 0.45, "steeringAngle": 0.0, "dt": 0.08}})
            time.sleep(0.08)
    finally:
        call("step", {"action": {"type": "stop"}})

    time.sleep(0.35)
    after = call("observe")
    x1, y1, yaw1 = robot_pose(after)
    moved = math.hypot(x1 - x0, y1 - y0)
    print(f"after : x={x1:.3f} y={y1:.3f} yaw={yaw1:.1f}")
    print(f"moved : {moved:.3f} m")

    if moved < 0.05:
        raise SystemExit("FAIL: Bridge step did not produce observable Gazebo motion")
    print("PASS: Bridge -> ROS -> Gazebo -> odom -> Bridge round trip")


if __name__ == "__main__":
    main()
