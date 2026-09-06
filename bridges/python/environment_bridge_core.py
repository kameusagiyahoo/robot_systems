from __future__ import annotations

from abc import ABC
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Optional
import time

PROTOCOL = "robot_systems.environment_bridge.v1"
TASK_STATE_SCHEMA = "robot_systems.task_runtime_state.v1"
SENSOR_PACKET_SCHEMA = "robot_systems.sensor_packet.v1"


class EnvironmentBackend(ABC):
    """Simulator/hardware-specific backend.

    Implement only the operations the environment can support. The bridge
    advertises those capabilities during handshake so upper layers can reject
    unsupported Skills before execution.
    """

    environment_id = "external_environment"
    label = "External Environment"
    version = 1
    kind = "simulation"
    fidelity = "unknown"
    state_contract = TASK_STATE_SCHEMA

    def connect(self) -> None:
        return None

    def close(self) -> None:
        return None

    def describe(self) -> Dict[str, Any]:
        return {
            "id": self.environment_id,
            "label": self.label,
            "version": self.version,
            "kind": self.kind,
            "fidelity": self.fidelity,
            "stateContract": self.state_contract,
            "nativeRuntime": self.__class__.__name__,
            "coordinateFrame": {"name": "world", "dimensions": 3},
            "units": {"length": "m", "time": "s", "speed": "m/s"},
            "capabilities": {
                "observation": True,
                "step": True,
                "metrics": True,
                "sensorRead": bool(list(self.sensor_manifest())),
                "domainServices": list(self.domain_services()),
            },
        }

    def state(self) -> Dict[str, Any]:
        raise NotImplementedError

    def observe(self) -> Any:
        return self.state()

    def reset(self, options: Dict[str, Any]) -> Any:
        raise NotImplementedError("reset_not_supported")

    def step(self, action: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError

    def configure_trial(self, spec: Dict[str, Any]) -> Any:
        raise NotImplementedError("configure_trial_not_supported")

    def metrics(self) -> Dict[str, Any]:
        return {}

    def domain_services(self) -> Iterable[str]:
        return ()

    def domain_call(self, name: str, args: list[Any]) -> Any:
        raise NotImplementedError(f"domain_service_not_supported:{name}")

    def sensor_manifest(self) -> list[Dict[str, Any]]:
        return []

    def read_sensor(self, sensor_id: str, options: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError(f"sensor_read_not_supported:{sensor_id}")

    def generate_scenarios(self, seed: Any, count: int) -> list[Dict[str, Any]]:
        raise NotImplementedError("generate_scenarios_not_supported")

    def apply_scenario(self, scenario: Dict[str, Any]) -> Any:
        raise NotImplementedError("apply_scenario_not_supported")

    def task_text(self, scenario: Dict[str, Any]) -> Optional[str]:
        return scenario.get("taskText")


@dataclass
class BridgeResponse:
    request_id: Optional[str]
    command: str
    ok: bool
    data: Optional[Dict[str, Any]] = None
    state: Optional[Dict[str, Any]] = None
    descriptor: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

    def as_dict(self) -> Dict[str, Any]:
        value: Dict[str, Any] = {
            "protocol": PROTOCOL,
            "requestId": self.request_id,
            "command": self.command,
            "ok": self.ok,
            "serverTime": time.time(),
        }
        if self.data is not None:
            value["data"] = self.data
        if self.state is not None:
            value["state"] = self.state
        if self.descriptor is not None:
            value["descriptor"] = self.descriptor
        if self.error is not None:
            value["error"] = self.error
        return value


class EnvironmentBridgeRouter:
    def __init__(self, backend: EnvironmentBackend):
        self.backend = backend
        self.backend.connect()

    def close(self) -> None:
        self.backend.close()

    def handle(self, envelope: Dict[str, Any]) -> Dict[str, Any]:
        request_id = envelope.get("requestId")
        command = str(envelope.get("command") or "")
        payload = envelope.get("payload") or {}

        if envelope.get("protocol") != PROTOCOL:
            return BridgeResponse(
                request_id, command, False,
                error=f"protocol_mismatch:{envelope.get('protocol')}",
            ).as_dict()

        try:
            return self._dispatch(request_id, command, payload).as_dict()
        except Exception as exc:
            return BridgeResponse(
                request_id, command, False,
                error=f"{exc.__class__.__name__}:{exc}",
                state=self._safe_state(),
                descriptor=self.backend.describe(),
            ).as_dict()

    def _safe_state(self) -> Optional[Dict[str, Any]]:
        try:
            return self.backend.state()
        except Exception:
            return None

    def _dispatch(self, request_id: Optional[str], command: str, payload: Dict[str, Any]) -> BridgeResponse:
        b = self.backend
        if command == "handshake":
            return BridgeResponse(request_id, command, True, data={"serverProtocol": PROTOCOL}, state=b.state(), descriptor=b.describe())
        if command == "describe":
            return BridgeResponse(request_id, command, True, descriptor=b.describe())
        if command == "observe":
            return BridgeResponse(request_id, command, True, data={"observation": b.observe()}, state=b.state())
        if command == "step":
            result = b.step(payload.get("action") or {})
            return BridgeResponse(request_id, command, True, data={"actionResult": result, "metrics": b.metrics()}, state=b.state())
        if command == "reset":
            b.reset(payload.get("options") or {})
            return BridgeResponse(request_id, command, True, data={"metrics": b.metrics()}, state=b.state())
        if command == "configure_trial":
            b.configure_trial(payload.get("spec") or {})
            return BridgeResponse(request_id, command, True, state=b.state())
        if command == "metrics":
            return BridgeResponse(request_id, command, True, data={"metrics": b.metrics()})
        if command == "domain_call":
            name = str(payload.get("name") or "")
            args = list(payload.get("args") or [])
            value = b.domain_call(name, args)
            return BridgeResponse(request_id, command, True, data={"value": value}, state=b.state())
        if command == "sensor_manifest":
            return BridgeResponse(request_id, command, True, data={"sensors": b.sensor_manifest()})
        if command == "sensor_read":
            sensor_id = str(payload.get("sensorId") or "")
            if not sensor_id:
                raise ValueError("sensor_id_required")
            packet = b.read_sensor(sensor_id, payload.get("options") or {})
            return BridgeResponse(request_id, command, True, data={"packet": packet})
        if command == "generate_scenarios":
            scenarios = b.generate_scenarios(payload.get("seed"), int(payload.get("count") or 1))
            return BridgeResponse(request_id, command, True, data={"scenarios": scenarios})
        if command == "apply_scenario":
            b.apply_scenario(payload.get("scenario") or {})
            return BridgeResponse(request_id, command, True, state=b.state())
        if command == "task_text":
            return BridgeResponse(request_id, command, True, data={"taskText": b.task_text(payload.get("scenario") or {})})
        raise ValueError(f"unknown_command:{command}")
