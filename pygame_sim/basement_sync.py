"""Off-thread bridge to server-authoritative basement survival routes."""

from __future__ import annotations

import json
import queue
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

from .automation import DesktopLink
from .scene import TowerScene


BASEMENT_PATH = "/desktop-building/basement"
BASEMENT_SERVICE_ELEVATOR_POSITION = (5_000, 4_000)
BASEMENT_BACK_ENTRANCE_POSITION = (20_000, 7_000)
WORK_TARGETS = frozenset({"power", "plumbing", "upkeep"})
MELEE_MOVES = frozenset({
    "stomp_kick", "punch", "side_kick", "roundhouse_kick", "elbow",
    "biting", "headbutting", "dirty_fighting", "stabbing",
})


@dataclass(frozen=True)
class BasementSyncEvent:
    ok: bool
    message: str
    source: str
    data: dict[str, Any] | None = None
    code: str | None = None


class _BasementHttpError(RuntimeError):
    def __init__(self, code: str, message: str, payload: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.payload = payload


class DesktopBasementSync:
    """Sync local position, snapshots, and actions without blocking a game frame."""

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
        self._scene_state: tuple[int, int, int, str] | None = None
        self._snapshot: dict[str, Any] | None = None
        self._actions: queue.Queue[tuple[str, str, dict[str, Any] | None]] = queue.Queue()
        self._events: queue.Queue[BasementSyncEvent] = queue.Queue()
        self._pending_work: tuple[str, str, float] | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_error: str | None = None

    def start(self) -> None:
        if self.link is None or self._thread is not None:
            return
        self._thread = threading.Thread(target=self._run, name="desktop-basement-sync", daemon=True)
        self._thread.start()

    def update_scene(self, scene: TowerScene) -> None:
        with self._lock:
            if not scene.is_basement:
                self._scene_state = None
                return
            moving = abs(scene.velocity[0]) + abs(scene.velocity[1]) > 2.0
            action = "maintenance" if scene.player_action == "maintenance" else (
                "walk" if moving else "stand"
            )
            self._scene_state = (
                int(scene.basement_level or 1),
                int(scene.player_position[0]),
                int(scene.player_position[1]),
                action,
            )

    def queue_enter(self, scene: TowerScene) -> bool:
        nearby = scene.nearby_object
        using_service_elevator = nearby is not None and nearby.kind == "service_elevator"
        using_stairs = nearby is not None and nearby.kind == "stairs" and (
            nearby.id == "lobby-stairs" or nearby.id.startswith("lobby-stairwell-")
        )
        using_back_entrance = nearby is not None and nearby.id == "lobby-back-entrance"
        if (
            self.link is None
            or scene.is_basement
            or scene.current_room != "lobby"
            or nearby is None
            or not (using_service_elevator or using_stairs or using_back_entrance)
        ):
            return False
        x, y = (
            BASEMENT_SERVICE_ELEVATOR_POSITION
            if using_service_elevator
            else BASEMENT_BACK_ENTRANCE_POSITION
            if using_back_entrance
            else (5_000, 5_000)
        )
        return self._queue(
            "basement_enter",
            f"{BASEMENT_PATH}/presence",
            {"level": 1, "x": x, "y": y, "action": "stand"},
        )

    def queue_level(self, level: int, scene: TowerScene) -> bool:
        nearby = scene.nearby_object
        if (
            self.link is None
            or not scene.is_basement
            or not 1 <= level <= 6
            or nearby is None
            or nearby.kind not in {"basement_stairs", "service_elevator"}
        ):
            return False
        x, y = (
            BASEMENT_SERVICE_ELEVATOR_POSITION
            if nearby.kind == "service_elevator"
            else (int(scene.player_position[0]), int(scene.player_position[1]))
        )
        return self._queue(
            "basement_level",
            f"{BASEMENT_PATH}/presence",
            {
                "level": level,
                "x": x,
                "y": y,
                "action": "stand",
            },
        )

    def queue_exit(self, scene: TowerScene) -> bool:
        nearby = scene.nearby_object
        if (
            self.link is None
            or not scene.is_basement
            or scene.basement_level != 1
            or nearby is None
            or not (
                nearby.id == "basement-stairs-up-b1"
                or nearby.id == "basement-b1-back-entrance"
                or nearby.kind == "service_elevator"
            )
        ):
            return False
        return self._queue("basement_exit", f"{BASEMENT_PATH}/exit", None)

    def queue_attack(self, pest_id: str, move_id: str) -> bool:
        if (
            self.link is None
            or not isinstance(pest_id, str)
            or not 1 <= len(pest_id) <= 64
            or move_id not in MELEE_MOVES
        ):
            return False
        return self._queue(
            "basement_attack",
            f"{BASEMENT_PATH}/attack",
            {"pestId": pest_id, "requestId": str(uuid4()), "moveId": move_id},
        )

    def queue_claim(self, pest_id: str) -> bool:
        if self.link is None or not isinstance(pest_id, str) or not 1 <= len(pest_id) <= 64:
            return False
        return self._queue("basement_claim", f"{BASEMENT_PATH}/carcass/claim", {"pestId": pest_id})

    def queue_sell(self, pest_id: str) -> bool:
        if self.link is None or not isinstance(pest_id, str) or not 1 <= len(pest_id) <= 64:
            return False
        return self._queue("basement_sell", f"{BASEMENT_PATH}/carcass/sell", {"pestId": pest_id})

    def queue_uniform(self, worn: bool) -> bool:
        if self.link is None or not isinstance(worn, bool):
            return False
        return self._queue("basement_uniform", f"{BASEMENT_PATH}/uniform", {"worn": worn})

    def queue_work(self, target: str) -> bool:
        if self.link is None or target not in WORK_TARGETS:
            return False
        return self._queue("basement_work_start", f"{BASEMENT_PATH}/work/start", {"target": target})

    def latest_snapshot(self) -> dict[str, Any] | None:
        with self._lock:
            return json.loads(json.dumps(self._snapshot)) if self._snapshot is not None else None

    def drain_events(self) -> list[BasementSyncEvent]:
        events: list[BasementSyncEvent] = []
        while True:
            try:
                events.append(self._events.get_nowait())
            except queue.Empty:
                return events

    def close(self) -> None:
        self._stop.set()
        thread = self._thread
        if thread is not None:
            thread.join(timeout=self.timeout_seconds + 0.5)
            self._thread = None

    def _queue(self, source: str, path: str, body: dict[str, Any] | None) -> bool:
        if self.link is None:
            return False
        self._actions.put((source, path, body))
        return True

    def _run(self) -> None:
        next_sync = 0.0
        while not self._stop.is_set():
            now = time.monotonic()
            try:
                action = self._actions.get_nowait()
            except queue.Empty:
                action = None
            if action is not None:
                source, path, body = action
                try:
                    if source not in {"basement_enter", "basement_level"}:
                        self._send_presence(force=True)
                    result = self._request_json("POST", path, body)
                    if source == "basement_work_start":
                        session_id = result.get("workSessionId")
                        duration = result.get("durationMs")
                        if isinstance(session_id, str) and isinstance(duration, int):
                            self._pending_work = (
                                session_id,
                                str(result.get("target", "")),
                                time.monotonic() + max(0, duration) / 1_000.0 + 0.1,
                            )
                    event_data = {**(body or {}), **result}
                    self._events.put(BasementSyncEvent(True, self._success_message(source, event_data), source, event_data))
                    next_sync = 0.0
                except _BasementHttpError as error:
                    details = {"errorPayload": error.payload} if error.payload else None
                    self._events.put(BasementSyncEvent(False, str(error), source, details, error.code))
                    self._last_error = str(error)
                except (OSError, URLError, TimeoutError, ValueError) as error:
                    self._events.put(BasementSyncEvent(False, "BASEMENT SERVER OFFLINE", source, code="NETWORK_ERROR"))
                    self._last_error = str(error)
                continue

            with self._lock:
                in_basement = self._scene_state is not None
            if in_basement and now >= next_sync:
                try:
                    self._send_presence(force=True)
                    with self._lock:
                        scene_state = self._scene_state
                    if scene_state is not None:
                        payload = self._request_json(
                            "GET",
                            f"{BASEMENT_PATH}/snapshot?level={scene_state[0]}",
                            None,
                        )
                        with self._lock:
                            self._snapshot = payload
                    self._last_error = None
                except _BasementHttpError as error:
                    if str(error) != self._last_error:
                        self._events.put(BasementSyncEvent(False, str(error), "basement_snapshot", code=error.code))
                    self._last_error = str(error)
                except (OSError, URLError, TimeoutError, ValueError) as error:
                    if self._last_error != str(error):
                        self._events.put(BasementSyncEvent(False, "BASEMENT SERVER OFFLINE", "basement_snapshot", code="NETWORK_ERROR"))
                    self._last_error = str(error)
                next_sync = time.monotonic() + self.interval_seconds

            pending = self._pending_work
            if pending is not None and time.monotonic() >= pending[2]:
                session_id, _target, _due_at = pending
                try:
                    result = self._request_json(
                        "POST",
                        f"{BASEMENT_PATH}/work/complete",
                        {"sessionId": session_id},
                    )
                    self._pending_work = None
                    self._events.put(BasementSyncEvent(
                        True,
                        "TOWER UTILITY WORK COMPLETE",
                        "basement_work_complete",
                        result,
                    ))
                    next_sync = 0.0
                except _BasementHttpError as error:
                    retry_ms = (
                        error.payload.get("remainingMs")
                        if isinstance(error.payload, dict)
                        else None
                    )
                    if error.code == "HTTP_409" and isinstance(retry_ms, int) and retry_ms > 0:
                        self._pending_work = (
                            session_id,
                            _target,
                            time.monotonic() + min(2.0, retry_ms / 1_000.0) + 0.05,
                        )
                        continue
                    self._pending_work = None
                    self._events.put(BasementSyncEvent(
                        False,
                        str(error),
                        "basement_work_complete",
                        {"errorPayload": error.payload} if error.payload else None,
                        error.code,
                    ))
                    next_sync = 0.0
                except (OSError, URLError, TimeoutError, ValueError):
                    # Leave the session queued for a single retry; its id is
                    # idempotent and the API owns the work completion state.
                    self._pending_work = (session_id, _target, time.monotonic() + self.interval_seconds)
            self._stop.wait(0.1)

    def _send_presence(self, *, force: bool) -> None:
        del force
        with self._lock:
            scene_state = self._scene_state
        if scene_state is None:
            return
        level, x, y, action = scene_state
        self._request_json(
            "POST",
            f"{BASEMENT_PATH}/presence",
            {"level": level, "x": x, "y": y, "action": action},
        )

    def _request_json(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None,
    ) -> dict[str, Any]:
        if self.link is None:
            raise _BasementHttpError("NO_LINK", "LINK A GAME ACCOUNT TO SYNC THE BASEMENT")
        data = json.dumps(body).encode("utf-8") if body is not None else None
        request = Request(
            f"{self.link.server_url.rstrip('/')}/api{path}",
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
        except HTTPError as error:
            try:
                details = json.loads(error.read().decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                details = None
            message = details.get("error") if isinstance(details, dict) else None
            raise _BasementHttpError(
                f"HTTP_{error.code}",
                str(message or f"BASEMENT REQUEST FAILED / HTTP {error.code}"),
                details if isinstance(details, dict) else None,
            ) from error
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise _BasementHttpError("INVALID_RESPONSE", "BASEMENT SERVER RETURNED INVALID DATA") from error
        if not isinstance(payload, dict):
            raise _BasementHttpError("INVALID_RESPONSE", "BASEMENT SERVER RETURNED INVALID DATA")
        return payload

    @staticmethod
    def _success_message(source: str, result: dict[str, Any]) -> str:
        if source == "basement_enter":
            mode = result.get("accessMode")
            if mode == "service_elevator":
                return "SERVICE ELEVATOR / ENTERED B1"
            if mode == "back_entrance":
                return "REAR ENTRANCE / ENTERED B1"
            return "STAIRS / ENTERED B1"
        if source == "basement_level":
            return f"BASEMENT TRANSIT / ENTERED B{result.get('level', '')}"
        if source == "basement_exit":
            return (
                "REAR ENTRANCE / RETURNED TO THE TOWER LOBBY"
                if result.get("exitVia") == "back_entrance"
                else "RETURNED TO THE TOWER LOBBY"
            )
        if source == "basement_attack":
            return "NON-LETHAL MELEE / SERVER RESOLVED"
        if source == "basement_claim":
            return "CARCASS CLAIMED / CARRY IT TO B3"
        if source == "basement_sell":
            return f"CARCASS SOLD / ƒ{int(result.get('bountyFiat', 0) or 0):,}"
        if source == "basement_uniform":
            return "PEST RESPONSE UNIFORM UPDATED"
        if source == "basement_work_start":
            return "TOWER MAINTENANCE IN PROGRESS"
        return "BASEMENT SYNC COMPLETE"
