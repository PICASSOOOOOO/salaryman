"""Compact walkable Shadow Tower scene for the standalone desktop client."""

from __future__ import annotations

from dataclasses import dataclass, field

from .objects import InteractionResult, OfficeObject, OfficeObjectRegistry, build_tower_object_registry


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
    player_position: tuple[int, int] = (1_700, 2_400)
    rooms: tuple[Room, ...] = field(
        default_factory=lambda: (
            Room("lobby", "TOWER LOBBY", (700, 1_000, 3_200, 3_200), (27, 112, 110)),
            Room("recreation", "RECREATION / ARCADE", (1_000, 5_200, 8_000, 2_200), (72, 94, 130)),
            Room("executive", "EXECUTIVE CORNER OFFICE", (5_100, 1_000, 3_800, 3_200), (112, 83, 115)),
            Room("public", "FLOOR HALLWAY", (700, 1_000, 8_200, 6_800), (38, 87, 94)),
        )
    )
    objects: OfficeObjectRegistry = field(default_factory=build_tower_object_registry)

    @property
    def room(self) -> Room:
        return next(room for room in self.rooms if room.id == self.current_room)

    @property
    def nearby_object(self) -> OfficeObject | None:
        return self.objects.nearby(self.player_position, room=self.current_room)

    def room_spawn(self, room_id: str) -> tuple[int, int]:
        spawn_points = {
            "lobby": (1_700, 2_400),
            "recreation": (1_500, 5_900),
            "executive": (5_700, 2_000),
            "public": (4_900, 4_900),
        }
        if room_id in spawn_points:
            return spawn_points[room_id]
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
            if candidate.id != "public" and candidate.contains(self.player_position):
                self.current_room = candidate.id
                break

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
        return True


def build_tower_scene() -> TowerScene:
    return TowerScene()