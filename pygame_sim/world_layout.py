"""Shared first-floor layout data and legacy object-coordinate mapping."""

from __future__ import annotations

import json
import math
from pathlib import Path


FLOOR_PLAN_PATH = (
    Path(__file__).resolve().parent.parent
    / "godot"
    / "office-client"
    / "floor_plan.json"
)
with FLOOR_PLAN_PATH.open(encoding="utf-8") as floor_plan_file:
    FLOOR_PLAN = json.load(floor_plan_file)


TOWER_LINEAR_SCALE = math.sqrt(8.0)
LOBBY_COORDINATE_ANCHOR = (49_978_000, 50_000_000)

# Fixed gameplay objects were authored against the original compact rooms.
# Their room-relative positions are expanded into the new first-floor plan.
LEGACY_ROOM_BOUNDS: dict[str, tuple[int, int, int, int]] = {
    "recreation": (700, 3400, 8300, 1800),
    "executive": (900, 5200, 1800, 2200),
    "public": (3000, 5200, 1800, 2200),
    "office_03": (5100, 5200, 1800, 2200),
    "office_04": (7200, 5200, 1800, 2200),
}


def map_legacy_room_position(
    room_id: str,
    position: tuple[int, int],
) -> tuple[int, int]:
    """Map a legacy room-local point into the expanded floor-plan envelope."""
    legacy = LEGACY_ROOM_BOUNDS.get(room_id)
    target = next(
        (
            room
            for room in FLOOR_PLAN["rooms"]
            if room["id"] == room_id
        ),
        None,
    )
    if legacy is None or target is None:
        return position

    old_x, old_y, old_width, old_height = legacy
    new_x, new_y, _, _ = target["bounds"]
    offset_x = min(max(position[0] - old_x, 0), old_width)
    offset_y = min(max(position[1] - old_y, 0), old_height)
    return (
        round(new_x + offset_x * TOWER_LINEAR_SCALE),
        round(new_y + offset_y * TOWER_LINEAR_SCALE),
    )


def scale_legacy_position(room_id: str, position: tuple[int, int]) -> tuple[int, int]:
    """Scale an old point while leaving the physical size of its object unchanged."""
    x, y = position
    if room_id == "lobby":
        anchor_x, anchor_y = LOBBY_COORDINATE_ANCHOR
        return (
            round(anchor_x + (x - anchor_x) * TOWER_LINEAR_SCALE),
            round(anchor_y + (y - anchor_y) * TOWER_LINEAR_SCALE),
        )
    return round(x * TOWER_LINEAR_SCALE), round(y * TOWER_LINEAR_SCALE)
