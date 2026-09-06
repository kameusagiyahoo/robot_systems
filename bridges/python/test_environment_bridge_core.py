from __future__ import annotations

import unittest

from .environment_bridge_core import EnvironmentBridgeRouter, PROTOCOL, SENSOR_PACKET_SCHEMA
from .mock_backend import MockEnvironmentBackend
from .perception_inference import PerceptionEnabledBackend, PerceptionInferenceProvider


class FakePerceptionProvider(PerceptionInferenceProvider):
    provider_id = "fake_perception"
    label = "Fake Perception"

    def infer(self, request, environment):
        sensor = environment.read_sensor("rgb", {"metadataOnly": True})
        return {"detected": True, "confidence": 0.9, "detectorId": "fake-v1", "sensorId": sensor["sensorId"], "target": request.get("target")}


class EnvironmentBridgeCoreTest(unittest.TestCase):
    def setUp(self):
        self.backend = MockEnvironmentBackend()
        self.router = EnvironmentBridgeRouter(self.backend)

    def tearDown(self):
        self.router.close()

    def request(self, command, payload=None):
        return self.router.handle({"protocol": PROTOCOL, "requestId": f"test-{command}", "command": command, "payload": payload or {}})

    def test_handshake(self):
        result = self.request("handshake")
        self.assertTrue(result["ok"])
        self.assertEqual(result["protocol"], PROTOCOL)
        self.assertEqual(result["descriptor"]["id"], "mock_bridge_environment")
        self.assertIn("robot", result["state"])
        self.assertTrue(result["descriptor"]["capabilities"]["sensorRead"])

    def test_drive_step_updates_state_and_metrics(self):
        before = self.backend.state()["robot"]["x"]
        result = self.request("step", {"action": {"type": "drive", "speed": 1.0, "steeringAngle": 0.0, "dt": 0.1}})
        self.assertTrue(result["ok"])
        self.assertGreater(result["state"]["robot"]["x"], before)
        self.assertEqual(result["data"]["metrics"]["controlTicks"], 1)

    def test_configure_trial(self):
        result = self.request("configure_trial", {"spec": {"robot": {"x": 3.0, "y": 4.0, "yaw": 90.0}}})
        self.assertTrue(result["ok"])
        self.assertEqual(result["state"]["robot"]["x"], 3.0)
        self.assertEqual(result["state"]["robot"]["yaw"], 90.0)

    def test_domain_manipulation(self):
        self.backend.configure_trial({"robot": {"aligned": True}})
        result = self.request("domain_call", {"name": "manipulation.insertForks", "args": ["pallet_A"]})
        self.assertTrue(result["ok"])
        self.assertEqual(result["state"]["robot"]["carrying"], "pallet_A")

    def test_sensor_manifest_and_read(self):
        manifest = self.request("sensor_manifest")
        self.assertTrue(manifest["ok"])
        self.assertEqual(manifest["data"]["sensors"][0]["sensorId"], "rgb")
        packet = self.request("sensor_read", {"sensorId": "rgb", "options": {"metadataOnly": False}})
        self.assertTrue(packet["ok"])
        self.assertEqual(packet["data"]["packet"]["schema"], SENSOR_PACKET_SCHEMA)
        self.assertEqual(packet["data"]["packet"]["type"], "rgb")

    def test_perception_decorator_exposes_semantic_detector(self):
        wrapped = PerceptionEnabledBackend(MockEnvironmentBackend(), FakePerceptionProvider())
        router = EnvironmentBridgeRouter(wrapped)
        try:
            result = router.handle({"protocol": PROTOCOL, "requestId": "perception", "command": "domain_call", "payload": {"name": "perception.detectPallet", "args": [{"palletId": "pallet_A", "target": {"id": "pallet_A", "label": "Pallet A"}}]}})
            self.assertTrue(result["ok"])
            self.assertTrue(result["data"]["value"]["detected"])
            self.assertEqual(result["data"]["value"]["detectorId"], "fake-v1")
            self.assertIn("perception.detectPallet", result["descriptor"]["capabilities"]["domainServices"] if "descriptor" in result else wrapped.describe()["capabilities"]["domainServices"])
        finally:
            router.close()

    def test_protocol_mismatch_is_structured_error(self):
        result = self.router.handle({"protocol": "wrong", "requestId": "x", "command": "observe", "payload": {}})
        self.assertFalse(result["ok"])
        self.assertIn("protocol_mismatch", result["error"])


if __name__ == "__main__":
    unittest.main()
