# Roadmap / TODO

## Phase 0 — GitHub Pages / laptop only

### v0.1 — 2D warehouse visualization
- [x] Static GitHub Pages compatible app
- [x] 2D warehouse
- [x] Forklift / pallets / storage / shipping zones
- [x] Smartphone-friendly UI

### v0.2 — Manual operation
- [x] Basic manual movement controls
- [x] Fork up/down state
- [ ] Keyboard controls
- [ ] Touch joystick

### v0.3 — Skill API
- [x] RobotInterface abstraction
- [x] SimRobot implementation
- [x] Reusable skill catalog
- [x] Agent log / state inspector
- [ ] Explicit Policy interface below Skill layer
- [ ] Skill preconditions / postconditions
- [ ] Skill timeout / cancel

### v0.4 — Rule Planner
- [x] Natural-language-like task input
- [x] RulePlanner maps task to reusable skills
- [x] Step / Run / Reset
- [x] Pallet A/B and storage/shipping destination patterns
- [x] Basic task validation

### v0.5 — Agent loop
- [x] Observe → Plan → Skill → Result → State
- [x] Planner chooses one next Skill at a time instead of generating only a fixed full queue
- [x] Structured observation schema
- [x] Structured action/result schema
- [x] Decision history in UI
- [x] State-driven completion judgment

### v0.6 — Failure conditions
- [x] Failure Lab controls in UI
- [x] Enable obstacle / blocked-path failure
- [x] pallet not visible / forced detection failure
- [x] alignment failure
- [x] insertion failure
- [x] blocked path reason
- [x] invalid task
- [x] Failed Skill returns a structured reason

### v0.7 — Replanning
- [x] Failed Skill returns reason
- [ ] Planner consumes failure result and state
- [ ] Retry policy / retry limit
- [ ] Alternate route around obstacle
- [ ] Recover after transient perception/alignment failure
- [ ] Abort when recovery is impossible
- [ ] Compare fixed Behavior Tree vs agentic replanning

## Phase 1 — Cloudflare + OpenAI Planner
- [ ] Move deployment from GitHub Pages to Cloudflare Pages
- [ ] Keep repository private
- [ ] Add Worker / Pages Function backend
- [ ] Store OPENAI_API_KEY only in Cloudflare Secrets
- [ ] Add OpenAI Responses API planner adapter
- [ ] Tool/function schema for Skills
- [ ] RulePlanner / OpenAIPlanner switch
- [ ] Token/cost logging
- [ ] Guardrails: allow only declared Skills
- [ ] LLM chooses next Skill from current observation
- [ ] Feed result back to Planner and replan until success / abort

## Phase 2 — Perception and control
- [ ] Add camera observation to simulator
- [ ] pallet object detection
- [ ] segmentation / keypoint detection
- [ ] pallet hole / fork insertion target estimation
- [ ] depth / 3D pose representation
- [ ] visual servo baseline
- [ ] PID baseline
- [ ] MPC baseline
- [ ] compare explicit perception+control with learned Skill

## Phase 3 — Raspberry Pi robot
- [ ] Implement PiRobot adapter behind RobotInterface
- [ ] ROS2 bridge
- [ ] camera node
- [ ] motor control node
- [ ] sensor nodes
- [ ] teleoperation
- [ ] safety stop
- [ ] record observation/action episodes
- [ ] map recordings to LeRobotDataset-compatible schema

## Phase 4 — Workstation / robot learning
- [ ] Integrate LeRobot for teleoperation / recording / training / deployment
- [ ] ACT baseline
- [ ] Diffusion Policy baseline if suitable
- [ ] SmolVLA / VLA Skill experiment
- [ ] Export equivalent demonstration dataset to robomimic
- [ ] Compare behavioral cloning baselines
- [ ] World Model: observation + action → future state
- [ ] Compare learned planning with classical MPC

## Phase 5 — Multi-task logistics system
Reusable Skills target set:
- [ ] NavigateTo
- [ ] Stop
- [ ] AvoidObstacle
- [ ] DetectPallet
- [ ] EstimatePalletPose
- [ ] DetectFreeSpace
- [ ] AlignToPallet
- [ ] InsertFork
- [ ] Lift
- [ ] Lower
- [ ] ExtractFork
- [ ] PlacePallet

Target logistics Tasks:
- [ ] pallet transport A → B
- [ ] rack storage
- [ ] rack retrieval
- [ ] truck loading
- [ ] truck unloading
- [ ] warehouse rearrangement

Evaluation:
- [ ] task success rate
- [ ] collision rate
- [ ] completion time
- [ ] final positioning error
- [ ] unseen pallet generalization
- [ ] unseen environment generalization
- [ ] skill reuse across tasks
- [ ] planner recovery after failure

## Phase 6 — Real forklift
- [ ] ForkliftRobot adapter
- [ ] preserve Task / Planner / Skill interfaces
- [ ] hardware safety controller independent from LLM
- [ ] emergency stop
- [ ] speed / steering / fork control limits
- [ ] staged validation: simulation → small robot → controlled forklift environment
- [ ] logging / replay / incident analysis

## Architectural principles
1. LLM decides **what Skill to use**, not low-level actuator values.
2. Precise/safety-critical motion remains in deterministic or validated Skill controllers unless research explicitly tests alternatives.
3. `RobotInterface` stays stable so SimRobot → PiRobot → ForkliftRobot is a replaceable adapter.
4. Every episode should eventually be recordable as observation/state/action/result data.
5. LeRobot, VLA, World Model, etc. are introduced only when the corresponding research question exists.
