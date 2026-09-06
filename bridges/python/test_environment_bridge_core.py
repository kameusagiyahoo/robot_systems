from __future__ import annotations

import unittest

from .environment_bridge_core import EnvironmentBridgeRouter, PROTOCOL
from .mock_backend import MockEnvironmentBackend


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

    def test_protocol_mismatch_is_structured_error(self):
        result = self.router.handle({"protocol": "wrong", "requestId": "x", "command": "observe", "payload": {}})
        self.assertFalse(result["ok"])
        self.assertIn("protocol_mismatch", result["error"])


if __name__ == "__main__":
    unittest.main()
