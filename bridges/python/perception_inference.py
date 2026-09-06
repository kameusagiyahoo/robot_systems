from __future__ import annotations

from abc import ABC
from copy import deepcopy
import json
import urllib.request
from typing import Any, Dict, Optional

from bridges.python.environment_bridge_core import EnvironmentBackend


class PerceptionInferenceProvider(ABC):
    provider_id = "perception_provider"
    label = "Perception Inference Provider"
    version = 1

    def describe(self) -> Dict[str, Any]:
        return {"id": self.provider_id, "label": self.label, "version": self.version}

    def infer(self, request: Dict[str, Any], environment: EnvironmentBackend) -> Dict[str, Any]:
        raise NotImplementedError

    def detect_pallet(self, request: Dict[str, Any], environment: EnvironmentBackend) -> Dict[str, Any]:
        result = self.infer({"task": "detect_pallet", **request}, environment)
        if not isinstance(result, dict):
            raise RuntimeError("perception_provider_invalid_result")
        if "detected" not in result:
            raise RuntimeError("perception_provider_missing_detected")
        return result


class HttpPerceptionInferenceProvider(PerceptionInferenceProvider):
    """Forward on-demand sensor packets to an external inference service.

    Expected response is JSON. For detect_pallet it must contain `detected`.
    API credentials remain on the Python bridge host, never in GitHub Pages.
    """

    provider_id = "http_perception_inference"
    label = "HTTP Perception Inference"
    version = 1

    def __init__(self, endpoint: str, *, token: Optional[str] = None, timeout: float = 15.0, preferred_sensors: tuple[str, ...] = ("rgb", "depth", "lidar")):
        if not endpoint:
            raise ValueError("perception_endpoint_required")
        self.endpoint = endpoint
        self.token = token
        self.timeout = float(timeout)
        self.preferred_sensors = preferred_sensors

    def describe(self) -> Dict[str, Any]:
        return {**super().describe(), "endpoint": self.endpoint, "preferredSensors": list(self.preferred_sensors), "authentication": "server_side_bearer" if self.token else "none"}

    def _choose_sensor(self, environment: EnvironmentBackend, requested: Optional[str] = None) -> Optional[Dict[str, Any]]:
        manifest = environment.sensor_manifest()
        if requested:
            return next((x for x in manifest if x.get("sensorId") == requested), None)
        for sensor_type in self.preferred_sensors:
            found = next((x for x in manifest if x.get("type") == sensor_type and x.get("available", True)), None)
            if found:
                return found
        return None

    def infer(self, request: Dict[str, Any], environment: EnvironmentBackend) -> Dict[str, Any]:
        sensor_desc = self._choose_sensor(environment, request.get("sensorId"))
        sensor_packet = None
        if sensor_desc:
            sensor_packet = environment.read_sensor(str(sensor_desc["sensorId"]), request.get("sensorOptions") or {})
        payload = {
            "task": request.get("task") or "infer",
            "target": request.get("target"),
            "options": request.get("options") or {},
            "sensor": sensor_packet,
            "environment": {"id": environment.describe().get("id"), "units": environment.describe().get("units")},
        }
        headers = {"content-type": "application/json"}
        if self.token:
            headers["authorization"] = f"Bearer {self.token}"
        req = urllib.request.Request(self.endpoint, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                value = json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            raise RuntimeError(f"perception_http_inference_failed:{exc}") from exc
        if not isinstance(value, dict):
            raise RuntimeError("perception_http_response_not_object")
        return value


class PerceptionEnabledBackend(EnvironmentBackend):
    """Decorator adding semantic perception services to any sensor-capable backend."""

    def __init__(self, backend: EnvironmentBackend, provider: PerceptionInferenceProvider):
        self.backend = backend
        self.provider = provider
        self.environment_id = backend.environment_id
        self.label = backend.label
        self.version = backend.version
        self.kind = backend.kind
        self.fidelity = backend.fidelity
        self.state_contract = backend.state_contract

    def connect(self): return self.backend.connect()
    def close(self): return self.backend.close()
    def state(self): return self.backend.state()
    def observe(self): return self.backend.observe()
    def reset(self, options): return self.backend.reset(options)
    def step(self, action): return self.backend.step(action)
    def configure_trial(self, spec): return self.backend.configure_trial(spec)
    def metrics(self): return self.backend.metrics()
    def sensor_manifest(self): return self.backend.sensor_manifest()
    def read_sensor(self, sensor_id, options): return self.backend.read_sensor(sensor_id, options)
    def generate_scenarios(self, seed, count): return self.backend.generate_scenarios(seed, count)
    def apply_scenario(self, scenario): return self.backend.apply_scenario(scenario)
    def task_text(self, scenario): return self.backend.task_text(scenario)

    def domain_services(self):
        return tuple(dict.fromkeys([*self.backend.domain_services(), "perception.infer", "perception.detectPallet"]))

    def domain_call(self, name: str, args: list[Any]) -> Any:
        if name == "perception.infer":
            request = deepcopy(args[0] if args else {})
            return self.provider.infer(request, self.backend)
        if name == "perception.detectPallet":
            request = deepcopy(args[0] if args else {})
            return self.provider.detect_pallet(request, self.backend)
        return self.backend.domain_call(name, args)

    def describe(self) -> Dict[str, Any]:
        base = deepcopy(self.backend.describe())
        caps = dict(base.get("capabilities") or {})
        caps["domainServices"] = list(self.domain_services())
        caps["perceptionInference"] = True
        base["capabilities"] = caps
        base["perceptionInference"] = self.provider.describe()
        return base
