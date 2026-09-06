# Environment Bridge Protocol v1

Protocol id:

```text
robot_systems.environment_bridge.v1
```

## Why a bridge exists

The browser application should not import Gazebo, MuJoCo, Isaac Sim, or ROS2 APIs directly. External runtimes can remain Python/C++/ROS-native while the browser speaks one semantic protocol.

```text
GitHub Pages / Browser
  ↓ HTTP JSON
RemoteEnvironmentAdapter
  ↓
Environment Bridge
  ↓
Backend
  ↓
Simulator / Robot
```

## Request envelope

```json
{
  "protocol": "robot_systems.environment_bridge.v1",
  "requestId": "req:...",
  "command": "step",
  "payload": {
    "action": {
      "type": "drive",
      "speed": 0.5,
      "steeringAngle": 10.0
    }
  }
}
```

## Response envelope

```json
{
  "protocol": "robot_systems.environment_bridge.v1",
  "requestId": "req:...",
  "command": "step",
  "ok": true,
  "data": {
    "actionResult": {"ok": true},
    "metrics": {"controlTicks": 10}
  },
  "state": {
    "robot": {"x": 1.2, "y": 0.5, "yaw": 12.0}
  },
  "descriptor": null
}
```

On errors, `ok=false` and `error` contains a machine-readable reason. The bridge should still return a valid protocol envelope.

## Commands

### `handshake`

Called immediately after connection. Returns the Environment descriptor and current semantic state.

The descriptor should declare:

- id / label / version
- kind / fidelity
- state contract
- coordinate frame
- units
- capabilities
- domain services
- limitations / intended use

### `observe`

Returns the current observation and an optional semantic state patch.

### `step`

Payload:

```json
{"action": {"type": "drive", "speed": 0.5, "steeringAngle": 10}}
```

Common action types are currently:

- `drive`
- `stop`
- `fork`

A backend may reject unsupported actions.

### `reset`

Resets an Environment when that capability exists. Real hardware will normally reject this.

### `configure_trial`

Places/configures robot and semantic entities for controlled evaluation. This is intended for simulators that can safely teleport/configure entities. Real hardware should normally advertise `trialConfiguration=false`.

### `metrics`

Returns Environment metrics such as:

- path length
- control ticks
- simulation time
- collisions

High-fidelity backends may add contact/energy/load metrics.

### `domain_call`

Calls a semantic Environment Domain Service:

```json
{
  "name": "target.palletDock",
  "args": [{"x": 4.0, "y": 1.5}]
}
```

This is used only for services that cannot or should not be computed from the browser mirror state.

### `generate_scenarios`, `apply_scenario`, `task_text`

Optional benchmark functions. A backend must not advertise scenario support unless it can provide deterministic, reproducible scenarios.

## State ownership

The remote Environment owns physical/environment state:

```text
robot
pallets
locations
perception
simulation
obstacle
failures
path
benchmark
```

The browser upper layer owns:

```text
task
agent / planner memory
```

`RemoteEnvironmentAdapter` merges only Environment-owned fields. This prevents a simulator from unintentionally replacing the Planner's state machine.

## Units and frames

Do not assume Browser2D units.

Each Environment declares its units and frame convention. A physics backend should normally use SI:

```text
length = m
speed = m/s
time = s
```

Task Runtime State v1 keeps a degree-valued compatibility `yaw`. Full 3D state uses `robot_systems.spatial_state.v1` and quaternion orientation.

## Sensors

Sensor metadata uses `robot_systems.sensor_packet.v1`.

Large RGB/depth/point-cloud payloads should normally use a stream handle or URL rather than repeatedly embedding large byte arrays in HTTP JSON.

A later WebSocket transport may reuse the same command and state contracts.

## Security

Do not put private bridge credentials, ROS secrets, OpenAI keys, or simulator administration tokens into GitHub Pages JavaScript or LocalStorage.

The current browser configuration stores only the Bridge URL, endpoint, and timeout.

For a private bridge, prefer:

- VPN/private network plus an HTTPS endpoint
- same-origin reverse proxy
- short-lived authenticated sessions
- allowlisted CORS origins

GitHub Pages is HTTPS. Browsers can block requests from an HTTPS page to a plain `http://` LAN bridge as mixed content. Use HTTPS for the bridge or run the UI locally when developing over plain HTTP.

## Python bridge

Generic bridge code:

```text
bridges/python/environment_bridge_core.py
bridges/python/http_server.py
```

A backend subclasses `EnvironmentBackend` and implements only supported operations.

Install HTTP dependencies:

```bash
python -m pip install -r bridges/python/requirements.txt
```

## ROS2 reference backend

Files:

```text
bridges/ros2/ros2_twist_backend.py
bridges/ros2/run_bridge.py
bridges/ros2/world.example.json
```

The reference backend uses:

- `nav_msgs/Odometry`
- `geometry_msgs/Twist`
- optional `std_msgs/Float64` fork topic

It is an integration reference, not a production forklift dynamics model.

Example from the repository root in a ROS2 Python environment:

```bash
export ROBOT_SYSTEMS_WORLD_JSON=bridges/ros2/world.example.json
export ROBOT_SYSTEMS_ALLOWED_ORIGINS=https://kameusagiyahoo.github.io
python -m bridges.ros2.run_bridge
```

Default bridge endpoint:

```text
http://127.0.0.1:8765/environment
```

For GitHub Pages, plain localhost/LAN HTTP may be blocked by the browser. Use an HTTPS bridge/proxy or run the web app locally while developing.

## Backend fidelity rule

The protocol provides interoperability, not fidelity. A backend should accurately advertise what it provides. In particular, a backend must not claim contact, camera, fork, manipulation, teleport, or trial configuration capabilities by merely changing semantic browser state.
