"""Compact walkable Shadow Tower scene for the standalone desktop client."""

from __future__ import annotations

from dataclasses import dataclass, field
import json
from math import hypot
from pathlib import Path
from typing import Literal

from .objects import (
    InteractionResult,
    OfficeObject,
    OfficeObjectRegistry,
    build_tower_object_registry,
)
from .automation import (
    AUTOMATION_CHARACTERS,
    AutopilotDomainStatus,
    AutopilotSnapshot,
    AutomationCharacter,
)
from .objects import OfficeObject


_FLOOR_PLAN_PATH = Path(__file__).resolve().parent.parent / "godot" / "office-client" / "floor_plan.json"
with _FLOOR_PLAN_PATH.open(encoding="utf-8") as _floor_plan_file:
    FLOOR_PLAN = json.load(_floor_plan_file)
FLOOR_COUNT = int(FLOOR_PLAN["floorCount"])


NPC_ROUTES: dict[str, tuple[tuple[tuple[int, int], ...], ...]] = {}

CharacterAction = Literal["stand", "jump", "sit", "sleep", "fight", "sweep", "maintenance"]


@dataclass(frozen=True)
class Room:
    id: str
    label: str
    bounds: tuple[int, int, int, int]
    accent: tuple[int, int, int]

    def contains(self, position: tuple[int, int]) -> bool:
        x, y, width, height = self.bounds
        return x <= position[0] <= x + width and y <= position[1] <= y + height


