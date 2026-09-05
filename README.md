# robot_systems

物流フォークリフトを題材に、**Task → Planner → Skill → Policy → Robot → Environment** の階層構造を段階的に研究するための実験基盤です。

現在は GitHub Pages 上で、連続運動シミュレーション、Skill単位の学習・評価、Classic/Learned Policy比較、手動Demonstration記録、学習Modelの再現性管理まで動作する静的研究基盤です。OpenAI APIなどの秘密情報はまだブラウザ側では使いません。

## Current features

- 2D warehouse simulator
- rear-steer forklift kinematics
- smartphone-first one-screen UI
- Rule Planner + failure-aware replanning
- reusable Skill contracts with preconditions / postconditions
- `PolicyInterface` / `RobotInterface`
- Rule Waypoint / Pure Pursuit / PID baselines
- learned motion policies for selected Skills
- Skill-by-Skill learning state and evaluation
- Classic vs Learned comparison
- seeded benchmark / evaluation history
- Episode logging and JSON/CSV export
- plugin-based **Skill Learning Framework v2.6**
- cancellable Web Worker training + timeout
- Skill-specific Demonstration Recorder Adapter
- 1 recording session = 1 Demonstration Episode
- Episode Outcome / Quality / Note labels
- Episode-level Train / Validation split
- Train + Validation loss visualization
- deterministic Model ID + checksum
- Model-aware closed-loop Rollout Evaluation
- Skill Learning Package import/export + integrity check
- LeRobot conversion用 intermediate JSON export
- Plugin/Policy/Model/Dataset/Recorder metadata in Episode logs
- named Domain Service contracts for learned runtimes

## Architecture

```text
Human Task
   ↓
Planner
   ↓
Skill
   ↓
SkillExecutor
   ├ Classic Policy
   └ Learning Runtime Router → Plugin Runtime Adapter
   ↓
RobotInterface
   ↓
SimRobot → PiRobot/ROS2 → ForkliftRobot
   ↓
Environment
   ↑
Observation / Result
```

## Skill Learning Framework

学習方式を全Skillで統一しません。共通化するのは枠組みだけです。

```text
Skill
├ Dataset Adapter
├ Demonstration Recorder Adapter
├ Training Backend
├ Runtime Policy Adapter
├ Evaluation Scenario Adapter
├ Evaluation Metrics
└ Visualization Adapter
```

SkillごとにDataset、Demonstration Recording、Algorithm、Training Backend、Runtime、評価Scenario、評価指標、可視化を差し替えます。

現在の例:

- Motion Skills → Behavior Cloning plugin + episodic Motion Dataset + Manual Demo Recorder + Web Worker Training + Motion BC Runtime
- DetectPallet → future Perception plugin
- Insert/Lift/Place → future Manipulation plugin

`Behavior Cloning` はFramework本体ではなく、最初のPlugin実装です。

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
  runtime_policy_adapter.js
  runtime_router.js
  evaluation_scenario_adapter.js
  visualization_renderer.js
  episode_metadata.js
  domain_service_interface.js
  model_identity.js
  skill_package.js

src/learning/algorithms/
  motion_bc_core.js

src/learning/workers/
  motion_bc_training_worker.js

src/learning/plugins/
  default_skill_plugins.js
  motion_dataset_adapter.js
  motion_demonstration_recorder.js
  motion_bc_training_backend.js
  motion_bc_runtime.js
  forklift_evaluation_scenarios.js

src/learning/ui/
  learning_page.js
  evaluation_page.js
```

### Demonstration route

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
  └ Observation + Action samples
  ↓
Dataset Adapter
```

現在は `NavigateToPallet / AlignToPallet / Transport / Retreat` を手動記録できます。

研究設定のRecorderでSkillを選び、記録開始後に方向ボタンを長押しします。1回の開始〜停止が1 Episodeです。保存後、Skill学習画面でOutcome / Quality / Noteを編集できます。

### Train / Validation route

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

手動Demonstrationでは、同一走行の連続フレームがTrainとValidationの両方へ入らないようEpisode単位で分離します。Synthetic/legacy flat Datasetだけsample-level deterministic splitを使います。

Motion BCはTrain lossとValidation lossを保存し、学習画面で両方を可視化します。

**Validation lossはDataset上の予測誤差であり、閉ループSkill成功率ではありません。** 実際の実行性能はRollout Evaluationで確認します。

### Runtime route

```text
SkillExecutor
  ↓
selected policy?
  ├ Classic → RulePolicy / controller
  └ Learned → Runtime Router → Skill Plugin Runtime Adapter
```

Learned Runtimeが必要とするSimulator機能はDomain Service Provider経由で渡します。

```text
path.to
path.palletApproach
state.get
state.emit
```

`RulePolicy` はClassic制御だけを担当し、BC/ACT/SAC等の学習方式固有Runtimeを直接持たない方針です。

### Model-aware Rollout Evaluation

```text
Skill Evaluation UI
  ↓
Evaluation Scenario Adapter
  ↓
closed-loop trials
  ↓
Evaluation result
  ├ Model ID
  ├ Model checksum
  ├ Success rate
  └ Skill-specific metrics
```

再学習してModel IDが変わった場合、以前のLearned評価を現在Modelの評価として表示しません。

### Skill Learning Package

学習画面から1 Skillの研究状態をJSON PackageとしてExport / Importできます。

Packageには以下を含みます。

- Plugin ID / version
- selected Policy
- Model + Model checksum
- Dataset metadata
- episodic/manual Dataset payload
- Evaluation history
- Package checksum

Import時にPackage checksumとModel checksumを検証します。

### Dataset interchange

現在のMotion Dataset Adapterは以下を扱います。

- synthetic expert
- recorded Demonstration Episodes
- imported observation/action JSON
- portable episodic skill dataset JSON
- LeRobot conversion用 intermediate JSON

LeRobot intermediate JSONは公式LeRobotDatasetそのものではありません。PC/Workstation側で公式形式へ変換するための中間形式です。

## Research migration path

```text
GitHub Pages + Rule Planner
↓
Skill Learning / Evaluation Framework
↓
Cloudflare + OpenAI Planner
↓
Camera / Detection / Pose / Visual Servo
↓
Raspberry Pi + ROS2
↓
LeRobot dataset / imitation learning
↓
Workstation GPU / ACT / VLA / World Model
↓
Controlled real-forklift validation
```

## Documents

- `docs/architecture.md` — layer design
- `docs/skills.md` — reusable Skill definitions
- `docs/learning_framework.md` — Skillごとに学習方式を差し替えるPlugin framework
- `docs/skill_learning.md` — Skill learning notes
- `docs/skill_evaluation.md` — Skill evaluation design
- `docs/roadmap.md` — full TODO
- `docs/migration_gate.md` — Cloudflare/OpenAI migration gate

## Important security rule

Do **not** put OpenAI API keys in browser-side JavaScript or GitHub Pages files. When OpenAI Planner is introduced, API calls must move to Cloudflare Worker / Pages Function and keys must stay in server-side secrets.
