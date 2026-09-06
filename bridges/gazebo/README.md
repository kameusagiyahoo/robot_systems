# Gazebo Environment Bridge

`GazeboRos2ForkliftBackend` is a simulator-specific implementation behind the common `robot_systems.environment_bridge.v1` protocol.

The web application does **not** depend on Gazebo topics, services, SDF entities, or sensor message types directly.

```text
GitHub Pages / Web UI
  ↓
RemoteEnvironmentAdapter
  ↓ HTTP JSON
Environment Bridge
  ↓
GazeboRos2ForkliftBackend
  ↓
ROS 2 / ros_gz
  ↓
Gazebo Sim
```

## Supported boundary

- motion state: `nav_msgs/Odometry`
- motion command: `geometry_msgs/Twist` reference mapping
- optional fork command topic
- RGB / Depth: `sensor_msgs/Image`
- LiDAR: `sensor_msgs/LaserScan`
- Joint state: `sensor_msgs/JointState`
- Contact: `ros_gz_interfaces/msg/Contacts`
- trial teleport: `ros_gz_interfaces/srv/SetEntityPose`
- on-demand sensor access through `sensor_manifest` / `sensor_read`

The Twist mapping is an integration baseline, not the final forklift dynamics implementation. A production/high-fidelity forklift should replace the drive mapping with its actual rear-steer / Ackermann / ros2_control interface.

## Example

```bash
export ROBOT_SYSTEMS_WORLD_JSON=$PWD/bridges/gazebo/world.example.json
export GAZEBO_WORLD=default
export GAZEBO_ROBOT_ENTITY=forklift
export ROBOT_ODOM_TOPIC=/odom
export ROBOT_CMD_TOPIC=/cmd_vel
export ROBOT_RGB_TOPIC=/camera/color/image_raw
export ROBOT_DEPTH_TOPIC=/camera/depth/image_raw
export ROBOT_LIDAR_TOPIC=/scan
export ROBOT_CONTACT_TOPIC=/fork_contacts
export ROBOT_JOINT_STATE_TOPIC=/joint_states

python -m bridges.gazebo.run_bridge
```

The browser then connects to the HTTP bridge URL from **Research Settings → External Environment Bridge**.

## Gazebo bridge requirements

The required Gazebo topics/services must already be visible in ROS 2. Use your `ros_gz_bridge` launch/YAML configuration to expose only the interfaces your model actually provides.

For automatic Skill evaluation, `SetEntityPose` must be available so the evaluator can create repeatable trial initial states. If it is not available, normal runtime remains possible but automatic teleport-based evaluation is disabled by capability negotiation.

## Sensor payload rule

Sensor frames are not embedded continuously in Task Runtime State.

```text
state.sensors
  → lightweight metadata only

sensor_manifest
  → source descriptors

sensor_read(sensorId)
  → one Sensor Packet on demand
```

This prevents RGB/depth payloads from bloating every bridge response and lets Perception Skills request only the sensor data they need.

## Manipulation status

Presence of a contact sensor or fork joint does not automatically mean `InsertForks` / `Place` are implemented. Those Skills remain unavailable until a simulator-specific semantic service such as `manipulation.insertForks` or `manipulation.place` is implemented and validated.
