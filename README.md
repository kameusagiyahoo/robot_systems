# robot_systems

物流フォークリフトを題材に、**Task → Planner → Skill → Policy / Learning → Environment** の階層構造を段階的に研究するための実験基盤です。

現在の Browser 2D は **UI / Interface / Integration の Smoke Test 用**です。最終的な研究Simulatorとして固定せず、Gazebo / MuJoCo / Isaac Sim / ROS2 / 実機へEnvironment Adapterで差し替える設計へ移行しています。

OpenAI APIなどの秘密情報はブラウザ側へ置きません。

## Current features

- smartphone-first GitHub Pages UI
- Rule Planner + failure-aware replanning
- reusable Skill contracts with preconditions / postconditions
- plugin-based Skill Learning Framework
- Rule Waypoint / Pure Pursuit / PID baselines
- learned Motion Policy example using Behavior Cloning
- episodic Demonstration Recorder
- Episode Outcome / Quality / Note
- Episode-level Train / Validation split
- Train + Validation loss visualization
- deterministic Model ID + checksum
- Model-aware closed-loop Rollout Evaluation
- Skill Learning Package import/export
- LeRobot conversion用 intermediate JSON
- Environment Adapter / Registry / capability contract
- Task Runtime State contract
- 3D Spatial / Sensor contract
- canonical Skill I/O spaces for learning
- Environment-scoped evaluation metadata
- HTTP JSON Remote Environment Bridge
- generic Python Bridge backend interface
- ROS2 odometry + pluggable DriveCommandAdapter reference backend
- Gazebo ROS2 backend with RGB / LiDAR / optional Depth / Contact / Joint inputs
- Sensor Source Adapter + Perception Inference Backend extension points
- Browser2D smoke-test adapter
- self-contained Gazebo integration smoke world

## Architecture

```text
Human Task
   ↓
Planner
   ↓
Skill
   ↓
SkillExecutor
   ├ Classic Policy / Controller
   ├ Learning Runtime Router → Skill Plugin Runtime Adapter
   └ Sensor Inference Runtime → Perception Backend
   ↓
Skill I/O / Sensor Source / Domain Services
   ↓
Environment Adapter
   ↓
┌─────────────────────────────┐
│ Browser2D   : smoke test    │
│ Gazebo      : physics/sensor│
│ MuJoCo      : physics       │
│ Isaac Sim   : physics/sensor│
│ ROS2 / Real Robot           │
└─────────────────────────────┘
```

Browser2Dの座標・描画・簡易運動学を上位Skillの仕様にしないことが基本方針です。

## First external-environment gate

最初に行うべき検証は、AI性能向上ではなく **Browser2D → Gazeboの差し替えが上位層を壊さず通ること** です。

リポジトリには最小統合環境を用意しています。

```text
sim/gazebo_smoke/
  worlds/forklift_smoke.sdf
  config/bridge.yaml
  config/environment.json
  launch/smoke.launch.py
  scripts/
  README.md
```

最初の合格条件:

```text
Browser Task
↓
NavigateToPallet
↓
Classic Policy
↓
RemoteEnvironmentAdapter
↓
Environment Bridge
↓
/cmd_vel
↓
Gazebo forklift moves
↓
/odom
↓
Browser state updates
```

実行手順: `sim/gazebo_smoke/README.md`

このSmokeモデルは差動二輪で、フォークリフト形状を持つ**統合確認モデル**です。フォークリフトの最終Dynamics評価には使用しません。

## Environment Framework

主要ファイル:

```text
src/environment/
  environment_adapter.js
  environment_registry.js
  environment_selection.js
  environment_metadata.js
  environment_capabilities.js
  task_state_contract.js
  spatial_sensor_contract.js
  browser2d_environment.js
  remote_environment_adapter.js
  remote_environment_transport.js
  environment_bridge_protocol.js
  remote_environment_config.js
  remote_environment_ui.js
```

### Browser2D

`browser_2d` は `fidelity=smoke_test` です。

用途:

- UI確認
- Planner/Skill接続確認
- Policy/Learning RuntimeのIntegration確認
- Contract regression

研究根拠にしないもの:

- 接触力学
- タイヤ/スリップ/荷重
- Camera/Depth/LiDAR physics
- Fork/Pallet physical interaction
- Sim-to-Real性能

### Environment capabilities

Environmentは実際に使える機能を宣言します。

例:

```text
pose2d / pose3d
rgb / depth / lidar
contact
jointState
forkActuation
palletManipulation
teleport
trialConfiguration
sensorRead
```

`SkillExecutor` は実行前にCapabilityを確認します。

Manipulation Skillは、センサやアクチュエータが存在するだけで成功扱いにはしません。`InsertForks` / `Place` は明示的なManipulation Serviceが実装されるまで高忠実度Environmentでは未対応です。

## Remote Environment Bridge

BrowserがGazebo等のAPIへ直接依存しないよう、共通Bridgeを使います。

```text
Browser / local Web UI
        ↓
RemoteEnvironmentAdapter
        ↓
robot_systems.environment_bridge.v1
        ↓
Python EnvironmentBackend
        ↓
Gazebo / MuJoCo / Isaac Sim / ROS2 / Hardware
```

Python側:

```text
bridges/python/
  environment_bridge_core.py
  http_server.py
  perception_inference.py
  requirements.txt

bridges/ros2/
  drive_command_adapter.py
  ros2_twist_backend.py
  run_bridge.py

bridges/gazebo/
  gazebo_ros2_backend.py
  run_bridge.py
```

