# Skill Learning Framework

## Purpose

学習方法を全Skillで統一しない。

共通化するのは **学習の枠組み** だけで、Dataset / Algorithm / Training Backend / Runtime / Evaluation / Visualization はSkillごとのPluginが定義する。

```text
Task
  ↓
Skill
  ├ Dataset Adapter
  ├ Training Backend
  ├ Runtime Policy Adapter
  ├ Evaluation Scenario Adapter
  ├ Evaluation Metrics
  └ Visualization Adapter
```

## Core extension points

### `SkillLearningPlugin`

`src/learning/framework/skill_learning_plugin.js`

Pluginは以下を提供できる。

- capabilities
  - trainable
  - evaluable
  - runtimeLearning
  - available policies
- algorithms
- dataset schema
- Dataset Adapter
- Training Backend
- training parameters
- evaluation parameters
- evaluation metrics
- Runtime Policy Adapter
- Evaluation Scenario Adapter
- visualization definitions
- `train()`
- `evaluate()`

### Plugin Registry

`src/learning/framework/plugin_registry.js`

Skill IDとLearning Pluginを結び付ける。

UI、Runtime Router、Skill Evaluatorは具体的なBC/YOLO/ACT等を直接知らず、Registry経由でPluginを取得する。

## Training Backend

`src/learning/framework/training_backend.js`

重い学習処理をUI threadから分離するための拡張点。

現在のMotion BCでは:

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
Pure BC training core
```

を使う。

関連ファイル:

- `src/learning/algorithms/motion_bc_core.js`
- `src/learning/plugins/motion_bc_training_backend.js`
- `src/learning/workers/motion_bc_training_worker.js`

Web Workerが利用できない環境ではmain thread fallbackを行う。

## Dataset Adapter

`src/learning/framework/dataset_adapter.js`

Datasetの作り方をAlgorithm/UIから分離する。

現在のMotion実装:

`src/learning/plugins/motion_dataset_adapter.js`

対応:

- `synthetic_expert`
- `manual_import`
- observation/action JSON import
- portable JSON export
- LeRobot変換用 intermediate JSON export

LeRobot intermediate JSONは **公式LeRobotDatasetそのものではない**。将来、PC/Workstation側で公式LeRobotDatasetへ変換するための中間スキーマとする。

## Runtime Policy Adapter

`src/learning/framework/runtime_policy_adapter.js`

Learned RuntimeをRulePolicyへ直接書き込まない。

```text
SkillExecutor
  ↓
Runtime Router
  ├ classic → existing Policy
  └ learned → Plugin Runtime Adapter
