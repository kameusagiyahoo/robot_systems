# Migration Gate — v1.6

v1.6 is the migration-ready baseline for moving the planner/backend to Cloudflare + OpenAI while preserving the simulator, skills, controller baselines and evaluation harness.

## Interfaces to keep stable

### Task / Planner boundary
Planner input is the current task and structured state/observation. Planner output is one declared Skill or a terminal decision (`done` / `abort`).

### Skill boundary
Skills remain named, reusable operations such as:
- `navigate_to_pallet`
- `detect_pallet`
- `align_to_pallet`
- `insert_forks`
- `lift`
- `navigate_to`
- `place`
- `retreat`
- recovery skills

Each Skill is guarded by preconditions/postconditions and returns a structured result.

### Policy boundary
`PolicyInterface` sits below Skill execution. Current simulator baselines are:
- Rule Waypoint
- Pure Pursuit
- PID Path

Future PID/MPC/learned controllers can be added without changing Planner semantics.

### Robot boundary
`RobotInterface` is the hardware abstraction. `SimRobot` is the current implementation. Future targets should implement the same observation/action contract through `PiRobot`, ROS2 adapters, or a real forklift adapter.

### Research data boundary
Episodes preserve Observation → Action → Result → Next Observation, plus controller metadata and evaluation metrics. Seeded Benchmark Suite uses identical scenarios for controller comparison.

## Cloudflare + OpenAI migration plan

1. Keep this static GitHub Pages version as the deterministic baseline.
2. Add a Cloudflare Worker / Pages Function backend.
3. Store `OPENAI_API_KEY` only as a server-side Cloudflare secret.
4. Add `OpenAIPlanner` beside `RulePlanner`; do not replace Skill/Policy/Robot interfaces.
5. Expose only declared Skills to the LLM planner.
6. Send structured observation + previous result to the planner and receive one next Skill.
7. Log planner model, latency, token usage and cost into Episode metadata.
8. Compare `RulePlanner` vs `OpenAIPlanner` using the same seeded benchmark scenarios.

## Migration gate status

Ready:
- Task → Planner → Skill → Policy → Robot separation
- state-driven agent loop
- failure reasons and replanning
- Skill pre/postconditions
- stable RobotInterface
- rear-steer continuous vehicle model
- Rule / Pure Pursuit / PID controller baselines
- seeded multi-scenario benchmark
- JSON/CSV evaluation export
- episode logging

Not required before Cloudflare migration:
- MPC
- camera perception
- ROS2 / Raspberry Pi
- LeRobot / imitation learning / VLA
- real forklift hardware

These should be introduced after the Cloudflare/OpenAI planner migration so they remain independent research axes.
