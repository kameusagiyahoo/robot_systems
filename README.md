# robot_systems

物流フォークリフトを題材に、**Task → Planner → Skill → Policy → Robot → Environment** の階層構造を段階的に研究するための実験基盤です。

現在は **GitHub Pagesで動く完全静的なv0** です。OpenAI APIなどの秘密情報はまだ使いません。

## Current features

- 2D warehouse simulator
- forklift / pallet / storage / shipping visualization
- smartphone-friendly web UI
- Rule Planner
- reusable Skill queue
- Step / Run / Reset
- Agent Log
- Robot / Agent State inspector
- `RobotInterface` abstraction for future SimRobot → PiRobot → ForkliftRobot replacement

## Run

静的ファイルだけなので `index.html` をWebサーバーから配信すれば動作します。GitHub Pagesにもそのまま配置できます。

## Architecture

```text
Human Task
   ↓
Planner          Rule now → OpenAI later
   ↓
Skill            Navigate / Align / Insert / Lift / Place ...
   ↓
Policy           Rules now → PID/MPC/IL/RL/VLA later
   ↓
RobotInterface
   ↓
SimRobot         → PiRobot/ROS2 → ForkliftRobot
   ↓
Environment
```

## Documents

- `docs/architecture.md` — layer design
- `docs/skills.md` — reusable Skill definitions
- `docs/roadmap.md` — full TODO from GitHub Pages to Cloudflare, LeRobot, Raspberry Pi, workstation learning and real forklift

## Important security rule

Do **not** put OpenAI API keys in `app.js` or any GitHub Pages file. When OpenAI Planner is introduced, move the API call to Cloudflare Worker / Pages Function and store the key as a server-side secret.
