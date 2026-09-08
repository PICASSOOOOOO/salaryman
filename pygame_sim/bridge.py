"""Local Pygame ↔ Godot bridge.

Pygame remains the authority for simulation, finance, and interaction rules.
Godot is a renderer and input client. Messages are newline-delimited JSON so
TCP packet boundaries never become application message boundaries.
"""

from __future__ import annotations

import json
import socket
from dataclasses import dataclass
from typing import Any

from .scene import TowerScene
from .state import OfficeState


PROTOCOL_VERSION = 1
MAX_LINE_BYTES = 64 * 1024
ALLOWED_ROOMS = {"lobby", "recreation", "executive", "public", "office_03", "office_04"}
ALLOWED_VENDING_ITEMS = {"coffee", "desk_lamp", "office_chair"}
COMMANDS = {
    "move",
    "set_input",
    "interact",
    "select_room",
    "select_worker",
    "buy_coffee",
    "toggle_running",
    "toggle_auto_breaks",
    "start_break",
    "toggle_recruitment",
    "refresh_recruitment",
    "hire_candidate",
    "toggle_drawer",
}


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def validate_command(command: object) -> tuple[bool, str]:
    """Validate the envelope and bounded payload before touching simulation state."""
    if not isinstance(command, dict):
        return False, "COMMAND MUST BE AN OBJECT"
    if command.get("type") != "command":
        return False, "UNSUPPORTED MESSAGE TYPE"
    if command.get("version") != PROTOCOL_VERSION:
        return False, "UNSUPPORTED PROTOCOL VERSION"
    name = command.get("name")
    if not isinstance(name, str) or name not in COMMANDS:
        return False, "COMMAND NOT ALLOWED"
    payload = command.get("payload", {})
    if not isinstance(payload, dict):
        return False, "COMMAND PAYLOAD MUST BE AN OBJECT"

    if name == "move":
        if not _is_int(payload.get("dx")) or not _is_int(payload.get("dy")):
            return False, "MOVE REQUIRES INTEGER DX AND DY"
        if abs(payload["dx"]) > 350 or abs(payload["dy"]) > 350:
            return False, "MOVE STEP TOO LARGE"
    elif name == "set_input":
        if not isinstance(payload.get("x"), (int, float)) or isinstance(payload.get("x"), bool):
            return False, "INPUT REQUIRES NUMERIC X AND Y"
        if not isinstance(payload.get("y"), (int, float)) or isinstance(payload.get("y"), bool):
            return False, "INPUT REQUIRES NUMERIC X AND Y"
        if abs(float(payload["x"])) > 1 or abs(float(payload["y"])) > 1:
            return False, "INPUT VECTOR OUT OF RANGE"
    elif name == "select_room":
        room = payload.get("room")
        if not isinstance(room, str) or room not in ALLOWED_ROOMS:
            return False, "ROOM NOT FOUND"
    elif name in {"select_worker", "buy_coffee", "hire_candidate"} and not _is_int(payload.get("index")):
        return False, f"{name.upper()} REQUIRES AN INTEGER INDEX"
    elif name == "start_break" and payload.get("kind", "short") not in {"short", "lunch"}:
        kind = payload.get("kind", "short")
        if not isinstance(kind, str) or kind not in {"short", "lunch"}:
            return False, "BREAK KIND NOT ALLOWED"
    elif name == "interact":
        object_id = payload.get("object_id")
        if object_id is not None and (not isinstance(object_id, str) or len(object_id) > 80):
            return False, "OBJECT ID NOT VALID"
        vending_item = payload.get("vending_item", "coffee")
        if not isinstance(vending_item, str) or vending_item not in ALLOWED_VENDING_ITEMS:
            return False, "VENDING ITEM NOT ALLOWED"
    return True, "OK"


@dataclass(frozen=True)
class CommandResult:
    ok: bool
    message: str
    destination: str | None = None
    route: str | None = None


