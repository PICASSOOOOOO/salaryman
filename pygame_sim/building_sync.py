"""Off-thread sync for server-authoritative building object maintenance."""

from __future__ import annotations

import json
import queue
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .automation import DesktopLink
from .pest_work import STAMINA_SUPPLY_ITEMS
from .scene import FLOOR_PLAN, TowerScene

CONSTRUCTION_ROOMS = {f"construction_f{floor:02d}" for floor in range(2, 6)}
BUILDING_ROOMS = {
    "lobby", "recreation", "executive", "public", "office_03", "office_04", "executive_suite",
    *CONSTRUCTION_ROOMS,
}
ROOM_API_NAME = {
    "lobby": "lobby",
    "recreation": "hallway",
    "executive_suite": "executive_suite",
    **{room: "hallway" for room in CONSTRUCTION_ROOMS},
}
PLAYABLE_FLOORS = frozenset(int(floor) for floor in FLOOR_PLAN.get("playableFloors", {}))
CONSTRUCTION_POLL_SECONDS = 5.0


@dataclass(frozen=True)
class BuildingSyncEvent:
    ok: bool
    message: str
    state: dict[str, Any] | None = None
    code: str | None = None
    source: str = "presence"
    destination_floor: int | None = None
    data: dict[str, Any] | None = None


