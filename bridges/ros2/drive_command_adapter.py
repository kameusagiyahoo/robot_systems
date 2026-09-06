from __future__ import annotations

from abc import ABC
import math
from typing import Any, Dict, Optional


class DriveCommandAdapter(ABC):
    adapter_id = "drive_adapter"
    label = "Drive Command Adapter"
    version = 1

    def command(self, speed_mps: float, steering_deg: float) -> Dict[str, Any]:
        raise NotImplementedError

    def stop(self) -> Dict[str, Any]:
        return self.command(0.0, 0.0)

    def describe(self) -> Dict[str, Any]:
        return {"id": self.adapter_id, "label": self.label, "version": self.version}


class TwistDriveCommandAdapter(DriveCommandAdapter):
    adapter_id = "ros2_twist_drive"
    label = "ROS 2 Twist Drive"

    def __init__(self, node, topic: str, *, wheelbase: float, rear_steer_sign: float = -1.0):
        from geometry_msgs.msg import Twist
        self.Twist = Twist
        self.publisher = node.create_publisher(Twist, topic, 10)
        self.wheelbase = float(wheelbase)
        self.rear_steer_sign = float(rear_steer_sign)

    def command(self, speed_mps: float, steering_deg: float) -> Dict[str, Any]:
        yaw_rate = self.rear_steer_sign * float(speed_mps) / max(self.wheelbase, 1e-6) * math.tan(math.radians(float(steering_deg)))
        msg = self.Twist();msg.linear.x = float(speed_mps);msg.angular.z = yaw_rate;self.publisher.publish(msg)
        return {"ok": True, "adapterId": self.adapter_id, "speed": float(speed_mps), "steeringAngle": float(steering_deg), "yawRateCommand": yaw_rate}

    def describe(self):
        return {**super().describe(), "topic": self.publisher.topic_name, "command": "geometry_msgs/Twist", "mapping": "steering angle converted to yaw rate using rear-steer bicycle approximation"}


class AckermannDriveCommandAdapter(DriveCommandAdapter):
    adapter_id = "ros2_ackermann_drive"
    label = "ROS 2 Ackermann Drive"

    def __init__(self, node, topic: str, *, stamped: bool = True):
        try:
            from ackermann_msgs.msg import AckermannDriveStamped, AckermannDrive
        except ImportError as exc:
            raise RuntimeError("ackermann_msgs_not_installed") from exc
        self.stamped = bool(stamped)
        self.Message = AckermannDriveStamped if self.stamped else AckermannDrive
        self.publisher = node.create_publisher(self.Message, topic, 10)

    def command(self, speed_mps: float, steering_deg: float) -> Dict[str, Any]:
        msg = self.Message();drive = msg.drive if self.stamped else msg;drive.speed = float(speed_mps);drive.steering_angle = math.radians(float(steering_deg));self.publisher.publish(msg)
        return {"ok": True, "adapterId": self.adapter_id, "speed": float(speed_mps), "steeringAngle": float(steering_deg)}

    def describe(self):
        return {**super().describe(), "topic": self.publisher.topic_name, "command": "ackermann_msgs/AckermannDriveStamped" if self.stamped else "ackermann_msgs/AckermannDrive", "steeringUnit": "rad"}


class RearSteerJointDriveCommandAdapter(DriveCommandAdapter):
    """Reference adapter for two scalar ros2_control command topics.

    `speed_command_scale` converts canonical m/s into the downstream controller's
    scalar command. It is intentionally configurable because a wheel-velocity
    controller may expect rad/s rather than linear m/s.
    """

    adapter_id = "ros2_rear_steer_joint_drive"
    label = "ROS 2 Rear-Steer Joint Drive"

    def __init__(self, node, speed_topic: str, steering_topic: str, *, speed_command_scale: float = 1.0, steering_sign: float = 1.0):
        if not speed_topic or not steering_topic:
            raise ValueError("rear_steer_joint_topics_required")
        from std_msgs.msg import Float64
        self.Float64 = Float64
        self.speed_pub = node.create_publisher(Float64, speed_topic, 10)
        self.steer_pub = node.create_publisher(Float64, steering_topic, 10)
        self.speed_command_scale = float(speed_command_scale)
        self.steering_sign = float(steering_sign)

    def command(self, speed_mps: float, steering_deg: float) -> Dict[str, Any]:
        speed = self.Float64();speed.data = float(speed_mps) * self.speed_command_scale
        steer = self.Float64();steer.data = math.radians(float(steering_deg)) * self.steering_sign
        self.speed_pub.publish(speed);self.steer_pub.publish(steer)
        return {"ok": True, "adapterId": self.adapter_id, "speed": float(speed_mps), "steeringAngle": float(steering_deg), "speedCommand": speed.data, "steeringCommandRad": steer.data}

    def describe(self):
        return {**super().describe(), "speedTopic": self.speed_pub.topic_name, "steeringTopic": self.steer_pub.topic_name, "command": "std_msgs/Float64 + std_msgs/Float64", "speedCommandScale": self.speed_command_scale, "steeringUnit": "rad"}


def create_drive_command_adapter(node, mode: str, *, wheelbase: float, cmd_vel_topic: str = "/cmd_vel", ackermann_topic: str = "/drive", rear_speed_topic: Optional[str] = None, rear_steering_topic: Optional[str] = None, rear_steer_sign: float = -1.0, speed_command_scale: float = 1.0) -> DriveCommandAdapter:
    mode = str(mode or "twist").strip().lower()
    if mode == "twist":
        return TwistDriveCommandAdapter(node, cmd_vel_topic, wheelbase=wheelbase, rear_steer_sign=rear_steer_sign)
    if mode == "ackermann":
        return AckermannDriveCommandAdapter(node, ackermann_topic, stamped=True)
    if mode in {"rear_steer_joint", "rear-steer-joint", "joint"}:
        return RearSteerJointDriveCommandAdapter(node, rear_speed_topic or "", rear_steering_topic or "", speed_command_scale=speed_command_scale, steering_sign=rear_steer_sign)
    raise ValueError(f"unknown_drive_command_adapter:{mode}")