def apply_command(command: object, state: OfficeState, scene: TowerScene) -> CommandResult:
    """Apply one validated renderer command through existing domain methods."""
    valid, reason = validate_command(command)
    if not valid:
        return CommandResult(False, reason)
    assert isinstance(command, dict)
    name = command["name"]
    payload = command.get("payload", {})

    if name == "move":
        scene.move(payload["dx"], payload["dy"])
        state.notice = f"POSITION / {scene.room.label}"
        return CommandResult(True, state.notice)
    if name == "set_input":
        scene.set_motion_input(payload["x"], payload["y"])
        return CommandResult(True, "MOTION INPUT ACCEPTED")
    if name == "interact":
        result = scene.interact(
            state,
            payload.get("object_id"),
            vending_item=payload.get("vending_item", "coffee"),
        )
        return CommandResult(result.success, result.message, result.destination, result.route)
    if name == "select_room":
        if not scene.select_room(payload["room"]):
            return CommandResult(False, "ROOM NOT FOUND")
        state.notice = f"ROOM / {scene.room.label}"
        return CommandResult(True, state.notice)
    if name == "select_worker":
        ok = state.select_worker(payload["index"])
        return CommandResult(ok, state.notice if ok else "WORKER NOT FOUND")
    if name == "buy_coffee":
        ok = state.buy_coffee(payload["index"])
        return CommandResult(ok, state.notice)
    if name == "toggle_running":
        state.toggle_running()
        return CommandResult(True, state.notice)
    if name == "toggle_auto_breaks":
        state.toggle_auto_breaks()
        return CommandResult(True, state.notice)
    if name == "start_break":
        ok = state.start_break(payload.get("kind", "short"))
        return CommandResult(ok, state.notice if ok else "BREAK NOT AVAILABLE")
    if name == "toggle_recruitment":
        state.toggle_recruitment()
        return CommandResult(True, state.notice)
    if name == "refresh_recruitment":
        ok = state.refresh_recruitment_candidates()
        return CommandResult(ok, state.notice)
    if name == "hire_candidate":
        ok = state.hire_candidate(payload["index"])
        return CommandResult(ok, state.notice if not ok else state.notice)
    if name == "toggle_drawer":
        state.toggle_drawer()
        return CommandResult(True, state.notice)
    return CommandResult(False, "COMMAND NOT IMPLEMENTED")


