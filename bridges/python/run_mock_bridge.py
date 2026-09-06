from __future__ import annotations

import os

from .http_server import create_app
from .mock_backend import MockEnvironmentBackend

backend = MockEnvironmentBackend()
app = create_app(backend)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=os.environ.get("ROBOT_SYSTEMS_BIND", "127.0.0.1"), port=int(os.environ.get("ROBOT_SYSTEMS_PORT", "8765")))
