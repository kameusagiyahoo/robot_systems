# robot_systems

物流フォークリフトを題材に、**Task → Planner → Skill → Policy → Robot → Environment** の階層構造を段階的に研究するための実験基盤です。

現在は GitHub Pages 上で、連続運動シミュレーション、Skill単位の学習・評価、Classic/Learned Policy比較まで動作する静的研究基盤です。OpenAI APIなどの秘密情報はまだブラウザ側では使いません。

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
- plugin-based **Skill Learning Framework v2.3**
- Web Worker training backend for motion BC
- Dataset Adapter with synthetic/manual-import workflows
- LeRobot conversion用 intermediate JSON export
- Plugin/Policy/Model/Dataset metadata in Episode logs
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

学習方式を全Skillで統一しません。

共通化するのは枠組みだけです。

```text
Skill
├ Dataset Adapter
├ Training Backend
├ Runtime Policy Adapter
├ Evaluation Scenario Adapter
├ Evaluation Metrics
└ Visualization Adapter
```

SkillごとにDataset、Algorithm、Training Backend、Runtime、評価Scenario、評価指標、可視化を差し替えます。

現在の例:

- Motion Skills → Behavior Cloning plugin + Motion Dataset Adapter + Web Worker Training + Motion BC Runtime
- DetectPallet → future Perception plugin
- Insert/Lift/Place → future Manipulation plugin

`Behavior Cloning` はFramework本体ではなく、最初のPlugin実装です。

## Learning Framework files

```text
src/learning/framework/
  skill_learning_plugin.js
  plugin_registry.js
  dataset_adapter.js
  training_backend.js
  runtime_policy_adapter.js
  runtime_router.js
  evaluation_scenario_adapter.js
  visualization_renderer.js
  episode_metadata.js
  domain_service_interface.js

src/learning/algorithms/
  motion_bc_core.js

src/learning/workers/
  motion_bc_training_worker.js

src/learning/plugins/
  default_skill_plugins.js
  motion_dataset_adapter.js
  motion_bc_training_backend.js
  motion_bc_runtime.js
  forklift_evaluation_scenarios.js

src/learning/ui/
  learning_page.js
  evaluation_page.js
```

### Training route

```text
Learning UI
  ↓
Skill Plugin
  ↓
Dataset Adapter
  ↓
Training Backend
  ↓
Web Worker
  ↓
Model
```

Motion BCはWeb Workerで学習します。Workerが利用できない場合のみmain thread fallbackします。

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

### Evaluation route

```text
Skill Evaluation UI
  ↓
Learning Plugin
  ↓
Skill Evaluator
  ↓
Evaluation Scenario Adapter
  ├ create runtime
  ├ prepare trial
  ├ execute skill
  ├ measure trial
  └ aggregate metrics
```

`skill_evaluator.js` はSkill固有の初期条件生成を持たず、Scenario Adapterへ委譲します。

### Dataset interchange

現在のMotion Dataset Adapterは以下を扱います。

- synthetic expert
- imported observation/action JSON
- portable skill dataset JSON
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
