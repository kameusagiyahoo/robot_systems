from __future__ import annotations

import math
import threading
import time
from copy import deepcopy
from typing import Any, Dict, Optional

from bridges.python.environment_bridge_core import EnvironmentBackend


def _yaw_from_quaternion(x: float, y: float, z: float, w: float) -> float:
    siny_cosp = 2.0 * (w * z + x * y)
    cosy_cosp = 1.0 - 2.0 * (y * y + z * z)
    return math.atan2(siny_cosp, cosy_cosp)


def _distance(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    return math.hypot(float(a.get("x", 0)) - float(b.get("x", 0)), float(a.get("y", 0)) - float(b.get("y", 0)))


class Ros2TwistForkliftBackend(EnvironmentBackend):
    """Reference ROS 2 bridge using nav_msgs/Odometry and geometry_msgs/Twist.

    This backend is intentionally generic. It is suitable for bridge/integration
    checks when a robot or Gazebo model already exposes /odom and /cmd_vel.
    A production forklift should normally replace it with an Ackermann/rear-steer
    controller backend and real contact/fork feedback.
    """

    environment_id = "ros2_twist_reference"
    label = "ROS 2 Twist Reference"
    version = 1
    kind = "simulation_or_hardware"
    fidelity = "integration_reference"

    def __init__(
        self,
        *,
        node_name: str = "robot_systems_environment_bridge",
        odom_topic: str = "/odom",
        cmd_vel_topic: str = "/cmd_vel",
        fork_topic: Optional[str] = None,
        world: Optional[Dict[str, Any]] = None,
        wheelbase: float = 1.2,
        body_length: float = 1.8,
        body_width: float = 1.0,
        max_linear_speed: float = 1.5,
        max_reverse_speed: float = 1.0,
        max_steering_angle_deg: float = 35.0,
        rear_steer_sign: float = -1.0,
        detection_range: float = 3.0,
    ):
        try:
            import rclpy
            from rclpy.node import Node
            from nav_msgs.msg import Odometry
            from geometry_msgs.msg import Twist
            from std_msgs.msg import Float64
        except ImportError as exc:
            raise RuntimeError("ROS2 Python packages are required inside a ROS 2 environment") from exc

        self.rclpy = rclpy
        self.Node = Node
        self.Odometry = Odometry
        self.Twist = Twist
        self.Float64 = Float64
        if not rclpy.ok():
            rclpy.init(args=None)
        self.node = Node(node_name)
        self.cmd_pub = self.node.create_publisher(Twist, cmd_vel_topic, 10)
        self.fork_pub = self.node.create_publisher(Float64, fork_topic, 10) if fork_topic else None
        self.node.create_subscription(Odometry, odom_topic, self._on_odom, 20)

        self.wheelbase = float(wheelbase)
        self.body_length = float(body_length)
        self.body_width = float(body_width)
        self.max_linear_speed = float(max_linear_speed)
        self.max_reverse_speed = float(max_reverse_speed)
        self.max_steering_angle_deg = float(max_steering_angle_deg)
        self.rear_steer_sign = float(rear_steer_sign)
        self.detection_range = float(detection_range)
        self.lock = threading.RLock()
        self.last_odom_time: Optional[float] = None
        self.last_pose: Optional[tuple[float, float]] = None
        self.metrics_state = {"pathLength": 0.0, "controlTicks": 0, "collisions": 0}
        self._running = False
        self._spin_thread: Optional[threading.Thread] = None

        world = world or {}
        self._state: Dict[str, Any] = {
            "robot": {"x": 0.0, "y": 0.0, "yaw": 0.0, "speed": 0.0, "angularVelocity": 0.0, "steeringAngle": 0.0, "forkRaised": False, "carrying": None, "aligned": False},
            "pallets": deepcopy(world.get("pallets") or {}),
            "locations": deepcopy(world.get("locations") or {}),
            "perception": {"detectedPallets": []},
            "obstacle": {"enabled": False},
            "failures": {},
            "path": {"active": False, "index": 0, "waypoints": [], "densePoints": [], "lookaheadTarget": None},
            "simulation": {
                "dt": 0.08,
                "pathLength": 0.0,
                "controlTicks": 0,
                "collisions": 0,
                "vehicleModel": "ros2_twist_rear_steer_approximation",
                "controller": "pure_pursuit",
                "lookaheadDistance": max(0.4, wheelbase),
                "batchMode": False,
                "wheelbase": self.wheelbase,
                "bodyLength": self.body_length,
                "bodyWidth": self.body_width,
                "maxLinearSpeed": self.max_linear_speed,
                "maxReverseSpeed": self.max_reverse_speed,
                "maxAcceleration": 1.0,
                "maxSteeringAngle": self.max_steering_angle_deg,
                "maxSteeringRate": 90.0,
                "pid": {"kp": 0.8, "ki": 0.01, "kd": 0.18, "cteGain": 1.2},
            },
            "spatial": {"schema": "robot_systems.spatial_state.v1", "robotPose": None, "entities": {}},
        }

    def connect(self) -> None:
        if self._running:
            return
        self._running = True
        self._spin_thread = threading.Thread(target=self._spin, name="robot-systems-ros2-spin", daemon=True)
        self._spin_thread.start()

    def close(self) -> None:
        self._running = False
        if self._spin_thread:
            self._spin_thread.join(timeout=1.0)
        try:
            self.node.destroy_node()
        finally:
            if self.rclpy.ok():
                self.rclpy.shutdown()

    def _spin(self) -> None:
        while self._running and self.rclpy.ok():
            self.rclpy.spin_once(self.node, timeout_sec=0.05)

    def _on_odom(self, msg) -> None:
        p = msg.pose.pose.position
        q = msg.pose.pose.orientation
        yaw = _yaw_from_quaternion(q.x, q.y, q.z, q.w)
        speed = float(msg.twist.twist.linear.x)
        angular = float(msg.twist.twist.angular.z)
        now = time.time()
        with self.lock:
            if self.last_pose is not None:
                self.metrics_state["pathLength"] += math.hypot(float(p.x) - self.last_pose[0], float(p.y) - self.last_pose[1])
            self.last_pose = (float(p.x), float(p.y))
            self.last_odom_time = now
            r = self._state["robot"]
            r.update({"x": float(p.x), "y": float(p.y), "yaw": math.degrees(yaw) % 360.0, "speed": speed, "angularVelocity": angular})
            self._state["spatial"]["robotPose"] = {
                "frame": msg.header.frame_id or "odom",
                "position": {"x": float(p.x), "y": float(p.y), "z": float(p.z)},
                "orientation": {"x": float(q.x), "y": float(q.y), "z": float(q.z), "w": float(q.w)},
            }
            self._sync_metrics_to_state()

    def _sync_metrics_to_state(self) -> None:
        sim = self._state["simulation"]
        sim["pathLength"] = self.metrics_state["pathLength"]
        sim["controlTicks"] = self.metrics_state["controlTicks"]
        sim["collisions"] = self.metrics_state["collisions"]

    def describe(self) -> Dict[str, Any]:
        base = super().describe()
        base.update({
            "coordinateFrame": {"name": "odom/world from ROS 2", "dimensions": 3, "angleCompatibility": "degrees in task-state yaw; quaternion in spatial state"},
            "units": {"length": "m", "time": "s", "speed": "m/s"},
            "intendedUse": "ROS2/Gazebo integration reference. Replace Twist mapping for production forklift dynamics.",
            "capabilities": {
                **base["capabilities"],
                "reset": False,
                "trialConfiguration": False,
                "pose2d": True,
                "pose3d": True,
                "rgb": False,
                "depth": False,
                "lidar": False,
                "contact": False,
                "jointState": False,
                "forkActuation": self.fork_pub is not None,
                "palletManipulation": False,
                "teleport": False,
                "domainServices": list(self.domain_services()),
            },
            "topics": {"command": self.cmd_pub.topic_name, "fork": self.fork_pub.topic_name if self.fork_pub else None},
        })
        return base

    def state(self) -> Dict[str, Any]:
        with self.lock:
            return deepcopy(self._state)

    def step(self, action: Dict[str, Any]) -> Dict[str, Any]:
        action_type = action.get("type")
        if action_type == "stop":
            action = {"type": "drive", "speed": 0.0, "steeringAngle": 0.0}
            action_type = "drive"
        if action_type == "drive":
            speed = float(action.get("speed", 0.0))
            steer_deg = max(-self.max_steering_angle_deg, min(self.max_steering_angle_deg, float(action.get("steeringAngle", 0.0))))
            speed = max(-self.max_reverse_speed, min(self.max_linear_speed, speed))
            yaw_rate = self.rear_steer_sign * speed / max(self.wheelbase, 1e-6) * math.tan(math.radians(steer_deg))
            msg = self.Twist();msg.linear.x = speed;msg.angular.z = yaw_rate;self.cmd_pub.publish(msg)
            with self.lock:
                self._state["robot"]["steeringAngle"] = steer_deg
                self.metrics_state["controlTicks"] += 1
                self._sync_metrics_to_state()
            return {"ok": True, "type": "drive", "speed": speed, "steeringAngle": steer_deg, "yawRateCommand": yaw_rate}
        if action_type == "fork":
            if self.fork_pub is None:
                return {"ok": False, "reason": "fork_topic_not_configured"}
            raised = bool(action.get("raised"))
            msg = self.Float64();msg.data = 1.0 if raised else 0.0;self.fork_pub.publish(msg)
            with self.lock:
                self._state["robot"]["forkRaised"] = raised
            return {"ok": True, "type": "fork", "raised": raised}
        return {"ok": False, "reason": f"unsupported_action:{action_type}"}

    def reset(self, options: Dict[str, Any]) -> Any:
        raise RuntimeError("reset_not_supported_by_generic_ros2_backend")

    def configure_trial(self, spec: Dict[str, Any]) -> Any:
        raise RuntimeError("trial_configuration_requires_simulator_specific_backend")

    def metrics(self) -> Dict[str, Any]:
        with self.lock:
            return deepcopy(self.metrics_state)

    def domain_services(self):
        services = ["path.to", "path.palletApproach", "target.palletDock", "target.locationApproach", "target.retreat", "perception.palletVisible", "perception.markDetected", "robot.setAligned", "motion.ioProfile"]
        if self.fork_pub is not None:
            services.append("manipulation.setFork")
        return services

    def domain_call(self, name: str, args: list[Any]) -> Any:
        with self.lock:
            state = self._state
            if name == "path.to":
                return [args[0]]
            if name == "path.palletApproach":
                p = args[0];return [{"x": float(p["x"]) - 2.4 * self.wheelbase, "y": float(p["y"])}, {"x": float(p["x"]) - 1.8 * self.wheelbase, "y": float(p["y"])}]
            if name == "target.palletDock":
                p = args[0];return {"x": float(p["x"]) - 1.25 * self.wheelbase, "y": float(p["y"]), "yaw": float(p.get("yaw", 0.0))}
            if name == "target.locationApproach":
                l = args[0];return {"x": float(l["x"]) - 1.2 * self.wheelbase, "y": float(l["y"])}
            if name == "target.retreat":
                r = args[0] if args else state["robot"];distance = float(args[1]) if len(args) > 1 else 1.2 * self.wheelbase;a = math.radians(float(r.get("yaw", 0.0)));return {"x": float(r["x"]) - math.cos(a) * distance, "y": float(r["y"]) - math.sin(a) * distance}
            if name == "perception.palletVisible":
                pallet = args[0];robot = args[1] if len(args) > 1 else state["robot"];return _distance(robot, pallet) <= self.detection_range
            if name == "perception.markDetected":
                pallet_id = str(args[0]);items = state["perception"]["detectedPallets"];
                if pallet_id not in items: items.append(pallet_id)
                return {"ok": True}
            if name == "robot.setAligned":
                state["robot"]["aligned"] = bool(args[0]);return {"ok": True}
            if name == "manipulation.setFork":
                return self.step({"type": "fork", "raised": bool(args[0])})
            if name == "motion.ioProfile":
                skill_id = str(args[0]);forward_scale = 3 * self.wheelbase if skill_id in {"align_to_pallet", "retreat"} else 10 * self.wheelbase;lateral_scale = 3 * self.body_width if skill_id in {"align_to_pallet", "retreat"} else 8 * self.body_width;speed_scale = self.max_reverse_speed if skill_id == "retreat" else self.max_linear_speed;return {"normalizationFamily": "vehicle_relative.v1", "forwardScale": forward_scale, "lateralScale": lateral_scale, "speedScale": speed_scale, "actionSpeedScale": speed_scale, "steeringScale": self.max_steering_angle_deg}
        raise RuntimeError(f"domain_service_not_supported:{name}")