```

現在のMotion BC実装:

`src/learning/plugins/motion_bc_runtime.js`

将来、ACT / SAC / VLA / Detector Runtime等を導入するときは、原則としてRulePolicyへ学習アルゴリズム固有コードを追加しない。

## Domain Service Interface

`src/learning/framework/domain_service_interface.js`

Plugin RuntimeがSimulatorの内部クラスへ直接依存しないよう、必要なドメイン機能を名前付きServiceとして渡す。

現在の例:

```text
path.to
path.palletApproach
state.get
state.emit
```

Motion Runtimeは `path.to` / `path.palletApproach` を要求する。

Runtime Adapterは `requiredDomainServices` をDescriptorで宣言できる。

これにより将来SimRobot → PiRobot / ROS2へ移行しても、Runtime Plugin側の依存境界を明確に保つ。

## Evaluation Scenario Adapter

`src/learning/framework/evaluation_scenario_adapter.js`

Skill評価で使う以下の内容もPlugin側の責務にする。

- Runtime生成
- 初期条件生成
- Skill入力生成
- trial metric計測
- aggregate

`src/evaluation/skill_evaluator.js` はSkill固有の `switch(skillId)` を持たない。

現在のフォークリフト用Scenario:

`src/learning/plugins/forklift_evaluation_scenarios.js`

将来Camera perceptionや3D manipulationを追加するときは、そのPlugin専用Scenario Adapterへ差し替える。

## Episode reproducibility metadata

Task開始時にLearning Framework状態をSnapshotする。

`src/learning/framework/episode_metadata.js`

Episode metaにはSkillごとに以下を保存する。

- Learning Plugin ID / version
- selected Policy
- Runtime Adapter
- Evaluation Scenario Adapter
- Model algorithm / version / trainedAt / samples / epochs / loss
- Training Backend ID / version
- Dataset source / Adapter ID / version

モデル重みそのものはEpisodeへ複製しない。

各Step resultには実際に使用された:

- `policy`
- `runtimePlugin`
- `runtimeAdapter`

を保存する。

## Current default plugins

### `motion_bc`

対象:

- NavigateToPallet
- AlignToPallet
- Transport
- Retreat

現在:

- Dataset Adapter: Motion observation/action
- Dataset: synthetic expert / imported manual demo
- Algorithm: Behavior Cloning
- Training Backend: Web Worker
- Runtime Adapter: Motion BC Runtime
- Evaluation Scenario: Forklift Motion Scenarios
- Evaluation: success / collision / control steps / final error (+ skill-specific metrics)
- Visualization:
  - training loss curve
  - dataset distribution
  - Classic vs Learned

これは **最初の具体例** であり、Framework本体ではない。

### `perception_future`

対象:

- DetectPallet

将来:

- RGB / Depth dataset adapter
- Detector / Segmentation / VLM
- perception runtime adapter
- camera-specific evaluation scenario
- Precision / Recall / mAP / pose error
- detection examples / PR curve / confusion matrix

### `manipulation_future`

対象:

- InsertForks
- Lift
- Place

将来:

- trajectory dataset adapter
- BC / ACT / Diffusion Policy / RL
- manipulation runtime adapter
- physics/contact evaluation scenario
- insertion success / contact / time / pose error
- action sequence / contact map / 3D trajectory / replay

現在のSimulatorは瞬時状態遷移のため、物理自由度を増やしてから具体実装する。

## UI rule

`learn.html` / `evaluate.html` はAlgorithm固有の項目を決め打ちしない。

```text
Plugin Descriptor
  ↓
UI builds controls dynamically
  ↓
Dataset Adapter / Training Backend / Plugin train/evaluate
  ↓
Plugin-defined runtime / scenario / visualizations / metrics
```

新しいPluginでTraining ParameterやEvaluation Metricが変わっても、基本的にページ本体を変更しない。

## Visualization framework

`src/learning/framework/visualization_renderer.js`

現在:

- `loss_curve`
- `dataset_distribution`
- `policy_comparison`
- `capability_note`

将来、Perception Pluginなら:

- `pr_curve`
- `confusion_matrix`
- `detection_gallery`
- `pose_error_distribution`

Manipulation Pluginなら:

- `trajectory_3d`
- `action_timeline`
- `contact_map`
- `episode_replay`

## Important principle

> Skill Learning Framework は共通。
> Dataset / Algorithm / Training Backend / Runtime / Evaluation / Visualization はSkill Pluginごとに異なってよい。

「全SkillをBehavior Cloningにする」「全SkillでLoss graphを出す」といった設計にはしない。

## Framework status

- [x] Skill Learning Plugin interface
- [x] Plugin Registry / Skill binding
- [x] Dynamic training parameters
- [x] Dynamic evaluation parameters / metrics
- [x] Visualization Renderer registry
- [x] Runtime Policy Adapter
- [x] Learned Runtime routing from SkillExecutor
- [x] Evaluation Scenario Adapter
- [x] Skill evaluatorからscenario preparationを分離
- [x] Web Worker Training Backend
- [x] Dataset Adapter interface
- [x] Manual observation/action JSON import
- [x] LeRobot conversion用 intermediate JSON export
- [x] Plugin/Policy/Model/Dataset metadataをEpisodeへ保存
- [x] Domain Service interface

## Next framework tasks

- [ ] 実際の手動操作からSkill-specific demonstrationを記録するRecorder
- [ ] 公式LeRobotDatasetへのconverter / importer
- [ ] Visualization Rendererのplugin-local registrationを強化
- [ ] Plugin単位のimport/export package形式を定義
- [ ] Worker cancellation / timeout
- [ ] Model ID / checksumを付与して実験再現性をさらに上げる
