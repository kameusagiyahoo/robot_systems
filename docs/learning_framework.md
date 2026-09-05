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

`Behavior Cloning` は現在のMotion Skill用Pluginの具体例であり、Framework本体ではない。

## Core extension points

`SkillLearningPlugin` (`src/learning/framework/skill_learning_plugin.js`) はSkillごとに以下を提供できる。

- capabilities
- algorithms
- dataset schema / Dataset Adapter
- Demonstration Recorder Adapter
- Training Backend / training parameters
- Runtime Policy Adapter
- Evaluation Scenario Adapter / evaluation metrics
- visualization definitions
- train / evaluate

`plugin_registry.js` がSkill IDとPluginを結び、共通UI・Runtime Router・Evaluator・RecorderはBC/YOLO/ACT等の具体方式を直接知らない。

## Demonstration Episodes

Framework共通のEpisode保存:

`src/learning/framework/demonstration_episode_store.js`

1回の記録開始〜停止を1 Demonstration Episodeとして扱う。

```text
Demonstration Episode
├ episodeId
├ skillId
├ startedAt / endedAt
├ outcome
│  ├ success
│  ├ failure
│  └ unlabeled
├ quality
│  ├ good
│  ├ ok
│  ├ bad
│  └ unrated
├ note
├ context
└ samples[]
```

Outcome / Quality / NoteはSkill学習画面から編集できる。

ラベルの意味自体はSkill固有でよい。Frameworkは値を保存・フィルタする仕組みだけを提供する。

現在のMotion Recorder (`motion_demonstration_recorder.js`) は NavigateToPallet / AlignToPallet / Transport / Retreat に対応し、長押し操作を約80ms周期でSamplingする。

Motion sample:

```text
Observation: dx, dy, yawError, speed, steeringAngle
Action:      speed, steeringAngle
```

旧形式の平坦なObservation/Actionデータは `legacy_flat` として互換利用する。

## Dataset Adapter

`src/learning/framework/dataset_adapter.js`

現在のMotion Dataset Adapter:

`src/learning/plugins/motion_dataset_adapter.js`

対応:

- synthetic expert
- manual recorded demonstration Episodes
- imported observation/action JSON
- portable episodic JSON
- LeRobot conversion用 intermediate JSON

現在のportable schema:

```text
robot_systems.skill_dataset.v2
```

LeRobot中間形式:

```text
robot_systems.lerobot_intermediate.v2
```

LeRobot intermediate JSONは **公式LeRobotDatasetそのものではない**。PC/Workstation側で公式形式へ変換するための中間形式である。

## Demo filtering

Motion Pluginでは現在以下を選択できる。

```text
All Episodes
Success only
Quality: Good / OK
```

これはMotion BC Pluginの現在の設定例であり、すべてのSkillで同じフィルタを要求するものではない。

## Train / Validation split

共通utility:

`src/learning/framework/dataset_split.js`

### Episodic demonstration

手動DemonstrationにEpisode境界が複数存在する場合は **Episode単位** でTrain / Validationを分ける。

```text
Episode A ┐
Episode B ├→ Train
Episode C ┘

Episode D ┐
Episode E ┘→ Validation
```

同一走行内の連続フレームをTrainとValidationへ分散させない。

### Synthetic / legacy flat

Episode境界が存在しない場合のみsample-level deterministic splitを使用する。

### One episode only

1 Episodeしかない場合は、リークを避けるためValidationへ同一Episodeのフレームを切り出さず、Validation 0件とする。

## Training Backend

`src/learning/framework/training_backend.js`

Motion BC:

```text
Learning Page
  ↓
Motion Plugin
  ↓
Motion Dataset Adapter
  ↓
Train / Validation split
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

- UIから学習キャンセル可能
- timeoutでWorker terminate
- cancel / timeout時にはmain-thread fallbackしない
- Workerが利用不能な場合だけmain-thread fallback

## Train loss / Validation loss

Motion BCではEpochごとに:

```text
train loss
validation loss
```

を保存する。

学習画面では実線をTrain、破線をValidationとして表示する。

重要:

> Validation lossはDataset上で未学習データへの予測誤差を見る指標であり、閉ループでSkillが成功することを保証しない。

したがってModel採用判断はRollout Evaluationと組み合わせる。

## Model identity

`src/learning/framework/model_identity.js`

Modelには以下を付与する。

```text
modelId
checksum
identityAlgorithm
```

例:

```text
align_to_pallet:behavior_cloning:1a2b3c4d5e6f
```

原則SHA-256を使用する。

Model metadataには現在、Dataset source / Demo Filter / Validation Ratio / Split metadataも保存する。

## Rollout Evaluation

`src/evaluation/skill_evaluator.js`

Evaluation Scenario AdapterがSkillをSimulatorで閉ループ実行し、成功率・衝突・位置誤差等を測る。

Learned Policyの評価結果には:

```text
modelId
modelChecksum
modelAlgorithm
```

を保存する。

評価UIは現在読み込まれているModel IDに一致するRollout結果を優先し、**旧Modelの評価を現Modelの成績として表示しない**。

```text
Dataset validation
→ open-loop prediction quality