Drive commandはBackendへ固定せず、`Twist / Ackermann / Rear-steer joint` などを `DriveCommandAdapter` で交換する設計です。

研究設定画面の **External Environment Bridge** からBridge URLを保存・接続テストできます。秘密鍵/APIキーは保存しません。

詳細: `docs/environment_bridge_protocol.md`

## State contracts

### Task Runtime State

```text
robot_systems.task_runtime_state.v1
```

現在のPlanner/Skillが使う意味的な互換Stateです。

### Spatial State

```text
robot_systems.spatial_state.v1
```

3D xyz + quaternion + frameを扱います。

### Sensor Packet

```text
robot_systems.sensor_packet.v1
```

RGB / Depth / LiDAR / PointCloud / IMU / Odometry / Contact / Joint State等の共通メタデータ境界です。

## Skill Learning Framework

学習方式を全Skillで統一しません。共通化するのは枠組みだけです。

```text
Skill
├ Dataset Adapter
├ Demonstration Recorder Adapter
├ Training Backend
├ Skill I/O Adapter
├ Sensor Source Adapter
├ Inference Backend
├ Runtime Policy Adapter
├ Evaluation Scenario Adapter
├ Evaluation Metrics
└ Visualization Adapter
```

現在の例:

- Motion Skills → Behavior Cloning Plugin
- DetectPallet → Sensor Source + pluggable Inference Framework
- Insert/Lift/Place → future physical Manipulation Plugin

`Behavior Cloning` やDetectorはFramework本体ではなくPlugin実装です。

## Canonical learning I/O

Environmentを交換しても、生の単位を同じModelへ直接入れません。

Motion系は:

```text
Environment native state/action
        ↓
Motion Skill I/O Adapter
        ↓
motion_relative_vehicle_normalized.v1
        ↓
Learning Model
        ↓
motion_drive_normalized.v1
        ↓
Environment action
```

Model入力は車体相対・無次元です。

これは**単位とInterfaceの互換性**を作る仕組みです。Dynamics Gap / Sensor Gap / Appearance Gap / Latency / Contact mismatchを解決するものではありません。

旧ModelにObservation/Action Space IDがない場合、新Canonical Runtimeでは再学習を要求します。

## Perception route

高忠実度Environmentでは真値座標の近接判定を実認識性能として扱いません。

```text
Camera / Depth / LiDAR
↓
Sensor Source Adapter
↓
Inference Backend
↓
YOLO / Segmentation / VLM / Pose Estimator
↓
Detection Result
↓
DetectPallet
```

Browser2Dだけは `ground_truth_smoke` として明示したSmoke Detectorを使用できます。

## Demonstration route

```text
Manual Control
  ↓
Skill Plugin
  ↓
Demonstration Recorder Adapter
  ↓
Demonstration Episode
  ├ Outcome
  ├ Quality
  ├ Note
  ├ Source Environment
  ├ Skill I/O Space
  └ Observation + Action
  ↓
Dataset Adapter
```

1回の開始〜停止を1 Episodeとして保存します。

## Train / Validation

```text
Recorded Episodes
  ↓
Demo Filter
  ↓
Episode-level split
  ├ Train Episodes
  └ Validation Episodes
  ↓
Training Backend
  ↓
Model ID + checksum
```

同一走行の連続フレームがTrainとValidationへ混在しないよう、手動DemonstrationはEpisode単位で分離します。

**Validation LossはDataset上の予測誤差であり、閉ループSkill成功率ではありません。**

## Rollout Evaluation

Evaluation結果はEnvironmentとModelを実験条件として保存します。

```text
Environment Adapter / remote target
Scenario Adapter
Controller
Skill Policy
Model ID / checksum
Seed / Trials
Metrics
```

`trialConfiguration`を持たない実機やSmoke Bridgeでは自動teleport評価を拒否します。Gazeboの自動Trial評価を有効化する場合も、明示的なSetEntityPose Bridgeを設定したときだけCapabilityを有効化します。

## Research migration path

```text
Browser2D Smoke Test
↓
Gazebo integration smoke gate
↓
rear-steer / ros2_control dynamics
↓
Fork Joint + Contact + RGB-D
↓
Perception / Pose / Visual Servo
↓
LeRobot dataset / imitation learning
↓
Workstation GPU / ACT / VLA / World Model
↓
Controlled real-forklift validation
```

## Documents

- `sim/gazebo_smoke/README.md` — 最小Gazebo統合試験
- `docs/environment_adapter_architecture.md` — Environment交換設計
- `docs/environment_bridge_protocol.md` — 外部Simulator/ROS2 Bridge契約
- `docs/architecture.md` — layer design
- `docs/skills.md` — reusable Skill definitions
- `docs/learning_framework.md` — Skillごとに学習方式を差し替えるPlugin framework
- `docs/skill_learning.md` — Skill learning notes
- `docs/skill_evaluation.md` — Skill evaluation design
- `docs/roadmap.md` — full TODO
- `docs/migration_gate.md` — Cloudflare/OpenAI migration gate

## Security

Do **not** put OpenAI API keys, ROS credentials, simulator administration tokens, or private Bridge credentials in browser-side JavaScript or GitHub Pages files.

GitHub PagesはHTTPSのため、`http://192.168...` のようなLAN Bridgeへの接続はMixed Contentで遮断される場合があります。HTTPS Bridge / reverse proxy、または開発時はローカルWeb UIを使用します。
