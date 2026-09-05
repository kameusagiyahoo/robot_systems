# Skill Learning Framework

## Purpose

学習方法を全Skillで統一しない。

共通化するのは **学習の枠組み** だけで、Dataset / Demonstration Recording / Algorithm / Training Backend / Runtime / Evaluation / Visualization はSkillごとのPluginが定義する。

```text
Task
  ↓
Skill
  ├ Dataset Adapter
  ├ Demonstration Recorder Adapter
  ├ Training Backend
  ├ Runtime Policy Adapter
  ├ Evaluation Scenario Adapter
  ├ Evaluation Metrics
  └ Visualization Adapter
```

## Core extension points

`SkillLearningPlugin` (`src/learning/framework/skill_learning_plugin.js`) はSkillごとに以下を提供できる。

- capabilities: trainable / evaluable / runtimeLearning / demonstrationRecording / policies
- algorithms
- dataset schema / Dataset Adapter
- Demonstration Recorder Adapter
- Training Backend / training parameters
- Runtime Policy Adapter
- Evaluation Scenario Adapter / evaluation metrics
- visualization definitions
- train / evaluate

`plugin_registry.js` がSkill IDとPluginを結び、UI・Runtime・Evaluator・RecorderはBC/YOLO/ACT等の具体方式を直接知らない。

## Demonstration Recorder Adapter

`src/learning/framework/demonstration_recorder_adapter.js`

```text
Manual Control
  ↓
Skill-specific Recorder
  ↓
Observation + Action
  ↓
Dataset Adapter
  ↓
Training Backend
```

現在のMotion Recorder (`motion_demonstration_recorder.js`) は NavigateToPallet / AlignToPallet / Transport / Retreat に対応し、長押し操作を約80ms周期でSamplingする。

現在のMotion sample:

```text
Observation: dx, dy, yawError, speed, steeringAngle
Action:      speed, steeringAngle
```

将来はDetectPalletなら画像Annotation Recorder、InsertForkならCamera/Depth/Robot State/Action trajectory Recorderへ差し替える。

## Training Backend

`src/learning/framework/training_backend.js`

現在のMotion BC:

```text
Learning Page
  ↓
Motion Plugin
  ↓
Motion Dataset Adapter
  ↓
Motion BC Training Backend
  ↓
Web Worker
  ↓
BC training core
```

関連:

- `src/learning/algorithms/motion_bc_core.js`
- `src/learning/plugins/motion_bc_training_backend.js`
- `src/learning/workers/motion_bc_training_worker.js`

### cancellation / timeout

Web Worker Training Backendは `AbortSignal` とtimeoutを受け取る。

- UIから学習をキャンセル可能
- timeout時はWorkerをterminate
- cancel / timeout時にはmain-thread fallbackを実行しない
- Worker自体が利用できない場合のみmain-thread fallback

Motion PluginではTimeout秒数をTraining Parameterとして公開する。

## Dataset Adapter

`src/learning/framework/dataset_adapter.js`

Motion実装 (`motion_dataset_adapter.js`) は以下を扱う。

- synthetic expert
- manual recorded demonstration
- imported observation/action JSON
- portable JSON
- LeRobot conversion用 intermediate JSON

LeRobot intermediate JSONは **公式LeRobotDatasetそのものではない**。PC/Workstation側で公式LeRobotDatasetへ変換するための中間形式である。

## Model identity

`src/learning/framework/model_identity.js`

学習済みModelには以下を付与する。

```text
modelId
checksum
identityAlgorithm
```

原則SHA-256を使用し、Web Cryptoが使えない環境だけ軽量fallback hashを使う。

`modelId` は例として:

```text
align_to_pallet:behavior_cloning:1a2b3c4d5e6f
```

となる。

Package Import日時などのtransport metadataはModel checksum対象外とし、同一Modelは移動後も同じModel IDを維持する。

Episode metadataにもModel ID/checksumを保存するため、評価結果がどのModelによるものか追跡できる。

## Skill Learning Package

`src/learning/framework/skill_package.js`

1 Skillの研究状態を1つのJSONへまとめて持ち運ぶ。

Schema:

```text
robot_systems.skill_learning_package.v1
```

内容:

- Skill identity
- Learning Plugin ID / version
- descriptor snapshot
- selected Policy
- Model + Model checksum
- Dataset metadata
- manual/recorded Dataset payload（該当時）
- Evaluation history
- Package checksum

Import時は:

