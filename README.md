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
- plugin-based **Skill Learning Framework**

## Architecture

```text
Human Task
   ↓
Planner
   ↓
Skill
   ↓
Policy / Controller
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
├ Runtime Policy
├ Dataset Adapter
├ Training Plugin
├ Evaluation Adapter
└ Visualization Adapter
```

SkillごとにDataset、Algorithm、評価指標、可視化を差し替えます。

現在の例:

- Motion Skills → Behavior Cloning plugin
- DetectPallet → future Perception plugin
- Insert/Lift/Place → future Manipulation plugin

`Behavior Cloning` はFramework本体ではなく、最初のPlugin実装です。

## Learning Framework files

```text
src/learning/framework/
  skill_learning_plugin.js
  plugin_registry.js
  visualization_renderer.js

src/learning/plugins/
  default_skill_plugins.js

src/learning/ui/
  learning_page.js
  evaluation_page.js
```

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
