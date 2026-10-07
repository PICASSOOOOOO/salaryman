#!/usr/bin/env python3
"""One-time, idempotent expansion of the canonical Tower floor plan."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
PLAN_PATH = ROOT / "godot" / "office-client" / "floor_plan.json"
LINEAR_SCALE = math.sqrt(8.0)
LOBBY_ANCHOR = (49_978_000, 50_000_000)
ABSOLUTE_COORDINATE_THRESHOLD = 1_000_000

RECT_KEYS = {"bounds", "outerBounds"}
RECT_LIST_KEYS = {"hallways", "walkableHallways"}
POINT_KEYS = {
    "door",
    "entrance",
    "exteriorGate",
    "lobbyBackEntrance",
    "lobbyPosition",
    "officeWindow",
    "outsideWindow",
    "position",
    "renderOffset",
    "spawn",
    "standardFloorPosition",
    "basementPosition",
    "yardAccess",
}
POINT_LIST_KEYS = {"hallwayFixtures", "points", "positions"}
DIMENSION_KEYS = {"clearEnvelopeMeters", "clearEnvelopeUnits", "officeDimensionsMeters"}


def _scaled(value: float) -> int:
    return int(round(value * LINEAR_SCALE))


def _is_absolute(x: float, y: float) -> bool:
    return max(abs(x), abs(y)) >= ABSOLUTE_COORDINATE_THRESHOLD


def _scale_point(point: list[Any]) -> list[Any]:
    x, y = float(point[0]), float(point[1])
    anchor_x, anchor_y = LOBBY_ANCHOR if _is_absolute(x, y) else (0, 0)
    scaled_x = int(round(anchor_x + (x - anchor_x) * LINEAR_SCALE))
    scaled_y = int(round(anchor_y + (y - anchor_y) * LINEAR_SCALE))
    return [scaled_x, scaled_y, *point[2:]]


def _scale_rect(rect: list[Any]) -> list[Any]:
    x, y, width, height = (float(value) for value in rect[:4])
    anchor_x, anchor_y = LOBBY_ANCHOR if _is_absolute(x, y) else (0, 0)
    scaled_x = int(round(anchor_x + (x - anchor_x) * LINEAR_SCALE))
    scaled_y = int(round(anchor_y + (y - anchor_y) * LINEAR_SCALE))
    return [
        scaled_x,
        scaled_y,
        _scaled(width),
        _scaled(height),
        *rect[4:],
    ]


def _scale_point_list(value: list[Any]) -> list[Any]:
    if len(value) >= 2 and all(isinstance(part, (int, float)) for part in value[:2]):
        return _scale_point(value)
    return [
        _scale_point(point) if isinstance(point, list) and len(point) >= 2 else point
        for point in value
    ]


def _scale_geometry(node: Any, key: str = "") -> Any:
    if isinstance(node, dict):
        return {child_key: _scale_geometry(value, child_key) for child_key, value in node.items()}
    if not isinstance(node, list):
        if key == "lobbyHallwayOpening" and isinstance(node, (int, float)):
            return _scaled(node)
        return node
    if key in RECT_KEYS and len(node) >= 4 and all(
        isinstance(part, (int, float)) for part in node[:4]
    ):
        return _scale_rect(node)
    if key in RECT_LIST_KEYS:
        return [
            _scale_rect(rect) if isinstance(rect, list) and len(rect) >= 4 else rect
            for rect in node
        ]
    if key in POINT_KEYS and len(node) >= 2 and all(
        isinstance(part, (int, float)) for part in node[:2]
    ):
        return _scale_point(node)
    if key in POINT_LIST_KEYS:
        return _scale_point_list(node)
    if key in DIMENSION_KEYS:
        return [_scaled(value) if isinstance(value, (int, float)) else value for value in node]
    if key == "officeDoorCenters":
        return [_scaled(value) if isinstance(value, (int, float)) else value for value in node]
    if key in {"collisionHalfExtents", "mazeCells"}:
        return node
    return [_scale_geometry(value) for value in node]


def _serialize_json(value: Any, depth: int = 0) -> str:
    indent = "  " * depth
    compact = json.dumps(value, ensure_ascii=False, separators=(", ", ": "))
    scalar = lambda item: item is None or isinstance(item, (str, int, float, bool))
    inlineable = scalar(value) or (
        isinstance(value, list) and all(scalar(item) for item in value)
    ) or (
        isinstance(value, dict)
        and all(
            scalar(item)
            or (isinstance(item, list) and all(scalar(part) for part in item))
            for item in value.values()
        )
    )
    if inlineable and len(indent) + len(compact) <= 150:
        return compact
    if isinstance(value, dict):
        if not value:
            return "{}"
        entries = []
        for key, child in value.items():
            rendered = _serialize_json(child, depth + 1)
            entries.append(f'{"  " * (depth + 1)}{json.dumps(key, ensure_ascii=False)}: {rendered}')
        return "{\n" + ",\n".join(entries) + f"\n{indent}" + "}"
    if isinstance(value, list):
        if not value:
            return "[]"
        entries = [
            "  " * (depth + 1) + _serialize_json(child, depth + 1)
            for child in value
        ]
        return "[\n" + ",\n".join(entries) + f"\n{indent}]"
    return json.dumps(value, ensure_ascii=False)


def _set_expanded_standard_floor(plan: dict[str, Any]) -> None:
    base = plan["baseLayout"]
    layout = plan["businessSuiteLayout"]
    width = _scaled(22_000)
    height = _scaled(25_000)
    base["clearEnvelopeUnits"] = [width, height]
    main_width = 1_200
    west_width = (width - main_width + 1) // 2
    main_left = west_width
    main_right = main_left + main_width
    east_width = width - main_right
    top_depth = _scaled(11_000)
    cross_depth = 800
    lower_y = top_depth + cross_depth
    lower_depth = _scaled(11_000)

    west_half = west_width // 2
    east_half = east_width // 2
    west_second = west_half
    east_second = main_right + east_half
    row_bounds = [
        [0, 0, west_half, top_depth],
        [west_second, 0, west_width - west_half, top_depth],
        [main_right, 0, east_half, top_depth],
        [east_second, 0, east_width - east_half, top_depth],
        [0, lower_y, west_half, lower_depth],
        [west_second, lower_y, west_width - west_half, lower_depth],
        [main_right, lower_y, east_half, lower_depth],
        [east_second, lower_y, east_width - east_half, lower_depth],
    ]
    layout["standardFloorUnits"] = [
        {
            "unitNumber": index,
            "bounds": bounds,
            "doorSide": "south" if index <= 4 else "north",
        }
        for index, bounds in enumerate(row_bounds, start=1)
    ]
    layout["fourUnitFloorUnits"] = [
        {"unitNumber": 1, "bounds": [0, 0, west_width, top_depth], "doorSide": "south"},
        {"unitNumber": 2, "bounds": [main_right, 0, east_width, top_depth], "doorSide": "south"},
        {"unitNumber": 3, "bounds": [0, lower_y, west_width, lower_depth], "doorSide": "north"},
        {"unitNumber": 4, "bounds": [main_right, lower_y, east_width, lower_depth], "doorSide": "north"},
    ]

    entrance_x_west = west_width // 2
    entrance_x_east = main_right + east_width // 2
    office_specs = [
        ("executive", 0, 0, west_width, top_depth, entrance_x_west, top_depth, "south", entrance_x_west, top_depth // 2),
        ("public", main_right, 0, east_width, top_depth, entrance_x_east, top_depth, "south", entrance_x_east, top_depth // 2),
        ("office_03", 0, lower_y, west_width, lower_depth, entrance_x_west, lower_y, "north", entrance_x_west, lower_y + lower_depth // 2),
        ("office_04", main_right, lower_y, east_width, lower_depth, entrance_x_east, lower_y, "north", entrance_x_east, lower_y + lower_depth // 2),
    ]
    office_by_id = {office["id"]: office for office in base["offices"]}
    for (
        office_id,
        x,
        y,
        room_width,
        room_height,
        entrance_x,
        entrance_y,
        door_side,
        spawn_x,
        spawn_y,
    ) in office_specs:
        office = office_by_id[office_id]
        office["bounds"] = [x, y, room_width, room_height]
        office["entrance"] = [entrance_x, entrance_y]
        office["spawn"] = [spawn_x, spawn_y]
        office["doorSide"] = door_side
        room_data = next(room for room in plan["rooms"] if room["id"] == office_id)
        room_data["bounds"] = [x, y, room_width, room_height]
        room_data["spawn"] = [spawn_x, spawn_y]

    base["clearEnvelopeMeters"] = [round(width / 100, 2), round(height / 100, 2)]
    base["officeDimensionsMeters"] = [
        round(west_width / 100, 2),
        round(top_depth / 100, 2),
    ]
    base["outerBounds"] = [-85, -85, width + 170, height + 170]
    base["hallways"] = [
        [main_left, 0, main_width, height],
        [0, top_depth, main_left, cross_depth],
        [main_right, top_depth, east_width, cross_depth],
    ]
    base["walkableHallways"] = [rect.copy() for rect in base["hallways"]]
    base["stairs"]["positions"] = [
        [main_left + 220, top_depth + cross_depth // 2],
        [main_right - 220, top_depth + cross_depth // 2],
    ]

    elevator_centers = [main_left + 160, main_left + 380, main_left + 600, main_left + 820]
    service_center = main_left + 1_040
    elevator_door_points = [[x, 0] for x in elevator_centers]
    base["elevator"]["position"] = elevator_door_points[1].copy()
    base["passengerElevators"] = {
        "count": 4,
        "positions": elevator_door_points,
    }
    service = base["serviceElevator"]
    service["position"] = [service_center, 0]
    base["sharedObjects"] = [
        {"id": "recreation-atm", "kind": "atm", "position": [main_left + 200, 600]},
        {"id": "recreation-vending", "kind": "vending_machine", "position": [main_left + 200, 1_050]},
        {"id": "recreation-pay-phone", "kind": "pay_phone", "position": [main_left + 200, 1_500]},
        {"id": "recreation-trash-can", "kind": "trash_can", "position": [main_left + 200, 1_950]},
        {"id": "recreation-fire-extinguisher", "kind": "fire_extinguisher", "position": [main_left + 200, 2_400]},
    ]
    plan["officeDoorCenters"] = [entrance_x_west, entrance_x_east, entrance_x_west, entrance_x_east]

    base["elevator"]["doorSide"] = "south"
    plan["infrastructureMap"]["verticalRiser"]["standardFloorPosition"] = [service_center, 150]
    standard = plan["infrastructureMap"]["standardFloor"]
    standard["clearEnvelopeMeters"] = base["clearEnvelopeMeters"].copy()
    standard["clearEnvelopeUnits"] = [width, height]
    standard["wallRoutes"] = [
        {
            "id": "service-riser-wall",
            "points": [
                [service_center, 150],
                [main_right, 150],
                [main_right, top_depth],
                [main_right, lower_y],
                [main_right, lower_y + lower_depth],
            ],
        },
        {
            "id": "west-cross-hall-north-wall",
            "points": [[main_right, top_depth], [main_left, top_depth], [0, top_depth]],
        },
        {
            "id": "east-cross-hall-north-wall",
            "points": [[main_right, top_depth], [width, top_depth]],
        },
        {
            "id": "west-cross-hall-south-wall",
            "points": [[main_right, lower_y], [main_left, lower_y], [0, lower_y]],
        },
        {
            "id": "east-cross-hall-south-wall",
            "points": [[main_right, lower_y], [width, lower_y]],
        },
    ]
    standard["repairAccess"]["position"] = [service_center, 150]


def main() -> None:
    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    if "towerLayoutScale" in plan:
        PLAN_PATH.write_text(_serialize_json(plan) + "\n", encoding="utf-8")
        print("Tower floor plan already uses the expanded coordinate scale.")
        return
    if plan.get("baseLayout", {}).get("clearEnvelopeMeters") != [220, 250]:
        raise SystemExit("Refusing to scale: the source Tower floor plan is not the expected baseline.")

    basement_fixtures = {
        "basement_b1": [[6_800, 5_000], [7_600, 5_000], [8_400, 5_000], [9_200, 5_000], [9_600, 5_250]],
        "basement_b2": [[8_600, 4_000], [8_600, 5_000], [8_600, 6_000], [8_600, 7_000], [8_600, 8_000]],
        "basement_b3": [[8_500, 2_000], [8_500, 3_000], [8_500, 4_000], [8_500, 5_000], [8_500, 6_000]],
        "basement_b4": [[1_500, 4_500], [2_500, 4_500], [3_500, 4_500], [4_500, 4_500], [5_500, 5_500]],
        "basement_b5": [[2_500, 6_500], [3_500, 6_500], [4_500, 6_500], [5_500, 6_500], [6_500, 6_500]],
        "basement_b6": [[3_500, 7_500], [4_500, 7_500], [5_500, 7_500], [6_500, 7_500], [7_500, 3_500]],
    }
    for room in plan["rooms"]:
        if room["id"] in basement_fixtures:
            room["hallwayFixtures"] = basement_fixtures[room["id"]]

    plan = _scale_geometry(plan)
    _set_expanded_standard_floor(plan)
    for room in plan["rooms"]:
        if room["id"].startswith(("basement_b4", "basement_b5", "basement_b6")):
            room["mazeCellUnits"] = _scaled(1_000)
    plan["towerLayoutScale"] = {
        "areaMultiplier": 8,
        "linearMultiplier": round(LINEAR_SCALE, 9),
        "unitsPerMeter": 100,
        "wallThicknessMeters": 0.3,
        "wallServiceCavityMeters": 0.12,
    }

    PLAN_PATH.write_text(_serialize_json(plan) + "\n", encoding="utf-8")
    print(
        "Expanded Tower floor plan to 8x area "
        f"(linear scale {LINEAR_SCALE:.9f}); standard envelope "
        f"{plan['baseLayout']['clearEnvelopeMeters'][0]} x "
        f"{plan['baseLayout']['clearEnvelopeMeters'][1]} m."
    )


if __name__ == "__main__":
    main()
