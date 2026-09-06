# Minimal Gazebo Environment Verification

このパッケージは **robot_systems の Environment Adapter / Bridge 設計をGazeboで縦に通すためのSmoke Test** です。

物理性能・Sim-to-Real性能の評価用モデルではありません。最初の目的は、Browser2DをGazeboへ交換しても `Planner / Skill / Policy / Learning Framework` の上位層がそのまま動くことを確認することです。

## Target

基準環境:

- Ubuntu 24.04
- ROS 2 Jazzy
- Gazebo Harmonic / `ros_gz`
- Python 3

## What is included

- self-contained SDF world
- forklift-shaped differential-drive integration model
- pallet A
- `/cmd_vel`
- `/odom`
- `/camera`
- `/scan`
- `ros_gz_bridge` config
- robot_systems Python Environment Bridge
- shell contract checker
- explicit short drive test

The smoke forklift intentionally uses differential drive. It is **not** the final rear-steer forklift dynamics model. `DriveCommandAdapter` is the replacement boundary for Ackermann / rear-steer / ros2_control later.

---

## 1. Prepare dependencies

Source ROS 2 first:

```bash
source /opt/ros/jazzy/setup.bash
```

Required ROS packages are declared in `package.xml`. On a standard Jazzy installation, ensure `ros_gz`, launch tools and colcon are installed. Python Bridge dependencies are:

```bash
python3 -m pip install -r bridges/python/requirements.txt
```

If your Ubuntu Python installation blocks system-wide pip installs, use a virtual environment instead of forcing a system install.

---

## 2. Build the smoke ROS package

From repository root:

```bash
source /opt/ros/jazzy/setup.bash
colcon build \
  --base-paths sim/gazebo_smoke \
  --packages-select robot_systems_gazebo_smoke
source install/setup.bash
```

Re-run the final `source install/setup.bash` in each new terminal that launches the smoke package.

---

## 3. Terminal A - Start Gazebo

```bash
source /opt/ros/jazzy/setup.bash
source install/setup.bash
ros2 launch robot_systems_gazebo_smoke smoke.launch.py
```

Expected ROS topics:

```text
/cmd_vel
/odom
/camera
/scan
```

Do not continue to the Browser integration until `/odom` is publishing.

---

## 4. Terminal B - Start robot_systems Environment Bridge

From repository root:

```bash
source /opt/ros/jazzy/setup.bash
source install/setup.bash
bash sim/gazebo_smoke/scripts/run_environment_bridge.sh
```

Expected HTTP endpoints:

```text
http://127.0.0.1:8000/health
http://127.0.0.1:8000/environment
```

The Bridge maps Gazebo/ROS state into the common `robot_systems.task_runtime_state.v1` contract.

---

## 5. Terminal C - Contract check

```bash
source /opt/ros/jazzy/setup.bash
source install/setup.bash
bash sim/gazebo_smoke/scripts/check_stack.sh
```

Expected result:

```text
[OK] topic /cmd_vel
[OK] topic /odom
[OK] topic /camera
[OK] topic /scan
[OK] bridge health
[OK] handshake
Smoke stack contract check passed.
```

If this does not pass, do not debug Planner or Learning yet. Fix the Gazebo/ROS/Bridge boundary first.

---

## 6. Optional direct drive test

This deliberately moves the simulated vehicle for about 1.5 seconds:

```bash
bash sim/gazebo_smoke/scripts/drive_once.sh
```

Expected behavior:

1. forklift moves forward in Gazebo
2. `/odom` position changes
3. Bridge `/health` remains available

This isolates Gazebo control from the Browser application.

---

## 7. Terminal D - Start the Browser UI locally

GitHub Pages is HTTPS and may be blocked from calling a LAN/local HTTP Bridge by browser mixed-content policy. For the first integration test, serve the repository locally:

```bash
bash sim/gazebo_smoke/scripts/run_local_ui.sh
```

Open:

```text
http://127.0.0.1:8080/
```

In the application:

1. open **Research Settings**
2. open **External Environment Bridge**
3. Bridge URL = `http://127.0.0.1:8000`
4. Endpoint = `/environment`
5. press **接続テスト**
6. confirm remote environment ID is `gazebo_ros2_forklift`
7. press **保存してRemoteへ切替**

---

## 8. First end-to-end goal

Do not start with pallet manipulation or perception training.

First goal:

```text
Browser Task
  ↓
NavigateToPallet
  ↓
Classic Policy
  ↓
Environment Domain Services
  ↓
RemoteEnvironmentAdapter
  ↓
Environment Bridge
  ↓
/cmd_vel
  ↓
Gazebo forklift moves
  ↓
/odom
  ↓
Browser robot state changes
```

Use a simple task that resolves to pallet A. The important result is not navigation quality yet; it is that the entire environment boundary works without replacing Planner/Skill code.

---

## Known limitations

- Differential drive is used only for integration smoke testing.
- No physical fork joint yet.
- No contact-aware `InsertForks` / `Place` implementation yet.
- Camera and LiDAR topics exist, but no trained pallet detector is bundled.
- Automatic trial teleport/reset is disabled unless an explicit ROS `SetEntityPose` service is configured for the Environment Bridge.
- The world is deliberately simple and is not evidence of sim-to-real performance.

## Next gate after this passes

After this stack works end-to-end, the next implementation target is:

```text
rear-steer / ros2_control drive
+ physical fork joint
+ contact sensor
+ pallet insertion success criteria
```

Only after those work should `InsertForks / Lift / Place` become high-fidelity evaluation targets.
