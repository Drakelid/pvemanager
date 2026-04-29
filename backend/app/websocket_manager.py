"""
WebSocket Connection Manager for real-time task updates and metrics push.
Maintains per-user WebSocket connections, broadcasts task events,
and supports channel-based subscriptions for metrics streaming.
"""
import asyncio
import json
from typing import Dict, List, Set

from fastapi import WebSocket
from loguru import logger


class ConnectionManager:
    """Manages WebSocket connections grouped by user_id and by channel."""

    def __init__(self):
        # user_id -> set of active WebSocket connections
        self._connections: Dict[int, Set[WebSocket]] = {}
        # channel_name -> set of subscribed WebSocket connections
        self._channel_subscribers: Dict[str, Set[WebSocket]] = {}

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
        self.unsubscribe_all(websocket)
        logger.debug(f"[WS TASKS] User {user_id} disconnected")

    # ── Channel subscription helpers ──────────────────────────────────

    def subscribe(self, websocket: WebSocket, channel: str) -> None:
        """Subscribe a WebSocket connection to a named channel."""
        if channel not in self._channel_subscribers:
            self._channel_subscribers[channel] = set()
        self._channel_subscribers[channel].add(websocket)
        logger.debug(f"[WS] Subscribed to channel '{channel}'")

    def unsubscribe(self, websocket: WebSocket, channel: str) -> None:
        """Unsubscribe a WebSocket connection from a named channel."""
        if channel in self._channel_subscribers:
            self._channel_subscribers[channel].discard(websocket)
            if not self._channel_subscribers[channel]:
                del self._channel_subscribers[channel]
        logger.debug(f"[WS] Unsubscribed from channel '{channel}'")

    def unsubscribe_all(self, websocket: WebSocket) -> None:
        """Remove a WebSocket from every channel it is subscribed to."""
        for channel in list(self._channel_subscribers):
            self._channel_subscribers[channel].discard(websocket)
            if not self._channel_subscribers[channel]:
                del self._channel_subscribers[channel]

    def has_channel_subscribers(self, channel: str) -> bool:
        """Return True if at least one connection is subscribed to *channel*."""
        return bool(self._channel_subscribers.get(channel))

    def get_channels_matching(self, prefix: str) -> List[str]:
        """Return all channel names that start with *prefix*."""
        return [ch for ch in list(self._channel_subscribers) if ch.startswith(prefix)]

    async def broadcast_to_channel(self, channel: str, data: dict) -> None:
        """Send JSON data to all connections subscribed to *channel*."""
        connections = self._channel_subscribers.get(channel)
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
            self._channel_subscribers[channel].discard(ws)
        if not self._channel_subscribers.get(channel):
            self._channel_subscribers.pop(channel, None)

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


# Stores the main asyncio event loop set at application startup.
# Background threads (APScheduler) use this to schedule coroutines safely.
_main_loop: asyncio.AbstractEventLoop | None = None


def set_main_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Call this once at application startup to register the running event loop."""
    global _main_loop
    _main_loop = loop


def run_async_safe(coro) -> None:
    """
    Schedule an async coroutine from a synchronous background thread.
    Used by APScheduler jobs to push WS updates without blocking.
    """
    global _main_loop
    try:
        # Prefer the stored main loop (set at startup) for cross-thread scheduling
        if _main_loop is not None and _main_loop.is_running():
            asyncio.run_coroutine_threadsafe(coro, _main_loop)
            return
        # Fallback: try to get/run the current thread's loop
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
