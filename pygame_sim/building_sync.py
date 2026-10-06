"""Off-thread sync for server-authoritative Floor 1 object maintenance."""

from __future__ import annotations

import json
import queue
import threading
from dataclasses import dataclass
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .automation import DesktopLink
from .scene import TowerScene

FLOOR_ONE_ROOMS = {"lobby", "recreation", "executive", "public", "office_03", "office_04"}
ROOM_API_NAME = {"lobby": "lobby", "recreation": "hallway"}


@dataclass(frozen=True)
class BuildingSyncEvent:
    ok: bool
    message: str
    state: dict[str, Any] | None = None


class DesktopBuildingSync:
    """Send validated presence and maintenance requests without blocking Pygame."""

    def __init__(
        self,
        link: DesktopLink | None,
        *,
        opener: Callable[..., Any] = urlopen,
        timeout_seconds: float = 2.5,
        interval_seconds: float = 1.0,
    ) -> None:
        self.link = link
        self.opener = opener
        self.timeout_seconds = timeout_seconds
        self.interval_seconds = interval_seconds
        self._lock = threading.Lock()
        self._scene_snapshot: tuple[int, str, int, int, str] | None = None
        self._object_states: dict[str, dict[str, Any]] = {}
        self._actions: queue.Queue[tuple[str, str]] = queue.Queue()
        self._events: queue.Queue[BuildingSyncEvent] = queue.Queue()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_error: str | None = None

    def start(self) -> None:
        if self.link is None or self._thread is not None:
            return
        self._thread = threading.Thread(target=self._run, name="desktop-building-sync", daemon=True)
        self._thread.start()

    def update_scene(self, scene: TowerScene) -> None:
        if scene.current_floor < 1 or scene.current_floor > 67 or scene.current_room not in FLOOR_ONE_ROOMS:
            snapshot = (scene.current_floor, scene.current_room, 0, 0, "stand")
        else:
            moving = abs(scene.velocity[0]) + abs(scene.velocity[1]) > 2.0
            snapshot = (
                scene.current_floor,
                scene.current_room,
                int(scene.player_position[0]),
                int(scene.player_position[1]),
                "walk" if moving else "stand",
            )
        with self._lock:
            self._scene_snapshot = snapshot

    def queue_action(self, object_id: str, action: str) -> bool:
        if self.link is None or action not in {"clean", "repair"} or not object_id:
            return False
        with self._lock:
            snapshot = self._scene_snapshot
        if snapshot is None or not 1 <= snapshot[0] <= 67 or snapshot[1] not in FLOOR_ONE_ROOMS:
            return False
        self._actions.put((object_id, action))
        return True

    def object_states(self) -> dict[str, dict[str, Any]]:
        with self._lock:
            return {key: dict(value) for key, value in self._object_states.items()}

    def drain_events(self) -> list[BuildingSyncEvent]:
        events: list[BuildingSyncEvent] = []
        while True:
            try:
                events.append(self._events.get_nowait())
            except queue.Empty:
                return events

    def close(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=self.timeout_seconds + 0.5)
            self._thread = None

    def _run(self) -> None:
        while not self._stop.is_set():
            self._sync_once()
            self._stop.wait(self.interval_seconds)

    def _sync_once(self) -> None:
        if self.link is None:
            return
        with self._lock:
            snapshot = self._scene_snapshot
        if snapshot is None or snapshot[0] != 1 or snapshot[1] not in FLOOR_ONE_ROOMS:
            return
        floor, scene_room, x, y, action = snapshot
        api_room = ROOM_API_NAME.get(scene_room, "office")
        try:
            self._request_json(
                "POST",
                "/desktop-building/presence",
                {
                    "room": api_room,
                    "floorNumber": floor,
                    "x": x,
                    "y": y,
                    "action": action,
                },
            )
            if floor != 1:
                return
            payload = self._request_json("GET", "/desktop-building/objects")
            states = payload.get("objects", [])
            if not isinstance(states, list):
                raise RuntimeError("INVALID_SERVER_RESPONSE")
            normalized = {
                state["objectId"]: state
                for state in states
                if isinstance(state, dict)
                and isinstance(state.get("objectId"), str)
                and isinstance(state.get("cleanliness"), int)
                and isinstance(state.get("condition"), int)
            }
            with self._lock:
                self._object_states.update(normalized)
            self._last_error = None
        except RuntimeError as exc:
            message = _friendly_sync_error(str(exc))
            if message != self._last_error:
                self._events.put(BuildingSyncEvent(False, message))
                self._last_error = message
            if message != "BUILDING SERVER OFFLINE":
                self._discard_one_pending_action(message)
            return

        try:
            object_id, maintenance_action = self._actions.get_nowait()
        except queue.Empty:
            return
        try:
            result = self._request_json(
                "POST",
                "/desktop-building/objects/action",
                {"objectId": object_id, "action": maintenance_action},
            )
            state = result.get("state")
            if not isinstance(state, dict) or not isinstance(state.get("objectId"), str):
                raise RuntimeError("INVALID_SERVER_RESPONSE")
            with self._lock:
                self._object_states[state["objectId"]] = state
            self._events.put(BuildingSyncEvent(True, str(result.get("message", "Maintenance complete")), state))
        except RuntimeError as exc:
            message = _friendly_sync_error(str(exc))
            self._events.put(BuildingSyncEvent(False, message))

    def _discard_one_pending_action(self, message: str) -> None:
        try:
            self._actions.get_nowait()
        except queue.Empty:
            return
        self._events.put(BuildingSyncEvent(False, message))

    def _request_json(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        assert self.link is not None
        data = json.dumps(body).encode("utf-8") if body is not None else None
        request = Request(
            f"{self.link.server_url}/api{path}",
            data=data,
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {self.link.credential}",
                "Content-Type": "application/json",
                "X-Salaryman-Device-Id": self.link.device_id,
            },
            method=method,
        )
        try:
            with self.opener(request, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            raise RuntimeError(f"HTTP_{exc.code}") from None
        except (URLError, TimeoutError, OSError):
            raise RuntimeError("NETWORK_UNAVAILABLE") from None
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise RuntimeError("INVALID_SERVER_RESPONSE") from None
        if not isinstance(payload, dict):
            raise RuntimeError("INVALID_SERVER_RESPONSE")
        return payload


def _friendly_sync_error(code: str) -> str:
    if code == "NETWORK_UNAVAILABLE":
        return "BUILDING SERVER OFFLINE"
    if code == "HTTP_401":
        return "DESKTOP LINK EXPIRED"
    if code == "HTTP_403":
        return "OFFICE ACCESS DENIED"
    if code == "HTTP_404":
        return "OBJECT NOT MAINTAINABLE HERE"
    if code == "HTTP_409":
        return "PRESENCE INVALID / MOVE CLOSER OR RE-ENTER ROOM"
    return "BUILDING SYNC FAILED"
