# Skill Learning Framework

## Purpose

学習方法を全Skillで統一しない。

共通化するのは **学習の枠組み** だけで、Dataset / Algorithm / Runtime / Evaluation / Visualization はSkillごとのPluginが定義する。

```text
Task
  ↓
Skill
  ├ Runtime Policy Adapter
  ├ Dataset Adapter
  ├ Training Plugin
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
- training parameters
- evaluation parameters
- evaluation metrics
- runtime policy adapter
- evaluation scenario adapter
- visualization definitions
- `train()`
- `evaluate()`

### Plugin Registry

`src/learning/framework/plugin_registry.js`

Skill IDとLearning Pluginを結び付ける。

UI、Runtime Router、Skill Evaluatorは具体的なBC/YOLO/ACT等を直接知らず、Registry経由でPluginを取得する。

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

`src/skills/skills.js` が `runtime_router.js` を呼び出す。

現在のMotion BC実装は:

`src/learning/plugins/motion_bc_runtime.js`

に分離した。

そのため将来、ACT / SAC / VLA / Detector Runtime等を導入するときは、原則としてRulePolicyへ学習アルゴリズム固有コードを追加しない。

## Evaluation Scenario Adapter

`src/learning/framework/evaluation_scenario_adapter.js`

Skill評価で使う以下の内容もPlugin側の責務にする。

- Runtime生成
- 初期条件生成
- Skill入力生成
- trial metric計測
- aggregate

`src/evaluation/skill_evaluator.js` は現在、Skill固有の `switch(skillId)` を持たない。

現在のフォークリフト用Scenarioは:

`src/learning/plugins/forklift_evaluation_scenarios.js`

にある。

将来Camera perceptionや3D manipulationを追加するときは、そのPlugin専用Scenario Adapterへ差し替える。

## Current default plugins

### `motion_bc`

対象:

- NavigateToPallet
- AlignToPallet
- Transport
- Retreat

現在の具体実装:

- Dataset: synthetic expert observation/action
- Algorithm: Behavior Cloning
- Runtime Adapter: Motion BC Runtime
- Evaluation Scenario: Forklift Motion Scenarios
- Evaluation: success / collision / control steps / final error (+ skill-specific metrics)
- Visualization:
  - training loss curve
  - dataset distribution
  - Classic vs Learned

これは **最初の具体例** であり、framework本体ではない。

### `perception_future`

対象:

- DetectPallet

現在はフォークリフトの簡易Scenario Adapterを使うが、将来は以下へ差し替える。

- RGB / Depth dataset
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

現在はフォークリフトの簡易Scenario Adapterを使うが、将来は以下へ差し替える。

- trajectory dataset
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
Plugin train/evaluate
  ↓
Plugin-defined runtime / scenario / visualizations / metrics
```

新しいPluginで必要なTraining ParameterやEvaluation Metricが変わっても、基本的にページ本体を変更しない。

## Visualization framework

`src/learning/framework/visualization_renderer.js`

可視化タイプごとにRendererを登録する。

現在:

- `loss_curve`
- `dataset_distribution`
- `policy_comparison`
- `capability_note`

将来、Perception Pluginなら以下を追加できる。

- `pr_curve`
- `confusion_matrix`
- `detection_gallery`
- `pose_error_distribution`

Manipulation Pluginなら以下を追加できる。

- `trajectory_3d`
- `action_timeline`
- `contact_map`
- `episode_replay`

## Important principle

> Skill Learning Framework は共通。
> Dataset / Algorithm / Runtime / Evaluation / Visualization はSkill Pluginごとに異なってよい。

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

## Next framework tasks

- [ ] Web Worker training backendを追加してスマホUIをブロックしない
- [ ] Dataset Adapterへmanual demonstration / LeRobotDatasetを追加
- [ ] Visualization Rendererのplugin-local registrationを強化
- [ ] Plugin metadata/version/runtime adapterをEpisodeログへ保存
- [ ] Plugin単位のimport/export package形式を定義
- [ ] Simulator固有service (`pathTo` 等) の依存をDomain Service interfaceとして明文化
