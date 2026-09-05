# Skill Learning Framework

## Purpose

学習方法を全Skillで統一しない。

共通化するのは **学習の枠組み** だけで、Dataset / Algorithm / Evaluation / Visualization はSkillごとのPluginが定義する。

```text
Task
  ↓
Skill
  ├ Runtime Policy
  ├ Dataset Adapter
  ├ Training Plugin
  ├ Evaluation Adapter
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
- visualization definitions
- `train()`
- `evaluate()`

### Plugin Registry

`src/learning/framework/plugin_registry.js`

Skill IDとLearning Pluginを結び付ける。

UIは具体的なBC/YOLO/ACT等を直接知らず、Registry経由でPlugin Descriptorを読む。

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
- Runtime: Classic / Learned
- Evaluation: success / collision / control steps / final error (+ skill-specific metrics)
- Visualization:
  - training loss curve
  - dataset distribution
  - Classic vs Learned

これは **最初の具体例** であり、framework本体ではない。

### `perception_future`

対象:

- DetectPallet

将来想定:

- RGB / Depth dataset
- Detector / Segmentation / VLM
- Precision / Recall / mAP / pose error
- detection examples / PR curve / confusion matrix

Camera観測導入後、このPluginを具体実装へ差し替える。

### `manipulation_future`

対象:

- InsertForks
- Lift
- Place

将来想定:

- trajectory dataset
- BC / ACT / Diffusion Policy / RL
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
Plugin-defined visualizations / metrics
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
> Dataset / Algorithm / Evaluation / Visualization はSkill Pluginごとに異なってよい。

「全SkillをBehavior Cloningにする」「全SkillでLoss graphを出す」といった設計にはしない。

## Next framework tasks

- [ ] Runtime Policy自体もPlugin Adapter経由へ完全移行する
- [ ] Skill evaluatorのscenario preparationをPlugin側へ移す
- [ ] Web Worker training backendを追加してスマホUIをブロックしない
- [ ] Dataset Adapterへmanual demonstration / LeRobotDatasetを追加
- [ ] Visualization Rendererのplugin-local registrationを強化
- [ ] Plugin metadata/versionをEpisodeログへ保存
