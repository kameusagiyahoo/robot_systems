# robot_systems

物流フォークリフトを題材に、**Task → Planner → Skill → Policy → Robot → Environment** の階層構造を段階的に研究するための実験基盤です。

現在は **GitHub Pagesで動く完全静的なv0.9** です。OpenAI APIなどの秘密情報はまだ使いません。

## Current features

- 2D warehouse simulator
- forklift / pallet / storage / shipping visualization
- smartphone-friendly web UI
- Rule Planner
- state-driven Agent loop: Observe → Decide → Execute → Observe
- reusable Skill contracts with preconditions / postconditions
- replaceable `PolicyInterface` + `RulePolicy`
- `RobotInterface` + `SimRobot`
- failure laboratory: blocked path / detection / alignment / insertion failures
- failure-aware replanning: retry / recovery / alternate route / abort
- Step / Run / Reset
- Agent Log / Decision History
- Robot / Agent State inspector
- Episode logging: Observation / Action / Result / Next Observation
- episode metrics: steps / failures / recoveries / success
- browser JSON export for later research-data conversion

## Architecture

```text
Human Task
   ↓
Task validation
   ↓
Planner          Rule now → OpenAI later
   ↓
Skill contract   Preconditions / Postconditions
   ↓
Policy           Rule now → PID/MPC/IL/RL/VLA later
   ↓
RobotInterface
   ↓
SimRobot         → PiRobot/ROS2 → ForkliftRobot
   ↓
Environment
   ↑
Observation / Result feedback
```

## Research migration path

```text
GitHub Pages + Rule Planner
↓
Cloudflare + OpenAI Planner
↓
Camera / Detection / Pose / Visual Servo
↓
Raspberry Pi + ROS2
↓
LeRobot dataset / imitation learning
↓
Workstation GPU / VLA / World Model experiments
↓
Controlled real-forklift validation
```

## Documents

- `docs/architecture.md` — layer design
- `docs/skills.md` — reusable Skill definitions
- `docs/roadmap.md` — full TODO from GitHub Pages to Cloudflare, LeRobot, Raspberry Pi, workstation learning and real forklift

## Important security rule

Do **not** put OpenAI API keys in `app.js` or any GitHub Pages file. When OpenAI Planner is introduced, move the API call to Cloudflare Worker / Pages Function and store the key as a server-side secret.
