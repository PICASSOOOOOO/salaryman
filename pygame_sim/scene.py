"""Compact walkable Shadow Tower scene for the standalone desktop client."""

from __future__ import annotations

from dataclasses import dataclass, field
import json
from math import hypot
from pathlib import Path
from typing import Literal

from .objects import (
    EXECUTIVE_SHOWCASE_OBJECT_IDS,
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


_FLOOR_PLAN_PATH = Path(__file__).resolve().parent.parent / "godot" / "office-client" / "floor_plan.json"
with _FLOOR_PLAN_PATH.open(encoding="utf-8") as _floor_plan_file:
    FLOOR_PLAN = json.load(_floor_plan_file)
FLOOR_COUNT = int(FLOOR_PLAN["floorCount"])


NPC_ROUTES: dict[str, tuple[tuple[tuple[int, int], ...], ...]] = {
    "executive": (
        ((1_000, 5_500), (1_000, 5_900), (1_000, 6_500), (1_000, 7_300)),
        ((2_600, 5_500), (2_600, 5_900), (2_600, 6_500), (2_600, 7_300)),
        ((1_800, 5_500), (1_800, 6_000), (1_800, 6_600), (1_800, 7_300)),
    ),
    "public": (
        ((3_350, 6_850), (3_620, 6_850), (3_620, 7_080), (3_350, 7_080)),
        ((4_150, 6_900), (4_400, 6_900), (4_400, 6_650), (4_150, 6_650)),
        ((4_250, 6_150), (4_450, 6_150), (4_450, 6_380), (4_250, 6_380)),
    ),
    "office_03": (
        ((5_450, 6_850), (5_720, 6_850), (5_720, 7_080), (5_450, 7_080)),
        ((6_250, 6_900), (6_500, 6_900), (6_500, 6_650), (6_250, 6_650)),
        ((6_350, 6_150), (6_550, 6_150), (6_550, 6_380), (6_350, 6_380)),
    ),
    "office_04": (
        ((7_550, 6_850), (7_820, 6_850), (7_820, 7_080), (7_550, 7_080)),
        ((8_350, 6_900), (8_600, 6_900), (8_600, 6_650), (8_350, 6_650)),
        ((8_450, 6_150), (8_650, 6_150), (8_650, 6_380), (8_450, 6_380)),
    ),
}

CharacterAction = Literal["stand", "jump", "sit", "sleep", "fight", "sweep"]


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
    velocity: tuple[float, float] = (0.0, 0.0)
    motion_remainder: tuple[float, float] = (0.0, 0.0)
    npc_motion_seconds: float = 0.0
    player_action: CharacterAction = "stand"
    player_action_elapsed: float = 0.0
    player_action_remaining: float = 0.0
    idle_seconds: float = 0.0
    seated_chair_id: str | None = None
    autopilot_snapshot: AutopilotSnapshot = field(
        default_factory=lambda: AutopilotSnapshot("unlinked", {}, "NO DESKTOP LINK", 0)
    )
    selected_automation_domain: str | None = None

    MAX_SPEED: float = 300.0
    SPRINT_SPEED: float = 500.0
    ACCELERATION: float = 1_500.0
    FRICTION: float = 2_000.0
    AUTO_SLEEP_AFTER_SECONDS: float = 5 * 60

    @property
    def room(self) -> Room:
        return next(room for room in self.rooms if room.id == self.current_room)

    @property
    def floor_bounds(self) -> tuple[int, int, int, int]:
        return (0, 0, self.width, self.height)

    @property
    def floor_count(self) -> int:
        return FLOOR_COUNT

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
        if not self._collides_with_object((candidate_x, current_y)):
            current_x = candidate_x
        candidate_y = min(max(current_y + dy, y + 250), y + height - 250)
        if not self._collides_with_object((current_x, candidate_y)):
            current_y = candidate_y
        self.player_position = (current_x, current_y)
        # The lobby is the whole-world fallback room, so it contains every
        # office as well. Prefer the smallest physical room that contains the
        # player; otherwise any movement inside an office immediately snapped
        # the scene back to the empty lobby.
        containing_rooms = [
            candidate
            for candidate in self.rooms
            if candidate.id != "lobby" and candidate.contains(self.player_position)
        ]
        if containing_rooms:
            self.current_room = min(
                containing_rooms,
                key=lambda candidate: candidate.bounds[2] * candidate.bounds[3],
            ).id
        elif next((room for room in self.rooms if room.id == "lobby"), None) is not None:
            self.current_room = "lobby"

    def _collides_with_object(self, position: tuple[int, int]) -> bool:
        """Use simple axis-aligned footprints so movement slides around props."""
        player_half_width, player_half_height = (90, 90)
        for item in self.objects.objects:
            if item.room != self.current_room:
                continue
            if (
                self.current_room == "executive"
                and item.id not in EXECUTIVE_SHOWCASE_OBJECT_IDS
            ):
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
            target_speed = self.SPRINT_SPEED if self.sprint_input else self.MAX_SPEED
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
        if action not in {"stand", "jump", "sit", "sleep", "fight", "sweep"}:
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

    def select_room(self, room_id: str) -> bool:
        if not any(room.id == room_id for room in self.rooms):
            return False
        self.current_room = room_id
        self.player_position = self.room_spawn(room_id)
        self.input_vector = (0.0, 0.0)
        self.velocity = (0.0, 0.0)
        self.motion_remainder = (0.0, 0.0)
        self.set_player_action("stand")
        return True

    def select_floor(self, floor: int) -> bool:
        if floor < 1 or floor > self.floor_count:
            return False
        self.current_floor = floor
        self.current_room = "lobby"
        self.player_position = self.room_spawn("lobby")
        self.input_vector = (0.0, 0.0)
        self.velocity = (0.0, 0.0)
        self.motion_remainder = (0.0, 0.0)
        self.set_player_action("stand")
        return True


def build_tower_scene() -> TowerScene:
    return TowerScene()