Rollout evaluation
→ closed-loop Skill execution quality
```

この2つを分離して扱う。

## Runtime Policy Adapter

`src/learning/framework/runtime_policy_adapter.js`

```text
SkillExecutor
  ↓
Runtime Router
  ├ classic → existing Policy
  └ learned → Plugin Runtime Adapter
```

RulePolicyへBC/ACT/SAC/VLA固有Runtimeを追加しない。

## Domain Service Interface

`src/learning/framework/domain_service_interface.js`

Plugin RuntimeがSimulator内部クラスへ直接依存しないよう名前付きServiceを渡す。

現在:

```text
path.to
path.palletApproach
state.get
state.emit
```

将来SimRobot → PiRobot / ROS2へ移行してもPluginの依存境界を保つ。

## Evaluation Scenario Adapter

`src/learning/framework/evaluation_scenario_adapter.js`

Skill評価のRuntime生成・初期条件・Skill入力・trial metric・aggregateをPlugin側へ分離する。

`skill_evaluator.js` はSkill固有scenario switchを持たない。

## Skill Learning Package

`src/learning/framework/skill_package.js`

1 Skillの研究状態を1 JSONへまとめる。

```text
robot_systems.skill_learning_package.v1
```

内容:

- Skill identity
- Learning Plugin ID / version
- selected Policy
- Model + checksum
- Dataset metadata
- episodic/manual Dataset payload
- Evaluation history
- Package checksum

これはrobot_systems独自の研究Packageであり、LeRobotDatasetではない。

## Episode reproducibility metadata

`src/learning/framework/episode_metadata.js`

Task開始時にSkillごとに以下をSnapshotする。

- Plugin ID/version
- selected Policy
- Runtime / Evaluation / Dataset / Recorder / Training adapters
- Model ID/checksum
- Train / Validation samples
- Train / Validation loss
- Demo Filter / Validation Ratio / Split strategy
- Dataset Episode summary

モデル重み自体はEpisodeへ複製しない。

## Current default plugins

### motion_bc

対象:

- NavigateToPallet
- AlignToPallet
- Transport
- Retreat

現在:

- episodic Motion Dataset Adapter
- manual simulator Demonstration Recorder
- Synthetic / Recorded / Imported datasets
- Behavior Cloning
- cancellable Web Worker Training
- Train / Validation split
- Motion BC Runtime
- Model-aware Rollout Evaluation
- Train/Validation loss visualization
- Dataset distribution
- Classic vs Learned comparison

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

Episode Editorは現在Motion Dataset Adapterが提供するEpisode APIがある場合だけ表示する。

## Important principle

> Skill Learning Framework は共通。
> Dataset / Demonstration Recording / Algorithm / Training Backend / Runtime / Evaluation / Visualization はSkill Pluginごとに異なってよい。

## Framework status

- [x] Skill Learning Plugin interface
- [x] Plugin Registry / Skill binding
- [x] Dynamic training/evaluation parameters and metrics
- [x] Visualization Renderer registry
- [x] Runtime Policy Adapter / Runtime Router
- [x] Evaluation Scenario Adapter
- [x] Dataset Adapter
- [x] Demonstration Recorder Adapter
- [x] Demonstration Episode Store
- [x] Outcome / Quality / Note labels
- [x] Demo filtering
- [x] deterministic Episode-level Train / Validation split
- [x] sample-level split fallback
- [x] Web Worker Training Backend
- [x] Worker cancellation / timeout
- [x] Train / Validation loss
- [x] portable episodic Dataset JSON
- [x] LeRobot conversion用 intermediate JSON
- [x] Model ID / checksum
- [x] Model-aware Rollout Evaluation
- [x] Skill Learning Package import/export + integrity check
- [x] Plugin/Policy/Model/Dataset/Recorder metadata in Episode
- [x] Domain Service interface

## Next framework tasks

- [ ] 公式LeRobotDataset converter / importer (PC/Workstation side)
- [ ] DAgger / corrective demonstration workflow
- [ ] demonstration replay / trajectory inspection
- [ ] plugin-local Visualization Renderer registration強化
- [ ] experiment comparison table across multiple Model IDs