1. Package checksum検証
2. Model checksum検証
3. Skill ID一致確認
4. Plugin ID一致確認
5. Dataset / Model / Evaluation history / Policyを復元

を行う。

これはrobot_systems独自の研究Packageであり、LeRobotDatasetではない。

## Runtime Policy Adapter

`src/learning/framework/runtime_policy_adapter.js`

```text
SkillExecutor
  ↓
Runtime Router
  ├ classic → existing Policy
  └ learned → Plugin Runtime Adapter
```

現在のMotion BC Runtimeは `src/learning/plugins/motion_bc_runtime.js`。

RulePolicyへBC/ACT/SAC/VLA固有Runtimeを追加しない。

## Domain Service Interface

`src/learning/framework/domain_service_interface.js`

Plugin RuntimeがSimulator内部クラスへ直接依存しないよう、名前付きServiceを渡す。

現在:

```text
path.to
path.palletApproach
state.get
state.emit
```

将来SimRobot → PiRobot / ROS2へ移行するときもPluginの依存境界を維持する。

## Evaluation Scenario Adapter

`src/learning/framework/evaluation_scenario_adapter.js`

Skill評価のRuntime生成・初期条件・Skill入力・trial metric・aggregateをPlugin側へ分離する。

`skill_evaluator.js` はSkill固有のscenario switchを持たない。

現在のフォークリフトScenarioは `src/learning/plugins/forklift_evaluation_scenarios.js`。

## Episode reproducibility metadata

`src/learning/framework/episode_metadata.js`

Task開始時にSkillごとに以下をSnapshotする。

- Plugin ID/version
- selected Policy
- Runtime / Evaluation / Dataset / Recorder / Training adapters
- Model ID/checksum/algorithm/version/trainedAt/samples/epochs/loss
- Dataset source/adapter/version

モデル重み自体はEpisodeへ複製しない。

## Current default plugins

### motion_bc

対象: NavigateToPallet / AlignToPallet / Transport / Retreat

- Dataset Adapter: Motion observation/action
- Recorder: simulator manual demonstration
- Dataset: synthetic / recorded / imported
- Algorithm: Behavior Cloning
- Training: cancellable Web Worker
- Runtime: Motion BC Runtime
- Evaluation: Forklift Motion Scenario
- Visualization: Loss / Dataset distribution / Classic vs Learned

これはFrameworkの最初の具体例であり、Framework本体ではない。

### perception_future

DetectPallet用の将来Adapter。Camera導入後にRGB/Depth Dataset、Annotation Recorder、Detector/Segmentation/VLM、mAP/Recall/Pose Error等へ差し替える。

### manipulation_future

InsertForks / Lift / Place用の将来Adapter。物理自由度導入後にtrajectory Recorder、ACT/Diffusion/RL、contact/trajectory評価へ差し替える。

## UI rule

`learn.html` / `evaluate.html` はAlgorithm固有項目を決め打ちしない。

```text
Plugin Descriptor
  ↓
UI builds controls dynamically
  ↓
Dataset / Recorder / Training / Runtime / Evaluation adapters
  ↓
Plugin-defined visualizations / metrics
```

## Important principle

> Skill Learning Framework は共通。
> Dataset / Demonstration Recording / Algorithm / Training Backend / Runtime / Evaluation / Visualization はSkill Pluginごとに異なってよい。

「全SkillをBehavior Cloningにする」「全SkillでLoss graphを出す」といった設計にはしない。

## Framework status

- [x] Skill Learning Plugin interface
- [x] Plugin Registry / Skill binding
- [x] Dynamic training/evaluation parameters and metrics
- [x] Visualization Renderer registry
- [x] Runtime Policy Adapter / Runtime Router
- [x] Evaluation Scenario Adapter
- [x] Dataset Adapter
- [x] Demonstration Recorder Adapter
- [x] Motion manual demonstration recording
- [x] Web Worker Training Backend
- [x] Worker cancellation / timeout
- [x] portable Dataset JSON
- [x] LeRobot conversion用 intermediate JSON
- [x] Model ID / checksum
- [x] Skill Learning Package import/export + integrity check
- [x] Plugin/Policy/Model/Dataset/Recorder metadata in Episode
- [x] Domain Service interface

## Next framework tasks

- [ ] 公式LeRobotDataset converter / importer (PC/Workstation side)
- [ ] Visualization Rendererのplugin-local registration強化
- [ ] demonstration episode boundaries / quality labels
- [ ] DAgger / corrective demonstration workflow
- [ ] Dataset split / validation / rollout benchmarkとの紐付け
