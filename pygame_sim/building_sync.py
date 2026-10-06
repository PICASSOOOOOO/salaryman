"""Off-thread sync for server-authoritative building object maintenance."""

from __future__ import annotations

import json
import queue
import threading
from dataclasses import dataclass
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .automation import DesktopLink
from .scene import FLOOR_PLAN, TowerScene

BUILDING_ROOMS = {"lobby", "recreation", "executive", "public", "office_03", "office_04", "executive_suite"}
ROOM_API_NAME = {"lobby": "lobby", "recreation": "hallway", "executive_suite": "executive_suite"}
PLAYABLE_FLOORS = frozenset(int(floor) for floor in FLOOR_PLAN.get("playableFloors", {}))


@dataclass(frozen=True)
class BuildingSyncEvent:
    ok: bool
    message: str
    state: dict[str, Any] | None = None
    code: str | None = None
    source: str = "presence"
    destination_floor: int | None = None


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
        self._actions: queue.Queue[tuple[int, str, str, str]] = queue.Queue()
        self._events: queue.Queue[BuildingSyncEvent] = queue.Queue()
        self._active_action: tuple[int, str, str, str, str | None] | None = None
        self._elevator_request: tuple[int, str, int, int, int] | None = None
        self._authorized_destination: int | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_error: str | None = None
        self._waiting_for_payment = False

    def start(self) -> None:
        if self.link is None or self._thread is not None:
            return
        self._thread = threading.Thread(target=self._run, name="desktop-building-sync", daemon=True)
        self._thread.start()

    def update_scene(self, scene: TowerScene) -> None:
        if not scene.is_playable_floor(scene.current_floor) or scene.current_room not in BUILDING_ROOMS:
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
            if self._authorized_destination == scene.current_floor:
                self._authorized_destination = None

    def queue_action(self, object_id: str, action: str) -> bool:
        if self.link is None or action not in {"clean", "repair"} or not object_id:
            return False
        if self._active_action is not None or not self._actions.empty():
            return False
        with self._lock:
            snapshot = self._scene_snapshot
        if snapshot is None or snapshot[0] not in PLAYABLE_FLOORS or snapshot[1] not in BUILDING_ROOMS:
            return False
        self._actions.put((snapshot[0], snapshot[1], object_id, action))
        return True

    def queue_elevator(self, destination_floor: int, scene: TowerScene) -> bool:
        if self.link is None or not scene.is_playable_floor(destination_floor):
            return False
        if destination_floor == scene.current_floor:
            return False
        nearby = scene.nearby_object
        if nearby is None or nearby.kind != "elevator":
            return False
        request = (
            scene.current_floor,
            scene.current_room,
            destination_floor,
            int(scene.player_position[0]),
            int(scene.player_position[1]),
        )
        with self._lock:
            if self._elevator_request is not None or self._authorized_destination is not None:
                return False
            self._elevator_request = request
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
            elevator_request = self._elevator_request
            authorized_destination = self._authorized_destination
        if snapshot is None or snapshot[0] not in PLAYABLE_FLOORS or snapshot[1] not in BUILDING_ROOMS:
            return
        if authorized_destination is not None and snapshot[0] != authorized_destination:
            return
        floor, scene_room, x, y, action = snapshot
        if floor < 1 or floor > 67:
            return
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
            payload = self._request_json("GET", "/desktop-building/objects")
            states = payload.get("objects", [])
            if not isinstance(states, list):
                raise RuntimeError("INVALID_SERVER_RESPONSE")
            normalized = {
                f"{state['floorNumber']}:{state['objectId']}": state
                for state in states
                if isinstance(state, dict)
                and isinstance(state.get("objectId"), str)
                and isinstance(state.get("floorNumber"), int)
                and isinstance(state.get("cleanliness"), int)
                and isinstance(state.get("condition"), int)
            }
            with self._lock:
                self._object_states.update(normalized)
            self._last_error = None
        except RuntimeError as exc:
            code = str(exc)
            message = _friendly_sync_error(code)
            if elevator_request is not None:
                with self._lock:
                    if self._elevator_request == elevator_request:
                        self._elevator_request = None
                self._events.put(BuildingSyncEvent(
                    False,
                    message,
                    code=code,
                    source="elevator",
                    destination_floor=elevator_request[2],
                ))
            elif message != self._last_error:
                self._events.put(BuildingSyncEvent(False, message, code=code, source="presence"))
                self._last_error = message
            if message != "BUILDING SERVER OFFLINE":
                self._discard_one_pending_action(message)
            return

        if elevator_request is not None:
            origin_floor, origin_room, destination_floor, elevator_x, elevator_y = elevator_request
            if floor != origin_floor or scene_room != origin_room:
                with self._lock:
                    if self._elevator_request == elevator_request:
                        self._elevator_request = None
                self._events.put(BuildingSyncEvent(
                    False,
                    "ELEVATOR ORIGIN CHANGED",
                    source="elevator",
                    destination_floor=destination_floor,
                ))
                return
            try:
                self._request_json(
                    "POST",
                    "/desktop-building/presence",
                    {
                        "room": "elevator",
                        "floorNumber": origin_floor,
                        "x": elevator_x,
                        "y": elevator_y,
                        "action": "ride",
                        "destinationFloor": destination_floor,
                    },
                )
            except RuntimeError as exc:
                code = str(exc)
                with self._lock:
                    if self._elevator_request == elevator_request:
                        self._elevator_request = None
                self._events.put(BuildingSyncEvent(
                    False,
                    _friendly_sync_error(code),
                    code=code,
                    source="elevator",
                    destination_floor=destination_floor,
                ))
                return
            with self._lock:
                if self._elevator_request == elevator_request:
                    self._elevator_request = None
                self._authorized_destination = destination_floor
            self._events.put(BuildingSyncEvent(
                True,
                f"ELEVATOR AUTHORIZED / FLOOR {destination_floor:02d}",
                source="elevator",
                destination_floor=destination_floor,
            ))
            return

        if self._active_action is None:
            try:
                queued = self._actions.get_nowait()
            except queue.Empty:
                return
            action_floor, action_room, object_id, maintenance_action = queued
            session_id = None
        else:
            action_floor, action_room, object_id, maintenance_action, session_id = self._active_action

        if action_floor != floor or action_room != scene_room:
            if session_id is None:
                self._events.put(BuildingSyncEvent(False, "PLAYER CHANGED FLOORS / ACTION CANCELLED", source="action"))
                return
        try:
            body: dict[str, Any] = {"objectId": object_id, "action": maintenance_action}
            if session_id is not None:
                body["sessionId"] = session_id
            result = self._request_json(
                "POST",
                "/desktop-building/objects/action",
                body,
            )
            state = result.get("state")
            if not isinstance(state, dict) or not isinstance(state.get("objectId"), str):
                raise RuntimeError("INVALID_SERVER_RESPONSE")
            floor_number = state.get("floorNumber")
            if not isinstance(floor_number, int):
                raise RuntimeError("INVALID_SERVER_RESPONSE")
            with self._lock:
                self._object_states[f"{floor_number}:{state['objectId']}"] = state
            if result.get("working") is True:
                next_session = result.get("sessionId")
                if not isinstance(next_session, str):
                    raise RuntimeError("INVALID_SERVER_RESPONSE")
                self._active_action = (action_floor, action_room, object_id, maintenance_action, next_session)
                waiting_for_payment = result.get("waitingForPayment") is True
                should_announce = session_id is None or (waiting_for_payment and not self._waiting_for_payment)
                self._waiting_for_payment = waiting_for_payment
                if should_announce:
                    self._events.put(BuildingSyncEvent(True, str(result.get("message", "WORK IN PROGRESS")), state, source="action"))
            else:
                self._active_action = None
                self._waiting_for_payment = False
                self._events.put(BuildingSyncEvent(True, str(result.get("message", "Maintenance complete")), state, source="action"))
        except RuntimeError as exc:
            message = _friendly_sync_error(str(exc))
            self._events.put(BuildingSyncEvent(False, message, source="action"))
            self._waiting_for_payment = False
            if message == "BUILDING SERVER OFFLINE":
                if session_id is None:
                    self._actions.put((action_floor, action_room, object_id, maintenance_action))
            else:
                self._active_action = None

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