def build_snapshot(state: OfficeState, scene: TowerScene, sequence: int) -> dict[str, Any]:
    """Build a versioned, JSON-safe snapshot for Godot rendering."""
    current_room = scene.room
    grid_cell_size = 500
    grid_origin_x, grid_origin_y = current_room.bounds[0], current_room.bounds[1]
    player_x, player_y = scene.player_position
    exits = [
        {
            "id": item.id,
            "label": item.label,
            "kind": item.kind,
            "destination_room": item.destination_room,
            "destination_floor": item.destination_floor,
        }
        for item in scene.objects.objects
        if item.room == scene.current_room and item.kind in {"door", "elevator", "stairs"}
    ]
    return {
        "type": "snapshot",
        "version": PROTOCOL_VERSION,
        "sequence": sequence,
        "pablo": {
            "upgrade": "pablo-core-2026",
            "authority": "shared-api",
            "credentialsInClient": False,
        },
        "scene": {
            "floor": scene.current_floor,
            "room": scene.current_room,
            "player": {"x": scene.player_position[0], "y": scene.player_position[1]},
            "rooms": [
                {
                    "id": room.id,
                    "label": room.label,
                    "x": room.bounds[0],
                    "y": room.bounds[1],
                    "width": room.bounds[2],
                    "height": room.bounds[3],
                    "accent": list(room.accent),
                }
                for room in scene.rooms
            ],
            "objects": [
                {
                    "id": item.id,
                    "kind": item.kind,
                    "label": item.label,
                    "room": item.room,
                    "x": item.position[0],
                    "y": item.position[1],
                    "interactive": item.interactive,
                    "nearby": item == scene.nearby_object,
                }
                for item in scene.objects.objects
            ],
            # MiniGrid-inspired observation data: the client can render and
            # navigate a room graph without becoming the simulation authority.
            # Coordinates remain in Pygame's world space so no second movement
            # model is created in Godot.
            "navigation": {
                "cell_size": grid_cell_size,
                "cell": [
                    max(0, (player_x - grid_origin_x) // grid_cell_size),
                    max(0, (player_y - grid_origin_y) // grid_cell_size),
                ],
                "room": scene.current_room,
                "mission": f"Reach an interactive object in {current_room.label}",
                "exits": exits,
            },
        },
        "office": {
            "funds": round(state.funds, 2),
            "day": state.day,
            "time": state.time_label,
            "running": state.running,
            "notice": state.notice,
            "drawer_open": state.drawer_open,
            "recruitment_open": state.recruitment_open,
            "selected_worker": state.selected_worker,
            "workers": [
                {
                    "name": worker.name,
                    "role": worker.role,
                    "stamina": round(worker.stamina, 2),
                    "hunger": round(worker.hunger, 2),
                    "status": worker.status_note,
                }
                for worker in state.roster.workers
            ],
        },
    }


class OfficeBridge:
    """Non-blocking localhost server used by the optional Godot renderer."""

    def __init__(self, host: str = "127.0.0.1", port: int = 4242) -> None:
        self.host = host
        self.port = port
        self.listener: socket.socket | None = None
        self.client: socket.socket | None = None
        self.inbound = bytearray()
        self.outbound = bytearray()
        self.sequence = 0
        self.status = "BRIDGE OFFLINE"

    @property
    def connected(self) -> bool:
        return self.client is not None

    def start(self) -> bool:
        try:
            listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            listener.bind((self.host, self.port))
            listener.listen(1)
            listener.setblocking(False)
            self.listener = listener
            self.port = int(listener.getsockname()[1])
            self.status = f"BRIDGE LISTENING / {self.host}:{self.port}"
            return True
        except OSError as error:
            self.status = f"BRIDGE UNAVAILABLE / {error}"
            self.close()
            return False

    def poll_commands(self) -> list[dict[str, Any]]:
        """Accept/read without blocking the simulation loop."""
        self._accept()
        if self.client is None:
            return []
        while True:
            try:
                chunk = self.client.recv(64 * 1024)
            except BlockingIOError:
                break
            except OSError:
                self._drop_client()
                break
            if not chunk:
                self._drop_client()
                break
            self.inbound.extend(chunk)
            if len(self.inbound) > MAX_LINE_BYTES * 2:
                self._drop_client()
                break

        commands: list[dict[str, Any]] = []
        while b"\n" in self.inbound:
            raw, _, remainder = self.inbound.partition(b"\n")
            self.inbound = bytearray(remainder)
            if len(raw) > MAX_LINE_BYTES:
                continue
            try:
                parsed = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                self.queue({"type": "error", "version": PROTOCOL_VERSION, "message": "INVALID JSON"})
                continue
            if isinstance(parsed, dict):
                commands.append(parsed)
            else:
                self.queue({"type": "error", "version": PROTOCOL_VERSION, "message": "MESSAGE MUST BE AN OBJECT"})
        self.flush()
        return commands

    def queue(self, message: dict[str, Any]) -> None:
        try:
            encoded = (json.dumps(message, separators=(",", ":")) + "\n").encode("utf-8")
        except (TypeError, ValueError):
            return
        if len(self.outbound) + len(encoded) <= MAX_LINE_BYTES * 4:
            self.outbound.extend(encoded)

    def send_snapshot(self, state: OfficeState, scene: TowerScene) -> None:
        self.sequence += 1
        self.queue(build_snapshot(state, scene, self.sequence))

    def send_result(self, command: dict[str, Any], result: CommandResult) -> None:
        self.queue(
            {
                "type": "result",
                "version": PROTOCOL_VERSION,
                "id": command.get("id"),
                "ok": result.ok,
                "message": result.message,
                "destination": result.destination,
                "route": result.route,
            }
        )

    def flush(self) -> None:
        if self.client is None:
            return
        while self.outbound:
            try:
                sent = self.client.send(self.outbound)
            except BlockingIOError:
                return
            except OSError:
                self._drop_client()
                return
            if sent <= 0:
                self._drop_client()
                return
            del self.outbound[:sent]

    def close(self) -> None:
        self._drop_client()
        if self.listener is not None:
            try:
                self.listener.close()
            finally:
                self.listener = None
        self.status = "BRIDGE CLOSED"

    def _accept(self) -> None:
        if self.listener is None:
            return
        try:
            client, _address = self.listener.accept()
        except BlockingIOError:
            return
        except OSError:
            return
        client.setblocking(False)
        self._drop_client()
        self.client = client
        self.inbound.clear()
        self.status = "BRIDGE CONNECTED"

    def _drop_client(self) -> None:
        if self.client is not None:
            try:
                self.client.close()
            except OSError:
                pass
        self.client = None
        self.inbound.clear()
        self.outbound.clear()
        if self.listener is not None:
            self.status = f"BRIDGE LISTENING / {self.host}:{self.port}"