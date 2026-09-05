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
- [x] long-press touch driving for demonstration recording
- [ ] Keyboard controls
- [ ] Touch joystick

### v0.3 — Skill API
- [x] RobotInterface abstraction
- [x] SimRobot implementation
- [x] Reusable skill catalog
- [x] Agent log / state inspector
- [x] Explicit Policy interface below Skill layer
- [x] Skill preconditions / postconditions
- [ ] Skill timeout / cancel

### v0.4 — Rule Planner
- [x] Natural-language-like task input
- [x] RulePlanner maps task to reusable skills
- [x] Step / Run / Reset
- [x] Pallet A/B and storage/shipping destination patterns
- [x] Basic task validation

### v0.5 — Agent loop
- [x] Observe → Plan → Skill → Result → State
- [x] Planner chooses one next Skill at a time
- [x] Structured observation schema
- [x] Structured action/result schema
- [x] Decision history in UI
- [x] State-driven completion judgment

### v0.6 — Failure conditions
- [x] Failure Lab controls in UI
- [x] obstacle / blocked-path failure
- [x] pallet detection failure
- [x] alignment failure
- [x] insertion failure
- [x] invalid task
- [x] structured failure reason

### v0.7 — Replanning
- [x] Planner consumes failure result and state
- [x] Retry policy / retry limit
- [x] Alternate route around obstacle
- [x] Recovery action for perception failure
- [x] Recovery action for alignment / insertion failure
- [x] Abort when recovery is impossible
- [ ] Compare fixed Behavior Tree vs agentic replanning

### v0.8 — Policy separation
- [x] PolicyInterface
- [x] RulePolicy
- [x] Skill → Policy → Robot separation
- [x] Skill preconditions / postconditions
- [x] Continuous kinematic RulePolicy instead of teleport placeholders
- [x] PID Policy baseline
- [ ] MPC Policy baseline

### v0.9 — Episode logging / research data
- [x] Observation schema
- [x] Action schema
- [x] Result schema
- [x] Observation_t → Action_t → Result_t → Observation_t+1 recording
- [x] Episode success / failure / recovery metrics
- [x] Browser JSON export
- [x] trajectory distance metric
- [x] elapsed time metric
- [x] control tick count
- [x] collision count
- [x] controller metadata
- [x] mean cross-track error metric
- [x] deterministic seeded scenario generation

### v1.0 — Continuous motion simulator
- [x] linear velocity state
- [x] angular velocity state
- [x] simulation Δt
- [x] continuous Robot action
- [x] closed-loop drive-to-target controller
- [x] continuous navigation to pallet / destination
- [x] continuous pallet alignment
- [x] continuous retreat / recovery motion
- [x] motion timeout result

### v1.1 — Forklift vehicle kinematics
- [x] rear-wheel-steer bicycle model
- [x] wheelbase parameter
- [x] steering-angle state
- [x] acceleration limit
- [x] steering-angle limit
- [x] steering-rate limit
- [x] collision geometry checked every control tick
- [x] collision count in Episode metrics
- [x] RulePolicy commands speed + steering angle instead of yaw rate directly

### v1.2 — Path and vehicle geometry
- [x] oriented rectangle vehicle collision model
- [x] reverse-aware drive-to-target controller
- [x] negative-speed reverse motion
- [x] waypoint/path representation
- [x] obstacle bypass via intermediate waypoints
- [x] path visualization

### v1.3 — Pure Pursuit baseline
- [x] densified path representation
- [x] lookahead point selection
- [x] rear-steer Pure Pursuit steering law
- [x] curvature-aware speed reduction
- [x] Rule Waypoint / Pure Pursuit controller switch
- [x] adjustable lookahead distance in UI
- [x] lookahead point visualization
- [x] mean cross-track error in Episode metrics

### v1.4 — Batch Evaluation
- [x] automatic repeated trials in browser
- [x] compare Pure Pursuit vs Rule Waypoint
- [x] fast batch mode without animation delay
- [x] success / collision / distance / simulated time / control tick / CTE / failure / recovery metrics

### v1.5 — Seeded Benchmark Suite
- [x] deterministic seed input
- [x] reproducible scenario generator
- [x] randomized initial robot pose
- [x] randomized pallet source
- [x] randomized destination
- [x] randomized obstacle enable / pose / size
- [x] identical scenario set for every controller
- [x] multi-scenario benchmark runner
- [x] scenario metadata retained in detailed results
- [x] benchmark JSON export
- [x] benchmark CSV summary export
- [x] 1–50 scenarios from UI
- [ ] predefined benchmark difficulty sets (easy / medium / hard)
- [ ] final-position error metric

