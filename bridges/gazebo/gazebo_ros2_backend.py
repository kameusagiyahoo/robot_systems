from __future__ import annotations

import base64
import math
import time
from copy import deepcopy
from typing import Any, Dict, Optional

from bridges.ros2.ros2_twist_backend import Ros2TwistForkliftBackend

SENSOR_PACKET_SCHEMA = "robot_systems.sensor_packet.v1"


def _stamp_seconds(header: Any) -> float:
    try:
        stamp = header.stamp
        return float(stamp.sec) + float(stamp.nanosec) * 1e-9
    except Exception:
        return time.time()


def _yaw_quaternion(yaw_deg: float) -> tuple[float, float, float, float]:
    half = math.radians(float(yaw_deg)) * 0.5
    return 0.0, 0.0, math.sin(half), math.cos(half)


class GazeboRos2ForkliftBackend(Ros2TwistForkliftBackend):
    """Gazebo-specific ROS 2 backend.

    Motion uses the common ROS 2 odometry / pluggable drive-command boundary.
    Gazebo-only concerns (teleporting entities, RGB/depth/lidar, joints and
    contacts) stay in this adapter so Planner / Skill / Learning code never
    depends on Gazebo APIs.
    """

    environment_id = "gazebo_ros2_forklift"
    label = "Gazebo ROS 2 Forklift"
    version = 2
    kind = "simulation"
    fidelity = "physics_sensor"

    def __init__(
        self,
        *,
        world_name: str = "default",
        robot_entity: str = "forklift",
        pallet_entities: Optional[Dict[str, str]] = None,
        rgb_topic: Optional[str] = None,
        depth_topic: Optional[str] = None,
        lidar_topic: Optional[str] = None,
        joint_state_topic: Optional[str] = "/joint_states",
        contact_topic: Optional[str] = None,
        set_pose_service: Optional[str] = None,
        fork_joint_name: Optional[str] = None,
        fork_raised_threshold: float = 0.05,
        **kwargs,
    ):
        world = deepcopy(kwargs.get("world") or {})
        self.initial_world = deepcopy(world)
        self.world_name = world_name
        self.robot_entity = robot_entity
        self.pallet_entities = dict(pallet_entities or world.get("palletEntities") or {})
        self.fork_joint_name = fork_joint_name
        self.fork_raised_threshold = float(fork_raised_threshold)
        self.sensor_topics = {
            "rgb": rgb_topic,
            "depth": depth_topic,
            "lidar": lidar_topic,
            "joint_state": joint_state_topic,
            "contact": contact_topic,
        }
        self._sensor_messages: Dict[str, Any] = {}
        self._contact_active = False
        super().__init__(**kwargs)
        self._state.setdefault("sensors", {})
        self._state.setdefault("spatial", {}).setdefault("joints", {})

        try:
            from sensor_msgs.msg import Image, LaserScan, JointState
        except ImportError as exc:
            raise RuntimeError("sensor_msgs is required for GazeboRos2ForkliftBackend") from exc
        self.Image = Image
        self.LaserScan = LaserScan
        self.JointState = JointState

        try:
            from ros_gz_interfaces.msg import Contacts
        except ImportError:
            Contacts = None
        self.Contacts = Contacts

        try:
            from ros_gz_interfaces.srv import SetEntityPose
        except ImportError:
            SetEntityPose = None
        self.SetEntityPose = SetEntityPose
        service_name = str(set_pose_service).strip() if set_pose_service else None
        self.set_pose_service = service_name
        self.set_pose_client = self.node.create_client(SetEntityPose, service_name) if SetEntityPose and service_name else None

        if rgb_topic:
            self.node.create_subscription(Image, rgb_topic, lambda msg: self._on_image("rgb", msg), 2)
        if depth_topic:
            self.node.create_subscription(Image, depth_topic, lambda msg: self._on_image("depth", msg), 2)
        if lidar_topic:
            self.node.create_subscription(LaserScan, lidar_topic, self._on_lidar, 5)
        if joint_state_topic:
            self.node.create_subscription(JointState, joint_state_topic, self._on_joint_state, 10)
        if contact_topic and Contacts is not None:
            self.node.create_subscription(Contacts, contact_topic, self._on_contacts, 10)

    def _sensor_meta(self, sensor_id: str, sensor_type: str, frame: str, timestamp: float, **extra) -> None:
        self._state["sensors"][sensor_id] = {
            "schema": SENSOR_PACKET_SCHEMA,
            "sensorId": sensor_id,
            "type": sensor_type,
            "frame": frame or sensor_id,
            "timestamp": timestamp,
            "available": True,
            **extra,
        }

    def _on_image(self, sensor_id: str, msg: Any) -> None:
        with self.lock:
            self._sensor_messages[sensor_id] = msg
            self._sensor_meta(sensor_id, sensor_id, msg.header.frame_id, _stamp_seconds(msg.header), shape=[int(msg.height), int(msg.width)], encoding=msg.encoding)

    def _on_lidar(self, msg: Any) -> None:
        with self.lock:
            self._sensor_messages["lidar"] = msg
            self._sensor_meta("lidar", "lidar", msg.header.frame_id, _stamp_seconds(msg.header), samples=len(msg.ranges))

    def _on_joint_state(self, msg: Any) -> None:
        with self.lock:
            self._sensor_messages["joint_state"] = msg
            positions = {name: float(pos) for name, pos in zip(msg.name, msg.position)}
            self._state["spatial"]["joints"] = positions
            if self.fork_joint_name and self.fork_joint_name in positions:
                self._state["robot"]["forkRaised"] = positions[self.fork_joint_name] >= self.fork_raised_threshold
            self._sensor_meta("joint_state", "joint_state", msg.header.frame_id or "robot", _stamp_seconds(msg.header), joints=len(msg.name))

    def _on_contacts(self, msg: Any) -> None:
        count = len(getattr(msg, "contacts", []) or [])
        with self.lock:
            self._sensor_messages["contact"] = msg
            active = count > 0
            if active and not self._contact_active:
                self.metrics_state["collisions"] += 1
            self._contact_active = active
            self._sync_metrics_to_state()
            header = getattr(msg, "header", None)
            self._sensor_meta("contact", "contact", getattr(header, "frame_id", "contact") if header else "contact", _stamp_seconds(header) if header else time.time(), count=count, active=active)

    def sensor_manifest(self) -> list[Dict[str, Any]]:
        result = []
        for sensor_id, topic in self.sensor_topics.items():
            if not topic:
                continue
            if sensor_id == "contact" and self.Contacts is None:
                continue
            result.append({
                "sensorId": sensor_id,
                "type": sensor_id,
                "topic": topic,
                "transport": "environment_bridge.sensor_read",
                "available": sensor_id in self._sensor_messages,
            })
        return result

    def read_sensor(self, sensor_id: str, options: Dict[str, Any]) -> Dict[str, Any]:
        metadata_only = bool(options.get("metadataOnly", False))
        with self.lock:
            msg = self._sensor_messages.get(sensor_id)
            if msg is None:
                raise RuntimeError(f"sensor_frame_unavailable:{sensor_id}")
            meta = deepcopy(self._state["sensors"].get(sensor_id) or {})

            if sensor_id in {"rgb", "depth"}:
                data = None if metadata_only else base64.b64encode(bytes(msg.data)).decode("ascii")
                return {
                    "schema": SENSOR_PACKET_SCHEMA,
                    "sensorId": sensor_id,
                    "type": sensor_id,
                    "frame": msg.header.frame_id or sensor_id,
                    "timestamp": _stamp_seconds(msg.header),
                    "encoding": f"base64:{msg.encoding}",
                    "shape": [int(msg.height), int(msg.width)],
                    "data": data,
                    "meta": {"step": int(msg.step), "isBigendian": bool(msg.is_bigendian), "sourceTopic": self.sensor_topics[sensor_id], **meta},
                }
            if sensor_id == "lidar":
                return {
                    "schema": SENSOR_PACKET_SCHEMA,
                    "sensorId": "lidar",
                    "type": "lidar",
                    "frame": msg.header.frame_id or "lidar",
                    "timestamp": _stamp_seconds(msg.header),
                    "encoding": "json",
                    "shape": [len(msg.ranges)],
                    "data": None if metadata_only else {"ranges": list(msg.ranges), "intensities": list(msg.intensities)},
                    "meta": {"angleMin": float(msg.angle_min), "angleMax": float(msg.angle_max), "angleIncrement": float(msg.angle_increment), "rangeMin": float(msg.range_min), "rangeMax": float(msg.range_max), "sourceTopic": self.sensor_topics["lidar"]},
                }
            if sensor_id == "joint_state":
                return {
                    "schema": SENSOR_PACKET_SCHEMA,
                    "sensorId": "joint_state",
                    "type": "joint_state",
                    "frame": msg.header.frame_id or "robot",
                    "timestamp": _stamp_seconds(msg.header),
                    "encoding": "json",
                    "shape": [len(msg.name)],
                    "data": None if metadata_only else {"name": list(msg.name), "position": list(msg.position), "velocity": list(msg.velocity), "effort": list(msg.effort)},
                    "meta": {"sourceTopic": self.sensor_topics["joint_state"]},
                }
            if sensor_id == "contact":
                contacts = list(getattr(msg, "contacts", []) or [])
                return {
                    "schema": SENSOR_PACKET_SCHEMA,
                    "sensorId": "contact",
                    "type": "contact",
                    "frame": meta.get("frame", "contact"),
                    "timestamp": meta.get("timestamp", time.time()),
                    "encoding": "json",
                    "shape": [len(contacts)],
                    "data": None if metadata_only else {"count": len(contacts), "active": len(contacts) > 0},
                    "meta": {"sourceTopic": self.sensor_topics["contact"]},
                }
        raise RuntimeError(f"unknown_sensor:{sensor_id}")

    def _call_set_pose(self, entity_name: str, patch: Dict[str, Any], timeout: float = 2.0) -> None:
        if self.set_pose_client is None:
            raise RuntimeError("gazebo_set_pose_interface_unavailable")
        if not self.set_pose_client.wait_for_service(timeout_sec=min(timeout, 0.5)):
            raise RuntimeError(f"gazebo_set_pose_service_unavailable:{self.set_pose_service}")
        req = self.SetEntityPose.Request()
        req.entity.name = entity_name
        req.entity.type = 2  # MODEL
        req.pose.position.x = float(patch.get("x", 0.0))
        req.pose.position.y = float(patch.get("y", 0.0))
        req.pose.position.z = float(patch.get("z", 0.0))
        qx, qy, qz, qw = _yaw_quaternion(float(patch.get("yaw", 0.0)))
        req.pose.orientation.x = qx;req.pose.orientation.y = qy;req.pose.orientation.z = qz;req.pose.orientation.w = qw
        future = self.set_pose_client.call_async(req)
        deadline = time.time() + timeout
        while not future.done() and time.time() < deadline:
            time.sleep(0.01)
        if not future.done():
            raise TimeoutError(f"gazebo_set_pose_timeout:{entity_name}")
        response = future.result()
        if response is None or not bool(response.success):
            raise RuntimeError(f"gazebo_set_pose_failed:{entity_name}")

    def configure_trial(self, spec: Dict[str, Any]) -> Any:
        if self.set_pose_client is None:
            raise RuntimeError("gazebo_trial_configuration_requires_set_pose_bridge")
        with self.lock:
            if spec.get("reset", True):
                self.metrics_state = {"pathLength": 0.0, "controlTicks": 0, "collisions": 0}
                self.last_pose = None
                self._contact_active = False
                self._sync_metrics_to_state()

        robot_patch = spec.get("robot") or {}
        if robot_patch:
            self._call_set_pose(self.robot_entity, robot_patch)
            with self.lock:
                self._state["robot"].update(robot_patch)

        for pallet_id, patch in (spec.get("pallets") or {}).items():
            entity_name = self.pallet_entities.get(pallet_id, pallet_id)
            if any(k in patch for k in ("x", "y", "z", "yaw")):
                self._call_set_pose(entity_name, patch)
            with self.lock:
                self._state["pallets"].setdefault(pallet_id, {}).update(patch)

        with self.lock:
            for location_id, patch in (spec.get("locations") or {}).items():
                self._state["locations"].setdefault(location_id, {}).update(patch)
            if spec.get("obstacle"):
                self._state["obstacle"].update(spec["obstacle"])
            if spec.get("perception", {}).get("detectedPallets") is not None:
                self._state["perception"]["detectedPallets"] = list(spec["perception"]["detectedPallets"])
            if spec.get("failures"):
                self._state["failures"].update(spec["failures"])
        return self.state()

    def reset(self, options: Dict[str, Any]) -> Any:
        spec = {
            "reset": True,
            "robot": deepcopy(self.initial_world.get("robot") or {"x": 0.0, "y": 0.0, "yaw": 0.0}),
            "pallets": deepcopy(self.initial_world.get("pallets") or {}),
            "locations": deepcopy(self.initial_world.get("locations") or {}),
            "perception": {"detectedPallets": []},
        }
        scenario = options.get("scenario") if options else None
        if scenario:
            spec.update(deepcopy(scenario))
        return self.configure_trial(spec)

    def describe(self) -> Dict[str, Any]:
        base = super().describe()
        caps = dict(base.get("capabilities") or {})
        has_set_pose = self.set_pose_client is not None
        caps.update({
            "reset": has_set_pose,
            "trialConfiguration": has_set_pose,
            "teleport": has_set_pose,
            "pose2d": True,
            "pose3d": True,
            "rgb": bool(self.sensor_topics.get("rgb")),
            "depth": bool(self.sensor_topics.get("depth")),
            "lidar": bool(self.sensor_topics.get("lidar")),
            "contact": bool(self.sensor_topics.get("contact") and self.Contacts is not None),
            "jointState": bool(self.sensor_topics.get("joint_state")),
            "sensorRead": bool(self.sensor_manifest()),
            "physics": True,
            "batch": False,
            "scenarios": False,
            "deterministicSeed": False,
            "domainServices": list(self.domain_services()),
        })
        base.update({
            "id": self.environment_id,
            "label": self.label,
            "version": self.version,
            "kind": self.kind,
            "fidelity": self.fidelity,
            "capabilities": caps,
            "gazebo": {"world": self.world_name, "robotEntity": self.robot_entity, "setPoseService": self.set_pose_service, "palletEntities": self.pallet_entities},
            "sensorManifest": self.sensor_manifest(),
            "intendedUse": "Gazebo physics/sensor experiments behind the common Environment Bridge. Simulator-specific APIs remain inside this backend.",
            "limitations": ["The smoke world uses Twist + differential drive only for integration verification; choose a vehicle-appropriate DriveCommandAdapter for forklift dynamics.", "Insert/Place remain unavailable until explicit contact-aware manipulation services are implemented."],
        })
        return base
