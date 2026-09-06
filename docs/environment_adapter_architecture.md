# Environment Adapter Architecture

## Purpose

`robot_systems` treats the current Browser 2D simulator as an **integration smoke-test environment**, not as the research target or the authoritative physics model.

The upper architecture is intended to survive replacement of the environment:

```text
Task
  ↓
Planner
  ↓
Skill
  ↓
Classic / Learned Runtime
  ↓
Skill I/O Adapter
  ↓
Environment Contract + Domain Services
  ↓
Browser2D / Gazebo / MuJoCo / Isaac Sim / ROS2 / Real Robot
```

## Design rule

Upper layers must not depend on simulator-native objects, APIs, topics, USD prims, MuJoCo model structures, or ROS messages.

An Environment Adapter translates native runtime data into semantic contracts.

## Contracts

### Task Runtime State

Schema: `robot_systems.task_runtime_state.v1`

This is the compatibility state used by the current Planner and Skills. It contains semantic objects such as:

- robot x/y/yaw and motion state
- pallets and locations
- perception results
- simulation/runtime control configuration
- obstacle and path state

The v1 yaw compatibility field is degrees. Length units are **not globally fixed** and must be declared by the Environment descriptor.

### Spatial State

Schema: `robot_systems.spatial_state.v1`

Adds full 3D state without breaking the v1 Planner compatibility state:

- frame id
- xyz position
- quaternion orientation
- optional linear/angular twist
- 3D entities

### Sensor Packet

Schema: `robot_systems.sensor_packet.v1`

Supported semantic sensor types include:

- RGB
- depth
- LiDAR / point cloud
- IMU
- odometry
- contact
- joint state
- fork state

Large binary data should normally be referenced by a URL or stream handle instead of embedding raw arrays in the command JSON.

## Domain Services

Environment-specific semantics are exposed through named services instead of direct simulator access. Examples:

```text
path.to
target.palletDock
target.locationApproach
target.retreat
perception.palletVisible
manipulation.setFork
manipulation.insertForks
world.distance
control.config
```

A service can be local/synchronous or remote/asynchronous. The Domain Service framework supports `callAsync()`.

## Environment capabilities

The Environment descriptor explicitly declares what can actually be supported:

```text
pose2d / pose3d
rgb / depth / lidar
contact
jointState
forkActuation
palletManipulation
teleport
trialConfiguration
```

`SkillExecutor` validates these before executing a Skill. This prevents a low-fidelity environment from silently pretending that a physical Skill succeeded.

Examples:

- `InsertForks`: dedicated manipulation service, or fork actuation + contact feedback
- `Place`: dedicated placement service, or pallet manipulation + contact
- `DetectPallet`: semantic perception service, RGB, depth, or LiDAR

## Browser 2D position

`browser_2d` is deliberately marked:

```text
fidelity = smoke_test
```

It is useful for:

- UI development
- Planner/Skill pipeline checks
- adapter contract checks
- learning-framework integration checks
- deterministic regression checks

It is not evidence for:

- vehicle dynamics quality
- tire/slip behavior
- contact dynamics
- sensor noise/occlusion
- fork/pallet physics
- sim-to-real performance

## Learning and environment independence

A replaceable Environment does **not** mean the same raw numbers can be sent to the same model.

Motion learning uses a Skill I/O Adapter and canonical model spaces:

```text
Environment native units
  ↓
Motion Skill I/O Adapter
  ↓
motion_relative_vehicle_normalized.v1
  ↓
Model
  ↓
motion_drive_normalized.v1
  ↓
Environment action units
```

The model observes dimensionless, vehicle-relative quantities such as forward/lateral error, yaw sin/cos, normalized speed, and normalized steering.

This solves an **interface/unit compatibility problem**. It does not solve:

- dynamics gap
- sensor gap
- appearance/domain gap
- actuation latency
- contact model mismatch
- unobserved state differences

Those still require representative simulation/data, domain randomization, fine tuning, adaptation, or real-world validation depending on the research question.

## Evaluation isolation

Evaluation results record at least:

- Environment Adapter id/version/fidelity
- remote target id/version when using the bridge
- Scenario Adapter id/version
- controller
- Skill policy
- model id/checksum
- seed/trials

Results from Browser2D and a physics simulator must not be interpreted as the same experiment.

Current Skill scenarios are scaled relative to vehicle wheelbase so that the original Browser2D geometry is not interpreted literally as meters in SI environments.

## External environment path

```text
Web UI / Planner / Skills
        ↓
RemoteEnvironmentAdapter
        ↓
robot_systems.environment_bridge.v1
        ↓
Python bridge backend
        ↓
Gazebo / MuJoCo / Isaac Sim / ROS2 / hardware
```

The Python backend owns conversion from simulator-native data to semantic state and capabilities.

## Backend implementation checklist

A new high-fidelity backend should define:

1. Environment identity, fidelity, frames and units.
2. Robot pose and velocity mapping.
3. Vehicle control action mapping.
4. Pallet/location semantic entity mapping.
5. Supported reset/teleport/trial configuration operations.
6. Collision/contact metrics.
7. Fork and load state.
8. Sensor streams and timestamps.
9. Domain Services needed by supported Skills.
10. Capability flags matching real support; do not advertise unsupported behavior.
11. Deterministic seed/scenario behavior if benchmark use is required.
12. Cleanup and emergency-stop behavior for hardware.

## Real hardware rule

Real hardware is an Environment, but it is not a simulator. Operations such as teleport or arbitrary trial reset should normally be unavailable. Evaluators that depend on those capabilities must reject the environment rather than emulating them by mutating browser state.