@dataclass
class TowerScene:
    """World-space scene state; drawing is intentionally kept elsewhere."""

    width: int = int(FLOOR_PLAN["world"]["width"])
    height: int = int(FLOOR_PLAN["world"]["height"])
    current_floor: int = 1
    current_room: str = "lobby"
    basement_level: int | None = None
    basement_snapshot: dict[str, object] | None = None
    player_position: tuple[int, int] = tuple(FLOOR_PLAN["rooms"][0]["spawn"])
    rooms: tuple[Room, ...] = field(
        default_factory=lambda: tuple(
            Room(
                room["id"],
                room["label"],
                tuple(room["bounds"]),
                tuple(room["accent"]),
            )
            for room in FLOOR_PLAN["rooms"]
        )
    )
    objects: OfficeObjectRegistry = field(default_factory=build_tower_object_registry)
    input_vector: tuple[float, float] = (0.0, 0.0)
    sprint_input: bool = False
    player_speed_scale: float = 1.0
    velocity: tuple[float, float] = (0.0, 0.0)
    motion_remainder: tuple[float, float] = (0.0, 0.0)
    npc_motion_seconds: float = 0.0
    player_action: CharacterAction = "stand"
    player_action_elapsed: float = 0.0
    player_action_remaining: float = 0.0
    idle_seconds: float = 0.0
    seated_chair_id: str | None = None
    building_object_states: dict[str, dict[str, int]] = field(default_factory=dict)
    opened_door_ids: set[str] = field(default_factory=set)
    _construction_signature: str = field(default="", init=False, repr=False)
    autopilot_snapshot: AutopilotSnapshot = field(
        default_factory=lambda: AutopilotSnapshot("unlinked", {}, "NO DESKTOP LINK", 0)
    )
    selected_automation_domain: str | None = None
    camera_focus_object_id: str | None = None
    camera_focus_seconds: float = 0.0

    MAX_SPEED: float = 300.0
    SPRINT_SPEED: float = 500.0
    ACCELERATION: float = 1_500.0
    FRICTION: float = 2_000.0
    AUTO_SLEEP_AFTER_SECONDS: float = 5 * 60

    @property
    def room(self) -> Room:
        return next(room for room in self.rooms if room.id == self.current_room)

    @property
    def is_basement(self) -> bool:
        return (
            self.basement_level is not None
            and 1 <= self.basement_level <= 6
            and self.current_room == f"basement_b{self.basement_level}"
        )

    def set_basement_snapshot(self, snapshot: object) -> None:
        """Keep only bounded fields consumed by local game rendering and actions."""
        self.objects.remove("tower-ghost")
        if not self.is_basement or not isinstance(snapshot, dict):
            self.basement_snapshot = None
            return
        level = snapshot.get("level")
        if level != self.basement_level:
            self.basement_snapshot = None
            return
        player = snapshot.get("player")
        building = snapshot.get("building")
        pests = snapshot.get("pests")
        crew = snapshot.get("npcCrew")
        operations = snapshot.get("towerOperations")
        normalized_pests: list[dict[str, object]] = []
        if isinstance(pests, list):
            for pest in pests:
                if not isinstance(pest, dict):
                    continue
                if (
                    not isinstance(pest.get("id"), str)
                    or pest.get("kind") not in {"rat", "snake"}
                    or not all(isinstance(pest.get(key), int) for key in ("x", "y", "health", "maxHealth"))
                    or pest.get("status") not in {"active", "carcass", "sold"}
                ):
                    continue
                x, y = int(pest["x"]), int(pest["y"])
                if not 0 <= x <= 10_000 or not 0 <= y <= 10_000:
                    continue
                normalized_pests.append({
                    "id": pest["id"][:64],
                    "kind": pest["kind"],
                    "x": x,
                    "y": y,
                    "health": max(0, int(pest["health"])),
                    "maxHealth": max(1, int(pest["maxHealth"])),
                    "status": pest["status"],
                    "bountyFiat": max(0, int(pest.get("bountyFiat", 0) or 0)),
                    "claimedByYou": pest.get("claimedByYou") is True,
                    "carcassClaimed": pest.get("carcassClaimed") is True,
                    "defeatedByYou": pest.get("defeatedByYou") is True,
                })
        normalized_crew: list[dict[str, object]] = []
        if isinstance(crew, list):
            for member in crew:
                if not isinstance(member, dict):
                    continue
                if not all(isinstance(member.get(key), int) for key in ("x", "y")):
                    continue
                normalized_crew.append({
                    "id": str(member.get("id", ""))[:64],
                    "label": str(member.get("label", "TOWER STAFF"))[:48],
                    "x": max(0, min(10_000, int(member["x"]))),
                    "y": max(0, min(10_000, int(member["y"]))),
                    "action": "working",
                })
        safe_building: dict[str, object] | None = None
        if isinstance(building, dict):
            safe_building = {}
            for key in ("powerCondition", "plumbingCondition", "upkeepCondition"):
                value = building.get(key)
                if isinstance(value, int) and not isinstance(value, bool):
                    safe_building[key] = max(0, min(100, value))
            safe_building["powerOperational"] = building.get("powerOperational") is True
            safe_building["waterOperational"] = building.get("waterOperational") is True
        safe_player: dict[str, object] = {}
        if isinstance(player, dict):
            stamina = player.get("stamina")
            if isinstance(stamina, int) and not isinstance(stamina, bool):
                safe_player["stamina"] = max(0, min(100, stamina))
            safe_player["uniformWorn"] = player.get("uniformWorn") is True
            carried_trash = player.get("carriedTrash", 0)
            safe_player["carriedTrash"] = (
                max(0, min(5, int(carried_trash)))
                if isinstance(carried_trash, int) and not isinstance(carried_trash, bool)
                else 0
            )
        safe_operations: dict[str, int] | None = None
        if isinstance(operations, dict):
            safe_operations = {
                key: max(0, min(1_000_000, int(operations[key])))
                for key in (
                    "accumulatedTrash",
                    "incomingSupplyCrates",
                    "storedSupplyCrates",
                    "processedTrash",
                )
                if isinstance(operations.get(key), int) and not isinstance(operations.get(key), bool)
            }
        drop_point = snapshot.get("carcassDropPoint")
        raw_ghost = snapshot.get("ghost")
        normalized_ghost: dict[str, object] | None = None
        if (
            isinstance(raw_ghost, dict)
            and raw_ghost.get("id") == "tower-ghost"
            and isinstance(raw_ghost.get("x"), int)
            and not isinstance(raw_ghost.get("x"), bool)
            and isinstance(raw_ghost.get("y"), int)
            and not isinstance(raw_ghost.get("y"), bool)
        ):
            ghost_x = max(0, min(10_000, int(raw_ghost["x"])))
            ghost_y = max(0, min(10_000, int(raw_ghost["y"])))
            if self._room_position_is_walkable((ghost_x, ghost_y)):
                normalized_ghost = {
                    "id": "tower-ghost",
                    "label": "THE GHOST",
                    "x": ghost_x,
                    "y": ghost_y,
                    "location": str(raw_ghost.get("location", "UNKNOWN"))[:40],
                }
                self.objects.add(
                    OfficeObject(
                        "tower-ghost",
                        "receptionist",
                        "THE GHOST",
                        self.current_room,
                        (ghost_x, ghost_y),
                        "TALK TO THE GHOST",
                    )
                )
        if not (
            isinstance(drop_point, dict)
            and isinstance(drop_point.get("x"), int)
            and isinstance(drop_point.get("y"), int)
        ):
            drop_point = {"x": 5_000, "y": 5_000}
        self.basement_snapshot = {
            "level": self.basement_level,
            "player": safe_player,
            "building": safe_building,
            "towerOperations": safe_operations,
            "pests": normalized_pests,
            "npcCrew": normalized_crew,
            "ghost": normalized_ghost,
            "carcassDropPoint": {
                "x": max(0, min(10_000, int(drop_point["x"]))),
                "y": max(0, min(10_000, int(drop_point["y"]))),
            },
        }

    @property
    def nearest_hostile(self) -> dict[str, object] | None:
        if not self.is_basement or self.basement_snapshot is None:
            return None
        pests = self.basement_snapshot.get("pests", [])
        if not isinstance(pests, list):
            return None
        targets = [
            pest for pest in pests
            if isinstance(pest, dict) and pest.get("status") == "active"
        ]
        if not targets:
            return None
        return min(
            targets,
            key=lambda pest: hypot(
                int(pest["x"]) - self.player_position[0],
                int(pest["y"]) - self.player_position[1],
            ),
        )

    @property
    def nearest_carcass(self) -> dict[str, object] | None:
        if not self.is_basement or self.basement_snapshot is None:
            return None
        pests = self.basement_snapshot.get("pests", [])
        if not isinstance(pests, list):
            return None
        targets = [
            pest for pest in pests
            if isinstance(pest, dict) and pest.get("status") == "carcass"
        ]
        if not targets:
            return None
        nearest = min(
            targets,
            key=lambda pest: hypot(
                int(pest["x"]) - self.player_position[0],
                int(pest["y"]) - self.player_position[1],
            ),
        )
        distance = hypot(
            int(nearest["x"]) - self.player_position[0],
            int(nearest["y"]) - self.player_position[1],
        )
        return nearest if distance <= 500 else None

    @property
    def danger_intensity(self) -> float:
        target = self.nearest_hostile
        if target is None:
            return 0.0
        distance = hypot(
            int(target["x"]) - self.player_position[0],
            int(target["y"]) - self.player_position[1],
        )
        return max(0.0, min(1.0, (1_800.0 - distance) / 1_800.0))

    def set_building_object_states(self, states: dict[str, dict[str, object]]) -> None:
        normalized: dict[str, dict[str, int]] = {}
        for object_id, state in states.items():
            if not isinstance(object_id, str) or not isinstance(state, dict):
                continue
            cleanliness = state.get("cleanliness")
            condition = state.get("condition")
            if (
                isinstance(cleanliness, int)
                and not isinstance(cleanliness, bool)
                and isinstance(condition, int)
                and not isinstance(condition, bool)
                and 0 <= cleanliness <= 100
                and 0 <= condition <= 100
            ):
                normalized[object_id] = {
                    "cleanliness": cleanliness,
                    "condition": condition,
                }
        self.building_object_states = normalized

    def set_construction_plans(self, plans: object) -> None:
        """Replace only server-provided Tower construction markers."""
        normalized_plans = plans if isinstance(plans, list) else []
        signature = json.dumps(normalized_plans, sort_keys=True, separators=(",", ":"))
        if signature == self._construction_signature:
            return
        self._construction_signature = signature
        self.objects.objects = [
            item for item in self.objects.objects
            if not item.id.startswith("tower-construction-")
        ]

        rooms = {
            2: "construction_f02",
            3: "construction_f03",
            4: "construction_f04",
            5: "construction_f05",
        }
        for plan in normalized_plans:
            if not isinstance(plan, dict):
                continue
            plan_id = plan.get("id")
            floor_number = plan.get("floorNumber")
            powered = plan.get("powered") is True
            tasks = plan.get("tasks")
            site_room = rooms.get(floor_number) if isinstance(floor_number, int) else None
            if not isinstance(plan_id, int) or site_room is None or not isinstance(tasks, list):
                continue
            for task in tasks:
                if not isinstance(task, dict):
                    continue
                task_id = task.get("id")
                x, y, label = task.get("x"), task.get("y"), task.get("label")
                if not isinstance(task_id, str) or not isinstance(x, int) or not isinstance(y, int):
                    continue
                if not isinstance(label, str):
                    label = "PREPARED TOWER WORK"
                is_power_export = task.get("kind") == "power_export"
                room = "basement_b5" if is_power_export else site_room
                completed = task.get("completed") is True
                working = task.get("working") is True
                working_by_you = task.get("workingByYou") is True
                status = (
                    "COMPLETE"
                    if completed
                    else "YOUR WORK IN PROGRESS"
                    if working and working_by_you
                    else "WORK IN PROGRESS"
                    if working
                    else "POWER EXPORT REQUIRED"
                    if not is_power_export and not powered
                    else "READY"
                )
                prompt = (
                    "START THE B5 AREA POWER EXPORT"
                    if is_power_export and not completed
                    else "EXPORT POWER FROM B5 BEFORE WORKING HERE"
                    if not is_power_export and not powered
                    else "START THE PREPARED ON-SITE CONSTRUCTION TASK"
                )
                self.objects.add(OfficeObject(
                    id=f"tower-construction-{plan_id}-{task_id}",
                    kind="construction_task",
                    label=f"{status} / {label}",
                    room=room,
                    position=(x, y),
                    prompt=prompt,
                    interactive=not completed and not working,
                    construction_plan_id=plan_id,
                    construction_task_id=task_id,
                    completed=completed,
                    work_progress=1.0 if completed else 0.0,
                ))

    @property
    def floor_bounds(self) -> tuple[int, int, int, int]:
        if self.is_basement:
            return self.room.bounds
        return (0, 0, self.width, self.height)

    @property
    def floor_count(self) -> int:
        return FLOOR_COUNT

    def floor_status(self, floor_number: int) -> str:
        statuses: dict[str, str] = FLOOR_PLAN.get("floorBuildStatus", {})
        if floor_number < 1:
            return str(statuses.get("basement", "under_construction"))
        exact_status = statuses.get(str(floor_number))
        if exact_status is not None:
            return str(exact_status)
        for floor_range, status in statuses.items():
            endpoints = floor_range.split("-", maxsplit=1)
            if len(endpoints) != 2:
                continue
            try:
                first_floor, last_floor = (int(endpoint) for endpoint in endpoints)
            except ValueError:
                continue
            if first_floor <= floor_number <= last_floor:
                return str(status)
        return "under_construction"

    def is_playable_floor(self, floor_number: int) -> bool:
        playable_floors: dict[str, dict[str, str]] = FLOOR_PLAN.get("playableFloors", {})
        return (
            1 <= floor_number <= self.floor_count
            and self.floor_status(floor_number) in {"open", "construction_open"}
            and str(floor_number) in playable_floors
        )

    @property
    def nearby_object(self) -> OfficeObject | None:
        if self.seated_workstation_id is not None:
            terminal = next(
                (
                    item
                    for item in self.objects.objects
                    if item.kind == "crt_terminal"
                    and item.parent_id == self.seated_workstation_id
                    and item.room == self.current_room
                    and item.interactive
                ),
                None,
            )
            if terminal is not None:
                return terminal
        return self.objects.nearby(self.player_position, room=self.current_room)

    @property
    def seated_workstation_id(self) -> str | None:
        """Return the desk parent of the exact chair occupied by the player."""
        if self.player_action != "sit" or self.seated_chair_id is None:
            return None
        chair = self.objects.get(self.seated_chair_id)
        return chair.parent_id if chair is not None and chair.kind == "chair" else None

    def is_seated_at_workstation(self, workstation_id: str | None) -> bool:
        return workstation_id is not None and self.seated_workstation_id == workstation_id

    def workstation_permission(self, workstation_id: str | None) -> str | None:
        """Return a user-facing denial, or None when the matching chair is occupied."""
        if self.player_action != "sit" or self.seated_chair_id is None:
            return "SIT TO USE COMPUTER"
        if not self.is_seated_at_workstation(workstation_id):
            return "WRONG WORKSTATION / SIT AT MATCHING CHAIR"
        return None

    def room_spawn(self, room_id: str) -> tuple[int, int]:
        for room_data in FLOOR_PLAN["rooms"]:
            if room_data["id"] == room_id:
                return tuple(room_data["spawn"])
        room = next(room for room in self.rooms if room.id == room_id)
        x, y, width, height = room.bounds
        return (x + width // 2, y + height // 2)

    def move(self, dx: int, dy: int) -> None:
        """Move inside floor bounds while respecting solid office objects."""
        if dx or dy:
            self.idle_seconds = 0.0
            if self.player_action in {"sit", "sleep"}:
                self.set_player_action("stand")
        x, y, width, height = self.floor_bounds
        current_x, current_y = self.player_position
        candidate_x = min(max(current_x + dx, x + 250), x + width - 250)
        if self._room_position_is_walkable((candidate_x, current_y)) and not self._collides_with_object((candidate_x, current_y)):
            current_x = candidate_x
        candidate_y = min(max(current_y + dy, y + 250), y + height - 250)
        if self._room_position_is_walkable((current_x, candidate_y)) and not self._collides_with_object((current_x, candidate_y)):
            current_y = candidate_y
        self.player_position = (current_x, current_y)
        # The lobby is the whole-world fallback room, so it contains every
        # office as well. Prefer the smallest physical room that contains the
        # player; otherwise any movement inside an office immediately snapped
        # the scene back to the empty lobby.
        containing_rooms = [
            candidate
            for candidate in self.rooms
            if candidate.id != "lobby"
            and not candidate.id.startswith("basement_b")
            and candidate.contains(self.player_position)
        ]
        if self.is_basement:
            pass
        elif containing_rooms:
            self.current_room = min(
                containing_rooms,
                key=lambda candidate: candidate.bounds[2] * candidate.bounds[3],
            ).id
        elif next((room for room in self.rooms if room.id == "lobby"), None) is not None:
            self.current_room = "lobby"

    def _collides_with_object(self, position: tuple[int, int]) -> bool:
        """Use simple axis-aligned footprints so movement slides around props."""
        player_half_width, player_half_height = (90, 90)
        if self.current_room == "basement_b1":
            b1_layout = FLOOR_PLAN["businessSuiteLayout"]["b1"]
            interior_half = b1_layout["interiorBusinessHalf"]
            divider_x = int(interior_half[0]) + int(interior_half[2])
            access_y = int(b1_layout["yardAccess"][1])
            gate_half_width = 150
            if (
                abs(position[0] - divider_x) <= player_half_width + 15
                and abs(position[1] - access_y) > gate_half_width + player_half_height
            ):
                return True
        for item in self.objects.objects:
            if item.room != self.current_room:
                continue
            object_half_width, object_half_height = item.collision_half_extents
            if object_half_width <= 0 or object_half_height <= 0:
                continue
            object_x, object_y = item.visual_position
            if (
                abs(position[0] - object_x) <= player_half_width + object_half_width
                and abs(position[1] - object_y) <= player_half_height + object_half_height
            ):
                return True
        return False

    def _room_position_is_walkable(self, position: tuple[int, int]) -> bool:
        if not self.room.contains(position):
            return False
        if self.current_room in {"basement_b4", "basement_b5", "basement_b6"}:
            room_data = next(
                (room for room in FLOOR_PLAN["rooms"] if room["id"] == self.current_room),
                None,
            )
            maze_cells = room_data.get("mazeCells") if room_data else None
            if not isinstance(maze_cells, list):
                return False
            cell_size = int(room_data.get("mazeCellUnits", 1_000))
            if cell_size <= 0:
                return False
            cell = (position[0] // cell_size, position[1] // cell_size)
            return any(
                isinstance(maze_cell, list)
                and len(maze_cell) == 2
                and (int(maze_cell[0]), int(maze_cell[1])) == cell
                for maze_cell in maze_cells
            )
        if self.current_room == "recreation":
            regions = FLOOR_PLAN["baseLayout"]["walkableHallways"]
            return any(
                int(region[0]) <= position[0] <= int(region[0]) + int(region[2])
                and int(region[1]) <= position[1] <= int(region[1]) + int(region[3])
                for region in regions
            )
        if self.current_room == "executive":
            suite = FLOOR_PLAN["baseLayout"]["executiveSuite"]["bounds"]
            inside_suite = (
                int(suite[0]) <= position[0] <= int(suite[0]) + int(suite[2])
                and int(suite[1]) <= position[1] <= int(suite[1]) + int(suite[3])
            )
            return not inside_suite
        return True

    def set_motion_input(self, x: float, y: float, *, sprint: bool = False) -> None:
        """Set bounded locomotion intent received from the Godot game client."""
        self.input_vector = (
            max(-1.0, min(1.0, float(x))),
            max(-1.0, min(1.0, float(y))),
        )
        self.sprint_input = bool(sprint)
        if hypot(*self.input_vector) > 0:
            self.idle_seconds = 0.0
            if self.player_action in {"sit", "sleep"}:
                self.set_player_action("stand")

    def update_motion(self, delta_seconds: float) -> None:
        """Apply normalized acceleration/friction without duplicating authority."""
        if delta_seconds <= 0:
            return
        if self.camera_focus_seconds > 0:
            self.camera_focus_seconds = max(
                0.0, self.camera_focus_seconds - delta_seconds
            )
            if self.camera_focus_seconds == 0:
                self.camera_focus_object_id = None
        self.player_action_elapsed += delta_seconds
        if self.player_action_remaining > 0:
            self.player_action_remaining = max(
                0.0, self.player_action_remaining - delta_seconds
            )
            if self.player_action_remaining == 0:
                self.set_player_action("stand", reset_idle=False)
        if self.player_action in {"sit", "sleep"}:
            self.velocity = (0.0, 0.0)
            self.input_vector = (0.0, 0.0)
            return
        input_x, input_y = self.input_vector
        input_length = hypot(input_x, input_y)
        if input_length > 0:
            self.idle_seconds = 0.0
            direction_x = input_x / input_length
            direction_y = input_y / input_length
            target_speed = (self.SPRINT_SPEED if self.sprint_input else self.MAX_SPEED) * self.player_speed_scale
            target_x = direction_x * target_speed
            target_y = direction_y * target_speed
            rate = self.ACCELERATION * delta_seconds
        else:
            target_x = 0.0
            target_y = 0.0
            rate = self.FRICTION * delta_seconds

        velocity_x, velocity_y = self.velocity
        velocity_x = self._move_toward(velocity_x, target_x, rate)
        velocity_y = self._move_toward(velocity_y, target_y, rate)
        remainder_x, remainder_y = self.motion_remainder
        travel_x = velocity_x * delta_seconds + remainder_x
        travel_y = velocity_y * delta_seconds + remainder_y
        step_x = int(travel_x)
        step_y = int(travel_y)
        self.motion_remainder = (travel_x - step_x, travel_y - step_y)
        self.velocity = (velocity_x, velocity_y)
        if step_x or step_y:
            self.idle_seconds = 0.0
            self.move(step_x, step_y)
        elif velocity_x == 0.0 and velocity_y == 0.0:
            self.idle_seconds += delta_seconds
            if (
                self.idle_seconds >= self.AUTO_SLEEP_AFTER_SECONDS
                and self.player_action != "sleep"
            ):
                self.set_player_action("sleep", reset_idle=False)

    def set_player_action(
        self,
        action: CharacterAction,
        *,
        duration: float = 0.0,
        reset_idle: bool = True,
    ) -> bool:
        """Set a grounded action; sitting attaches the player to a nearby chair."""
        if action not in {"stand", "jump", "sit", "sleep", "fight", "sweep", "maintenance"}:
            return False
        if action == "sit":
            chairs = [
                item
                for item in self.objects.objects
                if item.room == self.current_room
                and item.kind == "chair"
                and item.interactive
            ]
            if not chairs:
                return False
            chair = min(
                chairs,
                key=lambda item: hypot(
                    item.position[0] - self.player_position[0],
                    item.position[1] - self.player_position[1],
                ),
            )
            if hypot(
                chair.position[0] - self.player_position[0],
                chair.position[1] - self.player_position[1],
            ) > 450:
                return False
            self.player_position = chair.position
            self.seated_chair_id = chair.id
        else:
            self.seated_chair_id = None
        self.player_action = action
        self.player_action_elapsed = 0.0
        self.player_action_remaining = max(0.0, duration)
        if reset_idle:
            self.idle_seconds = 0.0
        return True

    def update_npc_motion(self, delta_seconds: float) -> None:
        """Advance deterministic office routes independently of player input."""
        if delta_seconds > 0:
            self.npc_motion_seconds += delta_seconds

    def set_autopilot_snapshot(self, snapshot: AutopilotSnapshot) -> None:
        self.autopilot_snapshot = snapshot

    def automation_domain_status(
        self,
        profile: AutomationCharacter,
    ) -> AutopilotDomainStatus | None:
        if self.autopilot_snapshot.state != "connected":
            return None
        return self.autopilot_snapshot.domains.get(profile.domain)

    def automation_pose(
        self,
        profile: AutomationCharacter,
    ) -> tuple[tuple[int, int], str, str]:
        """Walk between workstations and pause long enough to show each task."""
        status = self.automation_domain_status(profile)
        if status is None:
            activity = self.autopilot_snapshot.message or "LINK DESKTOP"
            return profile.route[0], "down", activity
        if not status.enabled:
            return profile.route[0], "down", "AUTOMATION OFF"

        dwell_seconds = 2.1
        cycle = 0.0
        segment_lengths: list[float] = []
        for start, end in zip(profile.route, profile.route[1:] + profile.route[:1]):
            length = hypot(end[0] - start[0], end[1] - start[1])
            segment_lengths.append(length)
            cycle += dwell_seconds + length / profile.speed
        if cycle <= 0:
            return profile.route[0], "down", profile.work_stops[0]

        elapsed = (self.npc_motion_seconds + profile.phase_seconds) % cycle
        for index, (start, end) in enumerate(zip(profile.route, profile.route[1:] + profile.route[:1])):
            if elapsed < dwell_seconds:
                return start, "down", profile.work_stops[index]
            elapsed -= dwell_seconds
            length = segment_lengths[index]
            travel_seconds = length / profile.speed
            if elapsed < travel_seconds:
                ratio = elapsed / max(0.001, travel_seconds)
                x = round(start[0] + (end[0] - start[0]) * ratio)
                y = round(start[1] + (end[1] - start[1]) * ratio)
                dx = end[0] - start[0]
                dy = end[1] - start[1]
                facing = "right" if abs(dx) > abs(dy) and dx > 0 else "left" if abs(dx) > abs(dy) else "down" if dy > 0 else "up"
                return (x, y), facing, f"TO {profile.work_stops[(index + 1) % len(profile.work_stops)]}"
            elapsed -= travel_seconds
        return profile.route[0], "down", profile.work_stops[0]

    @property
    def nearby_automation_character(self) -> AutomationCharacter | None:
        if self.current_floor != 1:
            return None
        candidates = []
        for profile in AUTOMATION_CHARACTERS:
            if profile.room_id != self.current_room:
                continue
            if self.autopilot_snapshot.state == "connected" and profile.domain not in self.autopilot_snapshot.domains:
                continue
            position, _, _ = self.automation_pose(profile)
            distance = hypot(position[0] - self.player_position[0], position[1] - self.player_position[1])
            if distance <= 260:
                candidates.append((distance, profile))
        return min(candidates, key=lambda item: item[0])[1] if candidates else None

    def automation_character_states(self) -> list[dict[str, object]]:
        if self.current_floor != 1:
            return []
        result: list[dict[str, object]] = []
        for profile in AUTOMATION_CHARACTERS:
            if profile.room_id != self.current_room:
                continue
            if self.autopilot_snapshot.state == "connected" and profile.domain not in self.autopilot_snapshot.domains:
                continue
            (x, y), facing, activity = self.automation_pose(profile)
            status = self.automation_domain_status(profile)
            result.append({
                "domain": profile.domain,
                "name": profile.name,
                "role": profile.role,
                "room": profile.room_id,
                "x": x,
                "y": y,
                "facing": facing,
                "activity": activity,
                "enabled": status.enabled if status else None,
                "lastRunAt": status.last_run_at if status else None,
                "syncState": self.autopilot_snapshot.state,
                "sprite": profile.sprite,
                "accent": list(profile.accent),
            })
        return result

    def npc_pose(self, room_id: str, index: int) -> tuple[tuple[int, int], str] | None:
        """Return an NPC's current route position and cardinal facing."""
        routes = NPC_ROUTES.get(room_id)
        if routes is None or index >= len(routes):
            return None
        route = routes[index]
        segment_lengths = []
        total_length = 0.0
        for start, end in zip(route, route[1:] + route[:1]):
            length = hypot(end[0] - start[0], end[1] - start[1])
            segment_lengths.append(length)
            total_length += length
        if total_length <= 0:
            return route[0], "down"

        # Small phase offsets keep the three workers from marching in lockstep.
        distance = (self.npc_motion_seconds * (72.0 + index * 9.0) + index * total_length / 3.0) % total_length
        travelled = 0.0
        for segment_index, (start, end) in enumerate(zip(route, route[1:] + route[:1])):
            segment_length = segment_lengths[segment_index]
            if distance <= travelled + segment_length:
                ratio = (distance - travelled) / max(1.0, segment_length)
                x = round(start[0] + (end[0] - start[0]) * ratio)
                y = round(start[1] + (end[1] - start[1]) * ratio)
                dx = end[0] - start[0]
                dy = end[1] - start[1]
                facing = "right" if abs(dx) > abs(dy) and dx > 0 else "left" if abs(dx) > abs(dy) else "down" if dy > 0 else "up"
                return (x, y), facing
            travelled += segment_length
        return route[0], "down"

    @staticmethod
    def _move_toward(current: float, target: float, amount: float) -> float:
        if abs(target - current) <= amount:
            return target
        return current + amount if target > current else current - amount

    def interact(self, state: "OfficeState", object_id: str | None = None, *, vending_item: str = "coffee") -> InteractionResult:
        if object_id is None:
            agent = self.nearby_automation_character
            if agent is not None:
                self.selected_automation_domain = agent.domain
                state.open_page("automation", from_object=True, source=agent.name)
                message = f"INSPECT / {agent.name} · {agent.domain.replace('_', ' ').upper()}"
                state.notice = message
                return InteractionResult(True, message)
        target = object_id or (self.nearby_object.id if self.nearby_object else None)
        if target is None:
            message = "NO OBJECT IN RANGE"
            state.notice = message
            return InteractionResult(False, message)
        return self.objects.interact(target, state, self, vending_item=vending_item)

    def toggle_door(self, door_id: str) -> bool:
        """Toggle an interactive door that does not change rooms."""
        if door_id in self.opened_door_ids:
            self.opened_door_ids.remove(door_id)
            return False
        self.opened_door_ids.add(door_id)
        return True

    def focus_on_interaction(self, office_object: OfficeObject) -> None:
        """Briefly focus an approved service object after a game interaction."""
        if office_object.camera_focus_enabled:
            self.camera_focus_object_id = office_object.id
            self.camera_focus_seconds = 2.25
        else:
            self.camera_focus_object_id = None
            self.camera_focus_seconds = 0.0

    def select_room(self, room_id: str) -> bool:
        if self.is_basement:
            return False
        if not any(room.id == room_id for room in self.rooms):
            return False
        if room_id.startswith("basement_b"):
            return False
        room_floors = {
            "lobby": 1,
            "recreation": 6,
            "executive": 6,
            "public": 6,
            "office_03": 6,
            "office_04": 6,
            "executive_suite": 6,
            "floor07_business": 7,
        }
        if room_id in room_floors and self.current_floor != room_floors[room_id]:
            return False
        if room_id == "executive_suite":
            door = self.objects.get("executive-suite-door")
            if self.current_room != "executive" or door is None or hypot(
                door.position[0] - self.player_position[0],
                door.position[1] - self.player_position[1],
            ) > 600:
                return False
        elif room_id == "executive" and self.current_room == "executive_suite":
            door = self.objects.get("executive-suite-exit")
            if door is None or hypot(
                door.position[0] - self.player_position[0],
                door.position[1] - self.player_position[1],
            ) > 600:
                return False
        self._place_at_room_spawn(room_id)
        return True

    def return_from_denied_executive_suite(self) -> bool:
        """Undo the local room transition when the server rejects suite access."""
        if self.current_room != "executive_suite":
            return False
        self._place_at_room_spawn("executive")
        return True

    def _place_at_room_spawn(self, room_id: str) -> None:
        previous_room = self.current_room
        self.camera_focus_object_id = None
        self.camera_focus_seconds = 0.0
        self.current_room = room_id
        self.basement_level = (
            int(room_id.removeprefix("basement_b"))
            if room_id.startswith("basement_b")
            else None
        )
        if self.basement_level is None or previous_room != room_id:
            self.basement_snapshot = None
        self.player_position = self.room_spawn(room_id)
        self.input_vector = (0.0, 0.0)
        self.velocity = (0.0, 0.0)
        self.motion_remainder = (0.0, 0.0)
        self.set_player_action("stand")

    def select_basement_level(self, level: int) -> bool:
        """Apply only a server-authorized B-level transition."""
        if not isinstance(level, int) or isinstance(level, bool) or not 1 <= level <= 6:
            return False
        previous_position = self.player_position if self.is_basement else None
        if not self._place_basement_level(level):
            return False
        if previous_position is not None:
            self.player_position = previous_position
        return True

    def leave_basement(self) -> bool:
        if not self.is_basement or self.basement_level != 1:
            return False
        self.current_floor = 1
        self._place_at_room_spawn("lobby")
        back_entry = FLOOR_PLAN["businessSuiteLayout"]["lobbyBackEntrance"]
        self.player_position = (int(back_entry[0]), int(back_entry[1]))
        return True

    def _place_basement_level(self, level: int) -> bool:
        room_id = f"basement_b{level}"
        if not any(room.id == room_id for room in self.rooms):
            return False
        self._place_at_room_spawn(room_id)
        return True

    def select_floor(self, floor: int) -> bool:
        if self.is_basement or not self.is_playable_floor(floor):
            return False
        floor_data: dict[str, dict[str, str]] = FLOOR_PLAN["playableFloors"][str(floor)]
        destination_room = floor_data["room"]
        self.current_floor = floor
        self._place_at_room_spawn(destination_room)
        return True

    def climb_stairs(self) -> bool:
        """Advance one physical floor without invoking the elevator transition."""
        next_floor = self.current_floor + 1
        if not self.is_playable_floor(next_floor):
            return False
        return self.select_floor(next_floor)


def build_tower_scene() -> TowerScene:
    return TowerScene()