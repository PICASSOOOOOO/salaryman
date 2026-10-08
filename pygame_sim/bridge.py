"""The local SALARYMAN OS simulation ↔ Godot game-client bridge.

Pygame remains the authority for simulation, finance, and interaction rules.
Godot is the player-facing movement, action, and building runtime; both are
required parts of the downloadable game. Messages are newline-delimited JSON
so TCP packet boundaries never become application message boundaries.
"""

from __future__ import annotations

import json
import socket
import webbrowser
from dataclasses import dataclass
from math import hypot
from time import monotonic
from typing import Any

from .automation import AUTOMATION_CHARACTERS
from .pest_work import (
    MELEE_MOVES,
    MELEE_MOVE_BY_ID,
    PEST_JOBS,
    PEST_JOB_BY_ID,
    STAMINA_SUPPLY_ITEMS,
)
from .scene import FLOOR_COUNT, TowerScene
from .state import OfficeState


PROTOCOL_VERSION = 1
MAX_INBOUND_LINE_BYTES = 64 * 1024
MAX_OUTBOUND_LINE_BYTES = 2 * 1024 * 1024
MAX_OUTBOUND_BUFFER_BYTES = 8 * 1024 * 1024
ALLOWED_ROOMS = {
    "lobby", "recreation", "executive", "public", "office_03", "office_04", "executive_suite",
    "floor07_business",
    *(f"construction_f{floor:02d}" for floor in range(2, 6)),
}
ALLOWED_VENDING_ITEMS = {"coffee"}
COMMANDS = {
    "move",
    "set_input",
    "set_action",
    "interact",
    "maintain",
    "select_room",
    "select_floor",
    "climb_stairs",
    "select_worker",
    "buy_coffee",
    "buy_vending",
    "toggle_running",
    "toggle_auto_breaks",
    "start_break",
    "toggle_recruitment",
    "refresh_recruitment",
    "hire_candidate",
    "terminal_choice",
    "reception_choice",
    "toggle_business_stock",
    "toggle_drawer",
    "close_page",
    "toggle_music",
    "open_melee_menu",
    "basement_attack",
    "start_pest_job",
    "toggle_pest_uniform",
    "use_pest_supply",
}

