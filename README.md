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
- ROS2 `/odom` + `/cmd_vel` reference backend
- Browser2D smoke-test adapter

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
   └ Learning Runtime Router → Skill Plugin Runtime Adapter
   ↓
Skill I/O / Domain Services
   ↓
Environment Adapter
   ↓
┌─────────────────────────────┐
│ Browser2D   : smoke test    │
│ Gazebo      : physics       │
│ MuJoCo      : physics       │
│ Isaac Sim   : physics/sensor│
│ ROS2 / Real Robot           │
└─────────────────────────────┘
```

Browser2Dの座標・描画・簡易運動学を上位Skillの仕様にしないことが基本方針です。

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
```

`SkillExecutor` は実行前にCapabilityを確認します。

たとえば `InsertForks` は、専用のManipulation Service、または Fork actuation + Contact feedback がないEnvironmentでは実行対象として扱いません。

## Remote Environment Bridge

BrowserがGazebo等のAPIへ直接依存しないよう、共通Bridgeを使います。

```text
Browser / GitHub Pages
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
  requirements.txt

bridges/ros2/
  ros2_twist_backend.py
  run_bridge.py
  world.example.json
```

ROS2参照Backendは `/odom` と `/cmd_vel` を使うBridge接続確認用です。最終フォークリフトの高忠実度Dynamics実装ではありません。

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
├ Runtime Policy Adapter
├ Evaluation Scenario Adapter
├ Evaluation Metrics
└ Visualization Adapter
```

現在の例:

- Motion Skills → Behavior Cloning Plugin
- DetectPallet → future Perception Plugin
- Insert/Lift/Place → future Manipulation Plugin

`Behavior Cloning` はFramework本体ではなく、最初のPlugin実装です。

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

例:

- forward / lateral
- yawSin / yawCos
- normalized speed
- normalized steering

これは**単位とInterfaceの互換性**を作る仕組みです。Dynamics Gap / Sensor Gap / Appearance Gap / Latency / Contact mismatchを解決するものではありません。

旧ModelにObservation/Action Space IDがない場合、新Canonical Runtimeでは再学習を要求します。

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

Scenario座標はBrowser2Dのpx値をそのままmへ変換せず、車体wheelbase基準でスケーリングします。

`trialConfiguration`を持たない実機/参照Backendでは、現在の自動Skill評価を拒否します。実機評価は別の安全なExperiment Protocolとして実装する方針です。

## Learning Framework files

```text
src/learning/framework/
  skill_learning_plugin.js
  plugin_registry.js
  dataset_adapter.js
  demonstration_recorder_adapter.js
  demonstration_episode_store.js
  dataset_split.js
  training_backend.js
  skill_io_adapter.js
  runtime_policy_adapter.js
  runtime_router.js
  evaluation_scenario_adapter.js
  visualization_renderer.js
  episode_metadata.js
  domain_service_interface.js
  model_identity.js
  skill_package.js

src/learning/plugins/
  default_skill_plugins.js
  motion_skill_io_adapter.js
  motion_dataset_adapter.js
  motion_demonstration_recorder.js
  motion_bc_training_backend.js
  motion_bc_runtime.js
  forklift_evaluation_scenarios.js
```

## Research migration path

```text
Browser2D Smoke Test
↓
Environment / Learning Framework
↓
ROS2 / Gazebo Bridge
↓
3D + Contact + Camera/Depth
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
