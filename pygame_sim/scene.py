"""Compact walkable Shadow Tower scene for the standalone desktop client."""

from __future__ import annotations

from dataclasses import dataclass, field
import json
from math import hypot
from pathlib import Path

from .objects import InteractionResult, OfficeObject, OfficeObjectRegistry, build_tower_object_registry


_FLOOR_PLAN_PATH = Path(__file__).resolve().parent.parent / "godot" / "office-client" / "floor_plan.json"
with _FLOOR_PLAN_PATH.open(encoding="utf-8") as _floor_plan_file:
    FLOOR_PLAN = json.load(_floor_plan_file)


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

    width: int = 10_000
    height: int = 10_000
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
    velocity: tuple[float, float] = (0.0, 0.0)
    motion_remainder: tuple[float, float] = (0.0, 0.0)

    MAX_SPEED: float = 300.0
    ACCELERATION: float = 1_500.0
    FRICTION: float = 2_000.0

    @property
    def room(self) -> Room:
        return next(room for room in self.rooms if room.id == self.current_room)

    @property
    def nearby_object(self) -> OfficeObject | None:
        return self.objects.nearby(self.player_position, room=self.current_room)

    def room_spawn(self, room_id: str) -> tuple[int, int]:
        for room_data in FLOOR_PLAN["rooms"]:
            if room_data["id"] == room_id:
                return tuple(room_data["spawn"])
        room = next(room for room in self.rooms if room.id == room_id)
        x, y, width, height = room.bounds
        return (x + width // 2, y + height // 2)

    def move(self, dx: int, dy: int) -> None:
        """Move the cursor/player inside the current room's physical bounds."""
        x, y, width, height = self.room.bounds
        px = min(max(self.player_position[0] + dx, x + 250), x + width - 250)
        py = min(max(self.player_position[1] + dy, y + 250), y + height - 250)
        self.player_position = (px, py)
        for candidate in self.rooms:
            if candidate.contains(self.player_position):
                self.current_room = candidate.id
                break

    def set_motion_input(self, x: float, y: float) -> None:
        """Set a bounded input vector received from the Godot renderer."""
        self.input_vector = (
            max(-1.0, min(1.0, float(x))),
            max(-1.0, min(1.0, float(y))),
        )

    def update_motion(self, delta_seconds: float) -> None:
        """Apply normalized acceleration/friction without duplicating authority."""
        if delta_seconds <= 0:
            return
        input_x, input_y = self.input_vector
        input_length = hypot(input_x, input_y)
        if input_length > 0:
            direction_x = input_x / input_length
            direction_y = input_y / input_length
            target_x = direction_x * self.MAX_SPEED
            target_y = direction_y * self.MAX_SPEED
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
            self.move(step_x, step_y)

    @staticmethod
    def _move_toward(current: float, target: float, amount: float) -> float:
        if abs(target - current) <= amount:
            return target
        return current + amount if target > current else current - amount

    def interact(self, state: "OfficeState", object_id: str | None = None, *, vending_item: str = "coffee") -> InteractionResult:
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
        return True


def build_tower_scene() -> TowerScene:
    return TowerScene()