RECEPTION_SERVICE_ROUTES = {
    1: ("JOB OPPORTUNITIES", "/business/jobs"),
    2: ("BUSINESS CONTRACTS", "/business/contracts"),
    3: ("REAL ESTATE / LEASING", "/store/realty"),
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
        if "sprint" in payload and not isinstance(payload["sprint"], bool):
            return False, "SPRINT MUST BE A BOOLEAN"
    elif name == "set_action":
        if payload.get("action") not in {"stand", "jump", "sit", "sleep", "fight", "sweep"}:
            return False, "ACTION NOT ALLOWED"
    elif name == "maintain":
        if payload.get("action") not in {"clean", "repair"}:
            return False, "MAINTENANCE ACTION NOT ALLOWED"
        object_id = payload.get("object_id")
        if object_id is not None and (not isinstance(object_id, str) or len(object_id) > 80):
            return False, "OBJECT ID NOT VALID"
    elif name == "select_room":
        room = payload.get("room")
        if not isinstance(room, str) or room not in ALLOWED_ROOMS:
            return False, "ROOM NOT FOUND"
    elif name == "select_floor":
        if not _is_int(payload.get("floor")) or not 1 <= payload["floor"] <= FLOOR_COUNT:
            return False, f"FLOOR MUST BE BETWEEN 1 AND {FLOOR_COUNT}"
    elif name in {"select_worker", "buy_coffee", "hire_candidate"} and not _is_int(payload.get("index")):
        return False, f"{name.upper()} REQUIRES AN INTEGER INDEX"
    elif name == "start_break" and payload.get("kind", "short") not in {"short", "lunch"}:
        kind = payload.get("kind", "short")
        if not isinstance(kind, str) or kind not in {"short", "lunch"}:
            return False, "BREAK KIND NOT ALLOWED"
    elif name == "terminal_choice":
        choice = payload.get("choice")
        if not _is_int(choice) or not 1 <= choice <= 9:
            return False, "TERMINAL CHOICE MUST BE 1-9"
    elif name == "reception_choice":
        choice = payload.get("choice")
        if not _is_int(choice) or choice not in RECEPTION_SERVICE_ROUTES:
            return False, "RECEPTION SERVICE CHOICE MUST BE 1-3"
    elif name == "buy_vending":
        item_id = payload.get("item_id")
        if not isinstance(item_id, str) or not item_id or len(item_id) > 80:
            return False, "VENDING ITEM ID NOT VALID"
    elif name == "basement_attack":
        move_id = payload.get("move_id")
        if not isinstance(move_id, str) or move_id not in MELEE_MOVE_BY_ID:
            return False, "MELEE MOVE NOT ALLOWED"
    elif name == "start_pest_job":
        job_id = payload.get("job_id")
        if not isinstance(job_id, str) or job_id not in PEST_JOB_BY_ID:
            return False, "PEST WORK ORDER NOT ALLOWED"
    elif name == "use_pest_supply":
        item_id = payload.get("item_id")
        if not isinstance(item_id, str) or item_id not in STAMINA_SUPPLY_ITEMS:
            return False, "SUPPLY NOT ALLOWED"
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


def _request_tower_floor(
    floor: int,
    state: OfficeState,
    scene: TowerScene,
    building_sync: Any | None,
    basement_sync: Any | None = None,
) -> CommandResult:
    nearby = scene.nearby_object
    if scene.is_basement:
        if floor == int(scene.basement_level or 1):
            message = f"ALREADY ON BASEMENT B{floor}"
            state.notice = message
            return CommandResult(False, message)
        if nearby is None or nearby.kind not in {"basement_stairs", "service_elevator"}:
            message = "MOVE TO THE BASEMENT STAIRS OR SERVICE ELEVATOR"
            state.notice = message
            return CommandResult(False, message)
        if nearby.kind == "basement_stairs" and abs(floor - int(scene.basement_level or 1)) != 1:
            message = "BASEMENT STAIRS CONNECT ONLY ADJACENT LEVELS"
            state.notice = message
            return CommandResult(False, message)
        if basement_sync is None or not basement_sync.queue_level(floor, scene):
            message = "BASEMENT FLOOR REQUEST UNAVAILABLE"
            state.notice = message
            return CommandResult(False, message)
        transit = "STAIRS" if nearby.kind == "basement_stairs" else "SERVICE ELEVATOR"
        message = f"{transit} / REQUESTING B{floor}"
        state.notice = message
        state.close_page()
        return CommandResult(True, message, destination=f"basement:{floor}")
    if not scene.is_playable_floor(floor):
        status = scene.floor_status(floor).replace("_", " ").upper()
        message = "BASEMENT IS UNDER CONSTRUCTION" if floor < 1 else f"FLOOR {floor:02d} IS {status}"
        state.notice = message
        return CommandResult(False, message)
    if floor == scene.current_floor:
        message = f"ALREADY ON FLOOR {floor:02d}"
        state.notice = message
        return CommandResult(False, message)
    if nearby is not None and nearby.kind == "stairs" \
        and abs(floor - scene.current_floor) == 1:
        stairwell = int(nearby.stairwell_number or 0)
        if building_sync is not None and getattr(building_sync, "link", None) is not None:
            if not building_sync.queue_stairs(floor, stairwell, scene):
                message = "STAIRWELL REQUEST UNAVAILABLE"
                state.notice = message
                return CommandResult(False, message)
            state.close_page()
            message = f"STAIRS / REQUESTING FLOOR {floor:02d}"
            state.notice = message
            return CommandResult(True, message, destination=f"floor:{floor}")
        if scene.select_floor(floor):
            state.close_page()
            state.notice = f"STAIRS / CLIMBED TO FLOOR {scene.current_floor:02d}"
            return CommandResult(True, state.notice, destination=f"floor:{scene.current_floor}")
    if nearby is None or nearby.kind not in {"elevator", "service_elevator"}:
        message = "MOVE TO AN ELEVATOR TO CHANGE FLOORS"
        state.notice = message
        return CommandResult(False, message)

    state.close_page()
    if building_sync is not None and getattr(building_sync, "link", None) is not None:
        if not building_sync.queue_elevator(floor, scene):
            message = "ELEVATOR REQUEST UNAVAILABLE"
            state.notice = message
            return CommandResult(False, message)
        message = f"ELEVATOR REQUESTED / FLOOR {floor:02d}"
        state.notice = message
        return CommandResult(True, message, destination=f"elevator:{floor}")

    if not scene.select_floor(floor):
        message = f"FLOOR {floor:02d} IS UNDER CONSTRUCTION"
        state.notice = message
        return CommandResult(False, message)
    state.notice = f"ELEVATOR ARRIVED / FLOOR {scene.current_floor:02d}"
    return CommandResult(True, state.notice, destination=f"floor:{scene.current_floor}")


def _handle_basement_interact(
    state: OfficeState,
    scene: TowerScene,
    building_sync: Any | None,
    basement_sync: Any | None,
    requested_object_id: object,
) -> CommandResult | None:
    nearby = scene.nearby_object
    if requested_object_id is not None and (
        nearby is None or requested_object_id != nearby.id
    ):
        return None

    if (
        not scene.is_basement
        and scene.current_room == "lobby"
        and nearby is not None
        and (
            nearby.kind == "service_elevator"
            or nearby.id == "lobby-back-entrance"
            or nearby.kind == "stairs" and (
                nearby.id == "lobby-stairs" or nearby.id.startswith("lobby-stairwell-")
            )
        )
    ):
        if basement_sync is None or not basement_sync.queue_enter(scene):
            return CommandResult(False, "BASEMENT ACCESS REQUIRES A LIVE GAME LINK")
        state.close_page()
        if nearby.kind == "service_elevator":
            state.notice = "SERVICE ELEVATOR / REQUESTING B1 ACCESS"
        elif nearby.id == "lobby-back-entrance":
            state.notice = "REAR ENTRANCE / REQUESTING B1 ACCESS"
        else:
            state.notice = "STAIRS / REQUESTING B1 ACCESS"
        return CommandResult(True, state.notice)

    if not scene.is_basement:
        return None

    if nearby is not None and nearby.kind == "carcass_disposal":
        snapshot = scene.basement_snapshot or {}
        pests = snapshot.get("pests", [])
        carried = [
            pest for pest in pests
            if isinstance(pest, dict)
            and pest.get("status") == "carcass"
            and pest.get("claimedByYou") is True
        ] if isinstance(pests, list) else []
        if not carried:
            return CommandResult(False, "CLAIM A CARCASS BEFORE TAKING IT TO B3")
        if basement_sync is None or not basement_sync.queue_sell(str(carried[0]["id"])):
            return CommandResult(False, "CARCASS SALE UNAVAILABLE / CHECK GAME LINK")
        state.notice = "CARCASS SALE REQUESTED"
        return CommandResult(True, state.notice)

    carcass = scene.nearest_carcass
    if carcass is not None:
        carcass_distance = hypot(
            int(carcass["x"]) - scene.player_position[0],
            int(carcass["y"]) - scene.player_position[1],
        )
        object_distance = (
            hypot(
                nearby.position[0] - scene.player_position[0],
                nearby.position[1] - scene.player_position[1],
            )
            if nearby is not None
            else float("inf")
        )
        if carcass_distance <= object_distance:
            if basement_sync is None or not basement_sync.queue_claim(str(carcass["id"])):
                return CommandResult(False, "CARCASS CLAIM UNAVAILABLE / CHECK GAME LINK")
            state.notice = "CARCASS CLAIM REQUESTED"
            return CommandResult(True, state.notice)

    if nearby is None:
        return None

    if nearby.id == "basement-b1-back-entrance":
        if basement_sync is None or not basement_sync.queue_exit(scene):
            return CommandResult(False, "B1 REAR ENTRANCE EXIT UNAVAILABLE")
        state.close_page()
        state.notice = "REAR ENTRANCE / REQUESTING TOWER LOBBY"
        return CommandResult(True, state.notice)

    if nearby.kind == "service_elevator":
        level = int(scene.basement_level or 1)
        if level == 1:
            if basement_sync is None or not basement_sync.queue_exit(scene):
                return CommandResult(False, "BASEMENT SERVICE ELEVATOR EXIT UNAVAILABLE")
            message = "SERVICE ELEVATOR / REQUESTING LOBBY"
        elif basement_sync is None or not basement_sync.queue_level(1, scene):
            return CommandResult(False, "SERVICE ELEVATOR REQUEST UNAVAILABLE")
        else:
            message = "SERVICE ELEVATOR / REQUESTING B1"
        state.close_page()
        state.notice = message
        return CommandResult(True, message)

    if nearby.kind == "basement_stairs":
        level = int(scene.basement_level or 1)
        if nearby.id == "basement-stairs-up-b1":
            if basement_sync is None or not basement_sync.queue_exit(scene):
                return CommandResult(False, "RETURN TO B1 STAIRS TO EXIT THE BASEMENT")
            message = "STAIRS / REQUESTING LOBBY EXIT"
        elif nearby.id.startswith("basement-stairs-up-b"):
            destination = level - 1
            if destination < 1 or basement_sync is None or not basement_sync.queue_level(destination, scene):
                return CommandResult(False, "UPPER STAIR TRANSITION UNAVAILABLE")
            message = f"STAIRS / REQUESTING B{destination}"
        elif nearby.id.startswith("basement-stairs-down-b"):
            destination = level + 1
            if destination > 6 or basement_sync is None or not basement_sync.queue_level(destination, scene):
                return CommandResult(False, "B6 IS THE LOWEST OPEN LANDING")
            message = f"STAIRS / REQUESTING B{destination}"
        else:
            return CommandResult(False, "STAIR LANDING NOT AVAILABLE")
        state.close_page()
        state.notice = message
        return CommandResult(True, message)

    if nearby.kind == "utility_station":
        targets = {
            "basement-b5-power": "power",
            "basement-b6-plumbing": "plumbing",
            "basement-b3-upkeep": "upkeep",
        }
        target = targets.get(nearby.id)
        if target is None:
            return CommandResult(False, "UTILITY STATION NOT AVAILABLE")
        if basement_sync is None or not basement_sync.queue_work(target):
            return CommandResult(False, "UTILITY WORK REQUIRES A LIVE GAME LINK")
        state.utility_work_target = target
        state.utility_work_active = True
        state.utility_work_started_at = monotonic()
        state.open_page(
            "utility_work",
            from_object=True,
            source=f"{target.upper()} MAINTENANCE",
            source_object_id=nearby.id,
        )
        scene.set_player_action("maintenance")
        state.notice = f"{target.upper()} WORK REQUESTED"
        return CommandResult(True, state.notice)

    return None


def apply_command(
    command: object,
    state: OfficeState,
    scene: TowerScene,
    building_sync: Any | None = None,
    basement_sync: Any | None = None,
) -> CommandResult:
    """Apply one validated renderer command through existing domain methods."""
    valid, reason = validate_command(command)
    if not valid:
        return CommandResult(False, reason)
    assert isinstance(command, dict)
    name = command["name"]
    payload = command.get("payload", {})

    if state.relocation_cutscene_pending:
        return CommandResult(False, "WAIT FOR THE RELOCATION SEQUENCE TO FINISH")
    if state.utility_work_active:
        return CommandResult(False, "FINISH THE CURRENT UTILITY TASK FIRST")

    if name == "move":
        scene.move(payload["dx"], payload["dy"])
        state.notice = f"POSITION / {scene.room.label}"
        return CommandResult(True, state.notice)
    if name == "set_input":
        scene.set_motion_input(payload["x"], payload["y"], sprint=payload.get("sprint", False))
        return CommandResult(True, "MOTION INPUT ACCEPTED")
    if name == "set_action":
        action = payload["action"]
        if scene.is_basement and action == "fight":
            return CommandResult(False, "OPEN THE MELEE MENU TO CHOOSE A SERVER-RESOLVED MOVE")
        duration = (
            0.9
            if action == "jump"
            else 4.0
            if action == "sleep"
            else 0.7
            if action == "fight"
            else 0.85
            if action == "sweep"
            else 0.0
        )
        if not scene.set_player_action(action, duration=duration):
            return CommandResult(False, "NO CHAIR IN RANGE")
        state.notice = action.upper()
        return CommandResult(True, state.notice)
    if name == "interact":
        nearby = scene.nearby_object
        requested_object_id = payload.get("object_id")
        basement_result = _handle_basement_interact(
            state,
            scene,
            building_sync,
            basement_sync,
            requested_object_id,
        )
        if basement_result is not None:
            return basement_result
        if nearby is not None and nearby.kind == "restroom_stall" \
            and requested_object_id in (None, nearby.id):
            if building_sync is None or not building_sync.queue_game_request("restroom", nearby.id):
                return CommandResult(False, "RESTROOM REQUEST UNAVAILABLE / WAIT OR MOVE TO AN OPEN STALL")
            scene.set_player_action("sit", duration=9.0)
            state.notice = "PRIVATE RESTROOM / PRESS E AGAIN AFTER 8 SECONDS"
            return CommandResult(True, state.notice)
        if nearby is not None and nearby.kind == "trash_can" \
            and requested_object_id in (None, nearby.id):
            if building_sync is None or not building_sync.queue_game_request("waste_pickup", nearby.id):
                return CommandResult(False, "TRASH PICKUP UNAVAILABLE / LINK A GAME ACCOUNT")
            scene.set_player_action("maintenance", duration=1.0)
            state.notice = "PICKING UP TRASH"
            return CommandResult(True, state.notice)
        if nearby is not None and nearby.kind == "shipping_station" \
            and requested_object_id in (None, nearby.id):
            if building_sync is None or not building_sync.queue_game_request("waste_deliver"):
                return CommandResult(False, "B1 SHIPPING IS UNAVAILABLE / CARRY A TRASH LOAD")
            state.notice = "DELIVERING TRASH TO B1"
            return CommandResult(True, state.notice)
        if nearby is not None and nearby.kind == "loading_gate" \
            and requested_object_id in (None, nearby.id):
            if building_sync is None or not building_sync.queue_game_request("supply_receive"):
                return CommandResult(False, "LOADING ZONE IS UNAVAILABLE / TOWER STAFF ONLY")
            state.notice = "RECEIVING TOWER SUPPLIES"
            return CommandResult(True, state.notice)
        if nearby is not None and nearby.kind == "construction_task" \
            and requested_object_id in (None, nearby.id):
            if building_sync is None or not building_sync.queue_construction_work(
                int(nearby.construction_plan_id or 0),
                nearby.construction_task_id or "",
                scene,
            ):
                return CommandResult(False, "CONSTRUCTION TASK UNAVAILABLE / CHECK THE B5 POWER EXPORT")
            state.close_page()
            scene.set_player_action("maintenance")
            state.notice = f"CONSTRUCTION WORK REQUESTED / {nearby.label}"
            return CommandResult(True, state.notice)
        if nearby is not None and nearby.kind == "stairs" \
            and requested_object_id in (None, nearby.id):
            destination = nearby.destination_floor
            if destination is None:
                return CommandResult(False, "STAIR DIRECTION IS NOT AVAILABLE")
            return _request_tower_floor(
                destination,
                state,
                scene,
                building_sync,
                basement_sync,
            )
        if nearby is not None and nearby.kind in {"elevator", "service_elevator"} \
            and requested_object_id in (None, nearby.id):
            return _request_tower_floor(
                nearby.destination_floor or scene.current_floor,
                state,
                scene,
                building_sync,
                basement_sync,
            )
        result = scene.interact(
            state,
            requested_object_id,
            vending_item=payload.get("vending_item", "coffee"),
        )
        return CommandResult(result.success, result.message, result.destination, result.route)
    if name == "maintain":
        if not scene.is_playable_floor(scene.current_floor):
            return CommandResult(False, "MAINTENANCE IS UNAVAILABLE ON THIS FLOOR")
        nearby = scene.nearby_object
        if nearby is None:
            return CommandResult(False, "NO MAINTAINABLE OBJECT IN RANGE")
        object_id = payload.get("object_id", nearby.id)
        if object_id != nearby.id:
            return CommandResult(False, "MOVE CLOSER TO THAT OBJECT")
        if building_sync is None or not building_sync.queue_action(object_id, payload["action"]):
            return CommandResult(False, "BUILDING SYNC UNAVAILABLE")
        scene.set_player_action("maintenance", duration=12.0)
        state.notice = f"{payload['action'].upper()} REQUESTED / {nearby.label}"
        return CommandResult(True, state.notice)
    if name == "select_room":
        state.close_page()
        if not scene.select_room(payload["room"]):
            return CommandResult(False, "ROOM NOT AVAILABLE ON THIS FLOOR")
        state.notice = f"ROOM / {scene.room.label}"
        return CommandResult(True, state.notice)
    if name == "select_floor":
        return _request_tower_floor(payload["floor"], state, scene, building_sync, basement_sync)
    if name == "buy_vending":
        vending = scene.objects.get(state.active_object_id or "")
        nearby = scene.nearby_object
        item_id = payload["item_id"]
        if (
            state.active_page != "vending"
            or vending is None
            or vending.kind != "vending_machine"
            or vending.room != scene.current_room
            or nearby is None
            or nearby.id != vending.id
        ):
            return CommandResult(False, "USE A VENDING MACHINE TO BUY STOCK")
        if not any(
            isinstance(entry, dict) and entry.get("id") == item_id
            for entry in (state.vending_catalog or [])
        ):
            return CommandResult(False, "ITEM IS NOT IN THE CURRENT VENDING CATALOG")
        if building_sync is None or not building_sync.queue_game_request("buy_vending", item_id):
            return CommandResult(False, "PURCHASE UNAVAILABLE / CHECK GAME LINK")
        state.game_service_loading.add("buy_vending")
        state.notice = "PURCHASE SENT / WAITING FOR SERVER"
        return CommandResult(True, state.notice)
    if name == "climb_stairs":
        basement_result = _handle_basement_interact(
            state,
            scene,
            building_sync,
            basement_sync,
            None,
        )
        if basement_result is not None:
            return basement_result
        nearby = scene.nearby_object
        if nearby is None or nearby.kind != "stairs":
            return CommandResult(False, "NO STAIRCASE IN RANGE")
        if scene.current_room == "lobby":
            if basement_sync is None or not basement_sync.queue_enter(scene):
                return CommandResult(False, "BASEMENT ACCESS REQUIRES A LIVE GAME LINK")
            state.notice = "STAIRS / REQUESTING B1 ACCESS"
            return CommandResult(True, state.notice)
        destination = nearby.destination_floor
        if destination is None:
            return CommandResult(False, "STAIR DIRECTION IS NOT AVAILABLE")
        if building_sync is not None and getattr(building_sync, "link", None) is not None:
            if not building_sync.queue_stairs(destination, int(nearby.stairwell_number or 0), scene):
                return CommandResult(False, "STAIRWELL REQUEST UNAVAILABLE")
            state.close_page()
            state.notice = f"STAIRS / REQUESTING FLOOR {destination:02d}"
            return CommandResult(True, state.notice, destination=f"floor:{destination}")
        if not scene.select_floor(destination):
            message = f"FLOOR {destination:02d} IS UNDER CONSTRUCTION"
            state.notice = message
            return CommandResult(False, message)
        state.notice = f"STAIRS / CLIMBED TO FLOOR {scene.current_floor:02d}"
        return CommandResult(True, state.notice, destination=f"floor:{scene.current_floor}")
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
    if name == "toggle_music":
        state.music_enabled = not state.music_enabled
        state.notice = f"MUSIC / {'ON' if state.music_enabled else 'OFF'}"
        return CommandResult(True, state.notice)
    if name == "open_melee_menu":
        if not scene.is_basement:
            return CommandResult(False, "MELEE IS AVAILABLE ONLY FOR BASEMENT PESTS")
        state.open_page("melee", from_object=True, source="NON-GRAPHIC MELEE")
        return CommandResult(True, "MELEE MENU OPEN")
    if name == "basement_attack":
        if not scene.is_basement or scene.nearest_hostile is None:
            return CommandResult(False, "NO ACTIVE PEST IN RANGE")
        move_id = payload["move_id"]
        if basement_sync is None or not basement_sync.queue_attack(
            str(scene.nearest_hostile["id"]),
            move_id,
        ):
            return CommandResult(False, "MELEE REQUEST UNAVAILABLE / CHECK GAME LINK")
        state.close_page()
        state.notice = f"{MELEE_MOVE_BY_ID[move_id]['label']} / SERVER REQUESTED"
        return CommandResult(True, state.notice)
    if name == "start_pest_job":
        if state.active_page != "pest_jobs" or not state.start_pest_job(payload["job_id"]):
            return CommandResult(False, state.notice)
        state.close_page()
        return CommandResult(True, state.notice)
    if name == "toggle_pest_uniform":
        nearby = scene.nearby_object
        if state.active_page != "pest_uniform" or nearby is None \
            or nearby.kind != "pest_uniform_station":
            return CommandResult(False, "MOVE TO A PEST UNIFORM STATION")
        worn = not state.pest_uniform_worn
        if basement_sync is None or not basement_sync.queue_uniform(worn):
            return CommandResult(False, "UNIFORM SERVICE REQUIRES A LIVE GAME LINK")
        state.notice = "UNIFORM CHANGE REQUESTED"
        return CommandResult(True, state.notice)
    if name == "use_pest_supply":
        if state.active_page != "inventory":
            return CommandResult(False, "OPEN INVENTORY TO USE A SUPPLY")
        item_id = payload["item_id"]
        if building_sync is None or not building_sync.queue_game_request("consume_supply", item_id):
            return CommandResult(False, "SUPPLY USE UNAVAILABLE / CHECK GAME LINK")
        state.game_service_loading.add("consume_supply")
        state.notice = "SUPPLY USE REQUESTED"
        return CommandResult(True, state.notice)
    if name == "toggle_business_stock":
        if state.active_page not in {"vending", "business_stock"}:
            return CommandResult(False, "OPEN BUSINESS STOCK AT A TOWER VENDING MACHINE")
        vending = scene.objects.get(state.active_object_id or "")
        if vending is None or vending.kind != "vending_machine":
            return CommandResult(False, "BUSINESS STOCK REQUIRES AN ACTIVE VENDING MACHINE")
        page = "business_stock" if state.active_page == "vending" else "vending"
        state.open_page(
            page,
            from_object=True,
            source=state.page_source or "TOWER VENDING",
            source_object_id=vending.id,
        )
        state.notice = (
            "BUSINESS STOCK AND GHOST CONTACT"
            if page == "business_stock"
            else "TOWER VENDING / SERVER-PRICED STOCK"
        )
        return CommandResult(True, state.notice)
    if name == "reception_choice":
        receptionist = scene.objects.get("lobby-receptionist")
        if (
            state.active_page != "reception"
            or state.active_object_id != "lobby-receptionist"
            or scene.current_room != "lobby"
            or receptionist is None
            or hypot(
                scene.player_position[0] - receptionist.position[0],
                scene.player_position[1] - receptionist.position[1],
            ) > 1_250
        ):
            return CommandResult(False, "MOVE TO MILA AT THE LOBBY RECEPTION")
        link = getattr(building_sync, "link", None)
        if link is None:
            return CommandResult(False, "LINK A GAME ACCOUNT TO OPEN RECEPTION SERVICES")
        label, route = RECEPTION_SERVICE_ROUTES[payload["choice"]]
        try:
            opened = webbrowser.open(f"{link.server_url.rstrip('/')}{route}")
        except Exception:
            opened = False
        if not opened:
            return CommandResult(False, "COULD NOT OPEN THE SELECTED SERVICE")
        state.close_page()
        return CommandResult(True, f"OPENING {label}")
    if name == "terminal_choice":
        if state.active_page != "systems":
            return CommandResult(False, "SYSTEMS TERMINAL NOT ACTIVE")
        choice = payload["choice"]
        if choice == 9:
            state.close_page()
            return CommandResult(True, "SYSTEMS TERMINAL CLOSED")
        if 1 <= choice <= len(AUTOMATION_CHARACTERS):
            profile = AUTOMATION_CHARACTERS[choice - 1]
            scene.selected_automation_domain = profile.domain
            page = "automation"
            source = f"{profile.name} / {profile.app_label}"
        elif choice == 7:
            page = "bank"
            source = "SYSTEMS TERMINAL"
        else:
            page = "phone"
            source = "SYSTEMS TERMINAL"
        if not state.open_page(
            page,
            from_object=True,
            source=source,
            source_object_id=state.active_object_id,
        ):
            return CommandResult(False, "TERMINAL OPTION UNAVAILABLE")
        if choice == 7 and building_sync is not None:
            state.fiat_balance = None
            state.fiat_spendable = None
            if building_sync.queue_game_request("bank"):
                state.game_service_loading.add("bank")
        return CommandResult(True, f"OPENED {source}")
    if name == "close_page":
        state.close_page()
        return CommandResult(True, "PAGE CLOSED")
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
        if item.room == scene.current_room and item.kind in {"door", "elevator", "stairs", "basement_stairs"}
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
            "player": {
                "x": scene.player_position[0],
                "y": scene.player_position[1],
                "action": scene.player_action,
                "inDanger": scene.danger_intensity > 0,
                "dangerIntensity": scene.danger_intensity,
            },
            "basementLevel": scene.basement_level,
            "basement": scene.basement_snapshot,
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
                    "displayX": item.visual_position[0],
                    "displayY": item.visual_position[1],
                    "interactive": item.interactive,
                    "collisionHalfExtents": list(item.collision_half_extents),
                    "constructionPlanId": item.construction_plan_id,
                    "constructionTaskId": item.construction_task_id,
                    "constructionComplete": item.completed,
                    "cameraFocusEnabled": item.camera_focus_enabled,
                    "destinationRoom": item.destination_room,
                    "doorOpen": item.id in scene.opened_door_ids,
                    "nearby": item == scene.nearby_object,
                    "cleanliness": scene.building_object_states.get(f"{scene.current_floor}:{item.id}", {}).get("cleanliness"),
                    "condition": scene.building_object_states.get(f"{scene.current_floor}:{item.id}", {}).get("condition"),
                    "publicWork": scene.building_object_states.get(f"{scene.current_floor}:{item.id}", {}).get("publicWork"),
                    "activeWork": scene.building_object_states.get(f"{scene.current_floor}:{item.id}", {}).get("activeWork"),
                }
                for item in scene.objects.objects
            ],
            "automationSync": {
                "state": scene.autopilot_snapshot.state,
                "message": scene.autopilot_snapshot.message,
            },
            "automationCharacters": (
                [] if scene.is_basement else scene.automation_character_states()
            ),
            "cameraFocusObjectId": (
                state.active_object_id or scene.camera_focus_object_id
            ),
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
            "activePage": state.active_page,
            "pageSource": state.page_source,
            "activeObjectId": state.active_object_id,
            "vendingCatalog": state.vending_catalog,
            "businessStockLines": state.business_stock_lines,
            "ghostListing": state.ghost_listing,
            "pestUniformWorn": state.pest_uniform_worn,
            "pestStamina": state.pest_stamina,
            "pestWorkOrders": state.pest_work_orders,
            "activePestJob": state.active_pest_job,
            "utilityWorkActive": state.utility_work_active,
            "utilityWorkTarget": state.utility_work_target,
            "utilityWorkStartedAt": state.utility_work_started_at,
            "relocationCutscenePending": state.relocation_cutscene_pending,
            "relocationCutsceneElapsed": state.relocation_cutscene_elapsed,
            "relocationCutsceneSeen": state.relocation_cutscene_seen,
            "pestJobs": PEST_JOBS,
            "meleeMoves": MELEE_MOVES,
            "staminaSupplies": [
                {
                    "itemId": str(entry.get("itemId", "")),
                    "quantity": max(1, int(entry.get("quantity", 1) or 1)),
                }
                for entry in (state.game_inventory or [])
                if str(entry.get("itemId", "")) in STAMINA_SUPPLY_ITEMS
            ],
            "musicEnabled": state.music_enabled,
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
    """Non-blocking localhost server used by the paired Godot game client."""

    def __init__(self, host: str = "127.0.0.1", port: int = 4242) -> None:
        self.host = host
        self.port = port
        self.listener: socket.socket | None = None
        self.client: socket.socket | None = None
        self.inbound = bytearray()
        self.outbound = bytearray()
        self.latest_snapshot: bytes | None = None
        self.current_frame: bytes | None = None
        self.current_frame_offset = 0
        self.current_frame_is_snapshot = False
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
            if len(self.inbound) > MAX_INBOUND_LINE_BYTES * 2:
                self._drop_client()
                break

        commands: list[dict[str, Any]] = []
        while b"\n" in self.inbound:
            raw, _, remainder = self.inbound.partition(b"\n")
            self.inbound = bytearray(remainder)
            if len(raw) > MAX_INBOUND_LINE_BYTES:
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

    def queue(self, message: dict[str, Any], *, replaceable: bool = False) -> None:
        encoded = (json.dumps(message, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")
        if len(encoded) > MAX_OUTBOUND_LINE_BYTES:
            raise ValueError(
                f"Bridge message exceeds the {MAX_OUTBOUND_LINE_BYTES}-byte outbound limit."
            )
        if replaceable:
            if self.current_frame_is_snapshot and self.current_frame_offset == 0:
                self.current_frame = None
                self.current_frame_is_snapshot = False
            self.latest_snapshot = encoded
            return
        if len(self.outbound) + len(encoded) > MAX_OUTBOUND_BUFFER_BYTES:
            raise BufferError(
                f"Bridge outbound queue exceeds the {MAX_OUTBOUND_BUFFER_BYTES}-byte limit."
            )
        self.outbound.extend(encoded)

    def send_snapshot(self, state: OfficeState, scene: TowerScene) -> None:
        self.sequence += 1
        self.queue(build_snapshot(state, scene, self.sequence), replaceable=True)

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
        while True:
            if self.current_frame is None:
                if self.outbound:
                    line_end = self.outbound.find(b"\n")
                    if line_end < 0:
                        raise RuntimeError("Bridge outbound control message is incomplete.")
                    self.current_frame = bytes(self.outbound[: line_end + 1])
                    del self.outbound[: line_end + 1]
                    self.current_frame_is_snapshot = False
                elif self.latest_snapshot is not None:
                    self.current_frame = self.latest_snapshot
                    self.latest_snapshot = None
                    self.current_frame_is_snapshot = True
                else:
                    return
            try:
                sent = self.client.send(self.current_frame[self.current_frame_offset :])
            except BlockingIOError:
                return
            except OSError:
                self._drop_client()
                return
            if sent <= 0:
                self._drop_client()
                return
            self.current_frame_offset += sent
            if self.current_frame_offset < len(self.current_frame):
                return
            self.current_frame = None
            self.current_frame_offset = 0
            self.current_frame_is_snapshot = False

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
        self.latest_snapshot = None
        self.current_frame = None
        self.current_frame_offset = 0
        self.current_frame_is_snapshot = False
        if self.listener is not None:
            self.status = f"BRIDGE LISTENING / {self.host}:{self.port}"