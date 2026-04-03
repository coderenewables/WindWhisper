"""WebSocket hub for streaming AI responses."""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketHub:
    """Manages active WebSocket connections per project."""

    def __init__(self):
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def connect(self, project_id: str, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self._connections[project_id].append(ws)
        logger.info("WS connected for project %s (%d total)", project_id, len(self._connections[project_id]))

    async def disconnect(self, project_id: str, ws: WebSocket):
        async with self._lock:
            conns = self._connections[project_id]
            if ws in conns:
                conns.remove(ws)
            if not conns:
                del self._connections[project_id]

    async def broadcast(self, project_id: str, event: str, data: Any):
        msg = json.dumps({"event": event, "data": data}, default=str)
        async with self._lock:
            conns = list(self._connections.get(project_id, []))
        dead: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(project_id, ws)

    async def send_to(self, ws: WebSocket, event: str, data: Any):
        msg = json.dumps({"event": event, "data": data}, default=str)
        try:
            await ws.send_text(msg)
        except Exception:
            pass


ws_hub = WebSocketHub()
