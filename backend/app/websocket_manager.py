"""
WebSocket Connection Manager for real-time task updates.
Maintains per-user WebSocket connections and broadcasts task events.
"""
import asyncio
import json
from typing import Dict, Set

from fastapi import WebSocket
from loguru import logger


class ConnectionManager:
    """Manages WebSocket connections grouped by user_id."""

    def __init__(self):
        # user_id -> set of active WebSocket connections
        self._connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int) -> None:
        await websocket.accept()
        if user_id not in self._connections:
            self._connections[user_id] = set()
        self._connections[user_id].add(websocket)
        logger.debug(f"[WS TASKS] User {user_id} connected ({len(self._connections[user_id])} socket(s))")

    def disconnect(self, websocket: WebSocket, user_id: int) -> None:
        if user_id in self._connections:
            self._connections[user_id].discard(websocket)
            if not self._connections[user_id]:
                del self._connections[user_id]
        logger.debug(f"[WS TASKS] User {user_id} disconnected")

    @property
    def active_user_count(self) -> int:
        return len(self._connections)

    async def send_to_user(self, user_id: int, data: dict) -> None:
        """Send a JSON message to all WebSocket connections of a specific user."""
        connections = self._connections.get(user_id)
        if not connections:
            return
        message = json.dumps(data, default=str)
        dead: Set[WebSocket] = set()
        for ws in list(connections):
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._connections[user_id].discard(ws)
        if not self._connections.get(user_id):
            self._connections.pop(user_id, None)

    async def broadcast(self, data: dict) -> None:
        """Send a JSON message to all connected users."""
        message = json.dumps(data, default=str)
        dead_pairs = []
        for user_id, connections in list(self._connections.items()):
            for ws in list(connections):
                try:
                    await ws.send_text(message)
                except Exception:
                    dead_pairs.append((user_id, ws))
        for user_id, ws in dead_pairs:
            if user_id in self._connections:
                self._connections[user_id].discard(ws)


# ──────────────────────────────────────────────
# Module-level singleton used across the app
# ──────────────────────────────────────────────
ws_manager = ConnectionManager()


def run_async_safe(coro) -> None:
    """
    Schedule an async coroutine from a synchronous background thread.
    Used by APScheduler jobs to push WS updates without blocking.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(coro, loop)
        else:
            loop.run_until_complete(coro)
    except RuntimeError:
        # No event loop yet (e.g. during startup); silently skip
        pass


def broadcast_task_update(user_id: int, event_type: str, task_data: dict) -> None:
    """
    Fire-and-forget WebSocket broadcast from a sync context (e.g. APScheduler).

    Wraps `ws_manager.send_to_user` and schedules it on the running asyncio loop.
    """
    payload = {"type": event_type, "task": task_data}
    run_async_safe(ws_manager.send_to_user(user_id, payload))