### v1.6 — PID baseline / migration gate
- [x] PID path steering controller
- [x] heading error + cross-track error feedback
- [x] controller selector: Rule / Pure Pursuit / PID
- [x] seeded benchmark comparison across all three
- [x] tune Kp / Ki / Kd / CTE gain from UI
- [x] PID parameters recorded in benchmark / episode metadata
- [x] migration-ready interfaces documented in `docs/migration_gate.md`
- [x] Cloudflare/OpenAI migration gate reached

### v2.0 — Skill Learning / Evaluation
- [x] Skillごとの学習状態管理
- [x] Classic / Learned Policy切替
- [x] Skill単体評価
- [x] Classic vs Learned比較
- [x] Policy別評価履歴
- [x] learned runtime for NavigateToPallet / AlignToPallet / Transport / Retreat

### v2.1 — Plugin-based Learning Framework
- [x] SkillLearningPlugin interface
- [x] Plugin Registry / Skill binding
- [x] dynamic training parameters
- [x] dynamic evaluation parameters / metrics
- [x] Visualization Renderer registry
- [x] Plugin-defined primary evaluation metric
- [x] loss curve / dataset distribution / policy comparison visualization

### v2.2 — Runtime / Evaluation adapters
- [x] Runtime Policy Adapter
- [x] SkillExecutor → Runtime Router → learned Plugin Runtime
- [x] remove learned algorithm code from RulePolicy
- [x] Evaluation Scenario Adapter
- [x] remove Skill-specific scenario switch from generic evaluator
- [x] named Domain Service interface for Plugin runtimes

### v2.3 — Worker / Dataset / Reproducibility
- [x] Web Worker Training Backend
- [x] pure motion BC training core
- [x] Dataset Adapter interface
- [x] synthetic expert dataset source
- [x] manual/imported observation-action JSON source
- [x] portable dataset JSON export
- [x] LeRobot conversion用 intermediate JSON export
- [x] Plugin / Policy / Model / Dataset metadata snapshot in Episode
- [x] per-step runtimePlugin / runtimeAdapter metadata

### v2.4 — Demonstration Recorder Framework
- [x] Demonstration Recorder Adapter interface
- [x] Plugin Registry exposes Skill-specific recorder
- [x] Motion Skill manual demonstration recorder
- [x] NavigateToPallet / AlignToPallet / Transport / Retreat recording
- [x] long-press manual controls sampled at simulator cadence
- [x] append / replace existing manual dataset
- [x] recorded dataset selectable by Training Plugin
- [x] recorder metadata included in Episode snapshot

### v2.5 — Training safety / Model identity / Skill Package
- [x] Web Worker training cancellation
- [x] configurable training timeout
- [x] no main-thread fallback after cancel / timeout
- [x] deterministic Model ID
- [x] SHA-256 Model checksum with fallback hash
- [x] Model ID/checksum in Episode metadata
- [x] Skill Learning Package export
- [x] Package checksum validation
- [x] Model checksum validation on Package import
- [x] restore Model / Dataset / Policy / Evaluation history from Package
- [ ] official LeRobotDataset converter / importer
- [ ] demonstration episode boundaries / quality labels
- [ ] DAgger / corrective demonstration workflow
- [ ] plugin-local visualization registration
- [ ] train / validation dataset split
- [ ] rollout benchmark linked to Model ID

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
- [ ] Compare RulePlanner vs OpenAIPlanner on seeded benchmark scenarios

## Phase 2 — Perception and control
- [ ] Add camera observation to simulator
- [ ] pallet object detection
- [ ] segmentation / keypoint detection
- [ ] pallet hole / fork insertion target estimation
- [ ] depth / 3D pose representation
- [ ] visual servo baseline
- [x] PID baseline
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
- [ ] preserve Task / Planner / Skill / Policy interfaces
- [ ] hardware safety controller independent from LLM
- [ ] emergency stop
- [ ] speed / steering / fork control limits
- [ ] staged validation: simulation → small robot → controlled forklift environment
- [ ] logging / replay / incident analysis

## Architectural principles
1. LLM decides **what Skill to use**, not low-level actuator values.
2. Precise/safety-critical motion remains in deterministic or validated Policy/Controller unless research explicitly tests alternatives.
3. `RobotInterface` stays stable so SimRobot → PiRobot → ForkliftRobot is a replaceable adapter.
4. Every episode is recorded as observation/state/action/result data.
5. Skill Learning Framework自体は学習方式を固定せず、Dataset / Demonstration Recording / Algorithm / Training Backend / Runtime / Evaluation / VisualizationをPluginで差し替える。
6. LeRobot, VLA, World Model, etc. are introduced only when the corresponding research question exists.
