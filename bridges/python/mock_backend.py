from __future__ import annotations

from copy import deepcopy
import math
from typing import Any, Dict

from .environment_bridge_core import EnvironmentBackend


class MockEnvironmentBackend(EnvironmentBackend):
    """Protocol/integration test backend only. Not a physics simulator."""

    environment_id = "mock_bridge_environment"
    label = "Mock Bridge Environment"
    version = 1
    kind = "simulation"
    fidelity = "protocol_smoke_test"

    def __init__(self):
        self.initial = {
            "robot": {"x": 1.0, "y": 5.0, "yaw": 0.0, "speed": 0.0, "angularVelocity": 0.0, "steeringAngle": 0.0, "forkRaised": False, "carrying": None, "aligned": False},
            "pallets": {"pallet_A": {"id": "pallet_A", "label": "Pallet A", "x": 4.0, "y": 2.0, "status": "available"}},
            "locations": {"shipping": {"id": "shipping", "label": "Shipping", "x": 8.0, "y": 5.0}},
            "perception": {"detectedPallets": []},
            "obstacle": {"enabled": False},
            "failures": {},
            "path": {"active": False, "index": 0, "waypoints": [], "densePoints": [], "lookaheadTarget": None},
            "simulation": {"dt": 0.08, "pathLength": 0.0, "controlTicks": 0, "collisions": 0, "vehicleModel": "mock_kinematic", "controller": "pure_pursuit", "lookaheadDistance": 1.0, "batchMode": False, "wheelbase": 1.0, "bodyLength": 1.6, "bodyWidth": 0.9, "maxLinearSpeed": 1.2, "maxReverseSpeed": 0.8, "maxAcceleration": 1.0, "maxSteeringAngle": 35.0, "maxSteeringRate": 90.0, "pid": {"kp": 0.8, "ki": 0.01, "kd": 0.18, "cteGain": 1.2}},
        }
        self._state = deepcopy(self.initial)

    def describe(self) -> Dict[str, Any]:
        base = super().describe()
        base.update({
            "coordinateFrame": {"name": "mock_world", "dimensions": 2, "angle": "degrees"},
            "units": {"length": "m", "time": "s", "speed": "m/s"},
            "semanticGeometry": {"palletPreAlign": 2.4, "palletStaging": 1.8, "palletDock": 1.25, "locationApproach": 1.2, "retreatDistance": 1.2, "detectionRange": 3.0},
            "intendedUse": "Bridge protocol smoke testing only",
            "capabilities": {**base["capabilities"], "reset": True, "trialConfiguration": True, "scenarios": True, "pose2d": True, "pose3d": False, "rgb": False, "depth": False, "lidar": False, "contact": False, "jointState": False, "forkActuation": True, "palletManipulation": True, "teleport": True, "domainServices": list(self.domain_services())},
            "limitations": ["not a physics simulator", "no sensor physics", "no contact physics"],
        })
        return base

    def state(self):
        return deepcopy(self._state)

    def reset(self, options):
        self._state = deepcopy(self.initial)
        scenario = (options or {}).get("scenario")
        if scenario:
            self.apply_scenario(scenario)
        return self.state()

    def configure_trial(self, spec):
        s = self._state
        spec = spec or {}
        if spec.get("reset", True):
            s["simulation"].update({"pathLength": 0.0, "controlTicks": 0, "collisions": 0})
            s["perception"]["detectedPallets"] = []
            s["robot"].update({"speed": 0.0, "steeringAngle": 0.0, "forkRaised": False, "carrying": None, "aligned": False})
        if spec.get("robot"):
            s["robot"].update(spec["robot"])
        for entity_id, patch in (spec.get("pallets") or {}).items():
            s["pallets"].setdefault(entity_id, {"id": entity_id, "label": entity_id}).update(patch)
        for entity_id, patch in (spec.get("locations") or {}).items():
            s["locations"].setdefault(entity_id, {"id": entity_id, "label": entity_id}).update(patch)
        if spec.get("perception", {}).get("detectedPallets") is not None:
            s["perception"]["detectedPallets"] = list(spec["perception"]["detectedPallets"])
        return self.state()

    def step(self, action):
        s = self._state
        r = s["robot"]
        t = action.get("type")
        if t == "stop":
            r["speed"] = 0.0
            r["steeringAngle"] = 0.0
            return {"ok": True}
        if t == "fork":
            r["forkRaised"] = bool(action.get("raised"))
            return {"ok": True, "raised": r["forkRaised"]}
        if t != "drive":
            return {"ok": False, "reason": f"unsupported_action:{t}"}
        dt = float(action.get("dt") or s["simulation"]["dt"])
        speed = max(-s["simulation"]["maxReverseSpeed"], min(s["simulation"]["maxLinearSpeed"], float(action.get("speed", 0.0))))
        steer = max(-s["simulation"]["maxSteeringAngle"], min(s["simulation"]["maxSteeringAngle"], float(action.get("steeringAngle", 0.0))))
        yaw = math.radians(r["yaw"])
        yaw_rate = -(speed / s["simulation"]["wheelbase"]) * math.tan(math.radians(steer))
        old = (r["x"], r["y"])
        r["yaw"] = (r["yaw"] + math.degrees(yaw_rate * dt)) % 360.0
        r["x"] += math.cos(yaw) * speed * dt
        r["y"] += math.sin(yaw) * speed * dt
        r["speed"] = speed
        r["steeringAngle"] = steer
        s["simulation"]["controlTicks"] += 1
        s["simulation"]["pathLength"] += math.hypot(r["x"] - old[0], r["y"] - old[1])
        return {"ok": True}

    def metrics(self):
        sim = self._state["simulation"]
        return {"pathLength": sim["pathLength"], "controlTicks": sim["controlTicks"], "collisions": sim["collisions"], "simTimeSec": sim["controlTicks"] * sim["dt"]}

    def domain_services(self):
        return ["manipulation.insertForks", "manipulation.setFork", "manipulation.place"]

    def domain_call(self, name, args):
        s = self._state
        if name == "manipulation.insertForks":
            pallet_id = str(args[0]);s["robot"]["carrying"] = pallet_id;s["pallets"][pallet_id]["status"] = "on_forks";return {"ok": True, "message": "mock forks inserted"}
        if name == "manipulation.setFork":
            return self.step({"type": "fork", "raised": bool(args[0])})
        if name == "manipulation.place":
            pallet_id, location_id = str(args[0]), str(args[1]);location = s["locations"][location_id];p = s["pallets"][pallet_id];p.update({"x": location["x"], "y": location["y"], "status": "placed"});s["robot"].update({"carrying": None, "forkRaised": False, "aligned": False});return {"ok": True, "message": "mock placed"}
        raise RuntimeError(f"domain_service_not_supported:{name}")

    def generate_scenarios(self, seed, count):
        return [{"id": f"mock-{seed}-{i}", "seed": str(seed), "index": i, "taskText": "パレットAを出荷エリアへ運んで"} for i in range(max(1, count))]

    def apply_scenario(self, scenario):
        self.reset({})
        self._state["benchmark"] = {"scenarioId": scenario.get("id"), "seed": scenario.get("seed"), "index": scenario.get("index")}
        return self.state()