class _HttpJsonError(RuntimeError):
    def __init__(self, code: str, payload: dict[str, Any] | None = None) -> None:
        super().__init__(code)
        self.payload = payload


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
        self._game_requests: queue.Queue[tuple[str, str, str, dict[str, Any] | None]] = queue.Queue()
        self._pending_game_actions: set[str] = set()
        self._restroom_sessions: dict[str, str] = {}
        self._events: queue.Queue[BuildingSyncEvent] = queue.Queue()
        self._active_action: tuple[int, str, str, str, str | None] | None = None
        self._elevator_request: tuple[int, str, int, int, int] | None = None
        self._stairs_request: tuple[int, str, int, int, int, int] | None = None
        self._authorized_destination: int | None = None
        self._construction_plans: list[dict[str, Any]] = []
        self._construction_request: tuple[int, str] | None = None
        self._active_construction: tuple[int, str, str, float] | None = None
        self._last_construction_poll = 0.0
        self._last_construction_error: str | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_error: str | None = None
        self._waiting_for_payment = False

    def queue_game_request(self, action: str, item_id: str | None = None) -> bool:
        """Queue an allow-listed game-service request for the authenticated player."""
        if self.link is None:
            return False
        requests = {
            "inventory": ("GET", "/items/inventory", None),
            "vending_catalog": ("GET", "/items/vending-catalog", None),
            "bank": ("GET", "/desktop-game/bank", None),
            "waste_deliver": ("POST", "/desktop-building/waste/deliver", {}),
            "supply_receive": ("POST", "/desktop-building/supplies/receive", {}),
        }
        if action == "restroom":
            if not isinstance(item_id, str) or len(item_id) > 48:
                return False
            with self._lock:
                session_id = self._restroom_sessions.get(item_id)
            if session_id:
                request = (
                    "POST",
                    "/desktop-building/restroom/complete",
                    {"stallKey": item_id, "sessionId": session_id},
                )
            else:
                request = (
                    "POST",
                    "/desktop-building/restroom/start",
                    {"stallKey": item_id},
                )
        elif action == "waste_pickup":
            if not isinstance(item_id, str) or len(item_id) > 80:
                return False
            request = (
                "POST",
                "/desktop-building/waste/pickup",
                {"binId": item_id},
            )
        elif action == "buy_vending":
            if not isinstance(item_id, str) or not item_id or len(item_id) > 80:
                return False
            request = (
                "POST",
                "/items/buy",
                {"slot": 0, "itemId": item_id, "qty": 1, "source": "tower_vending"},
            )
        elif action == "consume_supply":
            if item_id not in STAMINA_SUPPLY_ITEMS:
                return False
            request = (
                "POST",
                "/items/consume",
                {"slot": 0, "itemId": item_id, "qty": 1},
            )
        else:
            request = requests.get(action)
            if request is None:
                return False
        with self._lock:
            if action in self._pending_game_actions:
                return False
            self._pending_game_actions.add(action)
        self._game_requests.put((action, request[0], request[1], request[2]))
        return True

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
        if nearby is None or nearby.kind not in {"elevator", "service_elevator"}:
            return False
        request = (
            scene.current_floor,
            scene.current_room,
            destination_floor,
            int(scene.player_position[0]),
            int(scene.player_position[1]),
        )
        with self._lock:
            if self._elevator_request is not None or self._stairs_request is not None \
                or self._authorized_destination is not None:
                return False
            self._elevator_request = request
        return True

    def queue_stairs(self, destination_floor: int, stairwell_number: int, scene: TowerScene) -> bool:
        if self.link is None or not scene.is_playable_floor(destination_floor):
            return False
        if abs(destination_floor - scene.current_floor) != 1:
            return False
        nearby = scene.nearby_object
        if nearby is None or nearby.kind != "stairs" or nearby.stairwell_number != stairwell_number:
            return False
        request = (
            scene.current_floor,
            scene.current_room,
            destination_floor,
            stairwell_number,
            int(scene.player_position[0]),
            int(scene.player_position[1]),
        )
        with self._lock:
            if self._elevator_request is not None or self._stairs_request is not None \
                or self._authorized_destination is not None:
                return False
            self._stairs_request = request
        return True

    def queue_construction_work(self, plan_id: int, task_id: str, scene: TowerScene) -> bool:
        if self.link is None or plan_id <= 0 or not task_id or len(task_id) > 64:
            return False
        nearby = scene.nearby_object
        if nearby is None or nearby.kind != "construction_task" \
            or nearby.construction_plan_id != plan_id or nearby.construction_task_id != task_id:
            return False
        with self._lock:
            if self._construction_request is not None or self._active_construction is not None:
                return False
            self._construction_request = (plan_id, task_id)
        return True

    def construction_plans(self) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._construction_plans)

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
        try:
            game_action, game_method, game_path, game_body = self._game_requests.get_nowait()
        except queue.Empty:
            pass
        else:
            try:
                response = self._request_json(game_method, game_path, game_body)
                if game_action == "restroom":
                    stall_key = (game_body or {}).get("stallKey")
                    session_id = response.get("sessionId")
                    if isinstance(stall_key, str):
                        with self._lock:
                            if isinstance(session_id, str):
                                self._restroom_sessions[stall_key] = session_id
                            elif response.get("completed") is True:
                                self._restroom_sessions.pop(stall_key, None)
                message = {
                    "restroom": "RESTROOM / SESSION UPDATED",
                    "waste_pickup": "TRASH PICKED UP / TAKE IT TO B1 SHIPPING",
                    "waste_deliver": "TRASH DELIVERED TO B1",
                    "supply_receive": "SUPPLIES RECEIVED AT B1",
                }.get(game_action, f"GAME SERVICE / {game_action.upper()}")
                self._events.put(BuildingSyncEvent(
                    True,
                    message,
                    source="game_service",
                    data={"action": game_action, "payload": response},
                ))
            except RuntimeError as exc:
                details: dict[str, Any] = {"action": game_action, "error": str(exc)}
                if isinstance(exc, _HttpJsonError) and exc.payload:
                    details["errorPayload"] = exc.payload
                self._events.put(BuildingSyncEvent(
                    False,
                    _friendly_sync_error(str(exc)),
                    code=str(exc),
                    source="game_service",
                    data=details,
                ))
            finally:
                with self._lock:
                    self._pending_game_actions.discard(game_action)
            return
        self._refresh_construction_snapshot()
        self._process_construction_work()
        with self._lock:
            snapshot = self._scene_snapshot
            elevator_request = self._elevator_request
            stairs_request = self._stairs_request
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
            elif stairs_request is not None:
                with self._lock:
                    if self._stairs_request == stairs_request:
                        self._stairs_request = None
                self._events.put(BuildingSyncEvent(
                    False,
                    message,
                    code=code,
                    source="stairs",
                    destination_floor=stairs_request[2],
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

        if stairs_request is not None:
            origin_floor, origin_room, destination_floor, stairwell, stair_x, stair_y = stairs_request
            if floor != origin_floor or scene_room != origin_room:
                with self._lock:
                    if self._stairs_request == stairs_request:
                        self._stairs_request = None
                self._events.put(BuildingSyncEvent(
                    False,
                    "STAIRWELL ORIGIN CHANGED",
                    source="stairs",
                    destination_floor=destination_floor,
                ))
                return
            try:
                self._request_json(
                    "POST",
                    "/desktop-building/stairs",
                    {
                        "destinationFloor": destination_floor,
                        "stairwell": stairwell,
                        "x": stair_x,
                        "y": stair_y,
                    },
                )
            except RuntimeError as exc:
                code = str(exc)
                with self._lock:
                    if self._stairs_request == stairs_request:
                        self._stairs_request = None
                message = _sync_error_message(exc)
                self._events.put(BuildingSyncEvent(
                    False,
                    message,
                    code=code,
                    source="stairs",
                    destination_floor=destination_floor,
                ))
                return
            with self._lock:
                if self._stairs_request == stairs_request:
                    self._stairs_request = None
                self._authorized_destination = destination_floor
            self._events.put(BuildingSyncEvent(
                True,
                f"STAIRS AUTHORIZED / FLOOR {destination_floor:02d}",
                source="stairs",
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

    def _refresh_construction_snapshot(self) -> None:
        now = time.monotonic()
        if now - self._last_construction_poll < CONSTRUCTION_POLL_SECONDS:
            return
        self._last_construction_poll = now
        try:
            payload = self._request_json("GET", "/desktop-building/construction")
            plans = payload.get("plans")
            if not isinstance(plans, list) or any(not isinstance(plan, dict) for plan in plans):
                raise RuntimeError("INVALID_SERVER_RESPONSE")
            with self._lock:
                self._construction_plans = plans
            self._last_construction_error = None
        except RuntimeError as exc:
            message = _sync_error_message(exc)
            if message != self._last_construction_error:
                self._events.put(BuildingSyncEvent(
                    False,
                    message,
                    code=str(exc),
                    source="construction_snapshot",
                ))
            self._last_construction_error = message

    def _process_construction_work(self) -> None:
        with self._lock:
            request = self._construction_request
            active = self._active_construction
        if request is not None:
            plan_id, task_id = request
            try:
                result = self._request_json(
                    "POST",
                    "/desktop-building/construction/work/start",
                    {"planId": plan_id, "taskId": task_id},
                )
                session_id = result.get("sessionId")
                duration_ms = result.get("durationMs")
                if not isinstance(session_id, str) or not isinstance(duration_ms, int):
                    raise RuntimeError("INVALID_SERVER_RESPONSE")
                with self._lock:
                    if self._construction_request == request:
                        self._construction_request = None
                    self._active_construction = (
                        plan_id,
                        task_id,
                        session_id,
                        time.monotonic() + max(0, duration_ms) / 1_000.0 + 0.25,
                    )
                    self._last_construction_poll = 0.0
                self._events.put(BuildingSyncEvent(
                    True,
                    f"CONSTRUCTION WORK STARTED / {str(result.get('label', 'TASK')).upper()}",
                    source="construction",
                    data=result,
                ))
            except RuntimeError as exc:
                message = _sync_error_message(exc)
                if message != "BUILDING SERVER OFFLINE":
                    with self._lock:
                        if self._construction_request == request:
                            self._construction_request = None
                    self._events.put(BuildingSyncEvent(
                        False,
                        message,
                        code=str(exc),
                        source="construction",
                        data=exc.payload if isinstance(exc, _HttpJsonError) else None,
                    ))
                return
            return

        if active is None or time.monotonic() < active[3]:
            return
        plan_id, task_id, session_id, _due_at = active
        try:
            result = self._request_json(
                "POST",
                "/desktop-building/construction/work/complete",
                {"planId": plan_id, "taskId": task_id, "sessionId": session_id},
            )
            with self._lock:
                if self._active_construction == active:
                    self._active_construction = None
                self._last_construction_poll = 0.0
            self._events.put(BuildingSyncEvent(
                True,
                f"CONSTRUCTION COMPLETE / ƒ{int(result.get('rewardFiat', 0) or 0):,}",
                source="construction",
                data=result,
            ))
        except RuntimeError as exc:
            if str(exc) == "NETWORK_UNAVAILABLE":
                with self._lock:
                    if self._active_construction == active:
                        self._active_construction = (plan_id, task_id, session_id, time.monotonic() + self.interval_seconds)
                return
            message = _sync_error_message(exc)
            if isinstance(exc, _HttpJsonError) and exc.payload \
                and "full work session" in str(exc.payload.get("error", "")).lower():
                with self._lock:
                    if self._active_construction == active:
                        self._active_construction = (plan_id, task_id, session_id, time.monotonic() + 0.75)
                return
            with self._lock:
                if self._active_construction == active:
                    self._active_construction = None
            self._events.put(BuildingSyncEvent(
                False,
                message,
                code=str(exc),
                source="construction",
                data=exc.payload if isinstance(exc, _HttpJsonError) else None,
            ))


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
            try:
                error_payload = json.loads(exc.read().decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                error_payload = None
            raise _HttpJsonError(
                f"HTTP_{exc.code}",
                error_payload if isinstance(error_payload, dict) else None,
            ) from None
        except (URLError, TimeoutError, OSError):
            raise RuntimeError("NETWORK_UNAVAILABLE") from None
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise RuntimeError("INVALID_SERVER_RESPONSE") from None
        if not isinstance(payload, dict):
            raise RuntimeError("INVALID_SERVER_RESPONSE")
        return payload


def _sync_error_message(error: RuntimeError) -> str:
    if isinstance(error, _HttpJsonError) and error.payload:
        message = error.payload.get("error")
        if isinstance(message, str) and message.strip():
            return message.strip().upper()
    return _friendly_sync_error(str(error))


def _friendly_sync_error(code: str) -> str:
    if code == "NETWORK_UNAVAILABLE":
        return "BUILDING SERVER OFFLINE"
    if code == "HTTP_401":
        return "DESKTOP LINK EXPIRED"
    if code == "HTTP_403":
        return "OFFICE ACCESS DENIED"
    if code == "HTTP_404":
        return "OBJECT NOT MAINTAINABLE HERE"
    if code == "HTTP_402":
        return "INSUFFICIENT FIAT"
    if code == "HTTP_409":
        return "PRESENCE INVALID / MOVE CLOSER OR RE-ENTER ROOM"
    return "BUILDING SYNC FAILED"
