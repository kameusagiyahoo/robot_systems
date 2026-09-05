# Architecture

## Core idea

The project separates **Task / Planner / Skill / Policy / Robot / Environment** so that each layer can be replaced independently.

```text
Human Task
   ↓
Task validation
   ↓
Planner
   ↓
Skill contract
(precondition / postcondition)
   ↓
Policy / Controller
   ↓
Robot Interface
   ↓
Environment / Hardware
   ↑
Observation / Result feedback
```

Each execution step is also recorded as:

```text
Observation_t
   ↓
Planner decision
   ↓
Skill + Action
   ↓
Policy execution
   ↓
Result_t
   ↓
Observation_t+1
```

## Current v0.9 implementation

- Task: Japanese text input + basic validation
- Planner: RulePlanner
- Agent loop: state-driven, one Skill decision at a time
- Replanning: failure reason → retry / recovery / alternate route / abort
- Skill: reusable contracts with explicit preconditions and postconditions
- Policy: RulePolicy behind PolicyInterface
- Robot: SimRobot behind RobotInterface
- Environment: 2D warehouse
- Failure Lab: blocked path / detection / alignment / insertion failures
- Episode logger: Observation / Action / Result / Next Observation
- Export: episode JSON from the browser

## Replacement points

- Planner → OpenAI Responses API / LLM planner
- Policy → PID / MPC / visual servo / imitation-learning policy / VLA policy
- Robot → Raspberry Pi robot adapter / ROS2 adapter / forklift adapter
- Perception → camera + object detection / segmentation / pose estimation
- Dataset → LeRobotDataset-compatible conversion
- Research baselines → LeRobot / robomimic

## Design rule

The LLM/Planner decides **what Skill should run next**. Low-level actuator commands remain inside a Policy/Controller layer so safety-critical motion can be tested and replaced independently.
