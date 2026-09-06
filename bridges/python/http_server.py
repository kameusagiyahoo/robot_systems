from __future__ import annotations

import os
from typing import Iterable

from .environment_bridge_core import EnvironmentBackend, EnvironmentBridgeRouter


def create_app(backend: EnvironmentBackend, allowed_origins: Iterable[str] | None = None):
    try:
        from fastapi import FastAPI, Request
        from fastapi.middleware.cors import CORSMiddleware
    except ImportError as exc:
        raise RuntimeError("fastapi_not_installed: pip install fastapi uvicorn") from exc

    app = FastAPI(title="robot_systems Environment Bridge", version="1")
    origins = list(allowed_origins or [])
    if not origins:
        raw = os.environ.get("ROBOT_SYSTEMS_ALLOWED_ORIGINS", "")
        origins = [x.strip() for x in raw.split(",") if x.strip()]

    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=False,
            allow_methods=["POST", "GET"],
            allow_headers=["content-type"],
        )

    router = EnvironmentBridgeRouter(backend)

    @app.get("/health")
    async def health():
        return {"ok": True, "environment": backend.describe()}

    @app.post("/environment")
    async def environment(request: Request):
        envelope = await request.json()
        return router.handle(envelope)

    @app.on_event("shutdown")
    def shutdown_event():
        router.close()

    return app
