# Architecture

## Core idea

The project separates **Task / Planner / Skill / Policy / Robot / Environment** so that each layer can be replaced independently.

```text
Human Task
   ↓
Planner
   ↓
Skill
   ↓
Policy / Controller
   ↓
Robot Interface
   ↓
Environment / Hardware
   ↑
Observation feedback
```

## Current v0 implementation

- Task: Japanese text input
- Planner: RulePlanner
- Skill: rule-based placeholders
- Policy: embedded rule logic
- Robot: SimRobot
- Environment: 2D warehouse

## Intended replacements

- Planner → OpenAI Responses API / LLM planner
- Skill → visual servo / imitation learning / RL / VLA skill
- Policy → ACT / Diffusion Policy / SmolVLA / custom policy
- Robot → Raspberry Pi robot adapter / ROS2 adapter / forklift adapter
- Dataset → LeRobotDataset
- Research baselines → LeRobot / robomimic
