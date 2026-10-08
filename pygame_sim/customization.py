"""Validated, local room appearance choices for the desktop game."""

from __future__ import annotations

from dataclasses import dataclass


ROOM_IDS = ("lobby", "recreation", "executive", "public", "office_03", "office_04")


@dataclass(frozen=True)
class WallFinish:
    id: str
    label: str
    beam: tuple[int, int, int]
    edge: tuple[int, int, int]
    detail: tuple[int, int, int]
    lower_beam: tuple[int, int, int]


WALL_FINISHES = (
    WallFinish(
        "canopy",
        "CANOPY",
        (29, 52, 54),
        (164, 201, 158),
        (74, 112, 100),
        (48, 67, 62),
    ),
    WallFinish(
        "sunrise",
        "SUNRISE",
        (92, 64, 48),
        (250, 205, 128),
        (185, 125, 81),
        (115, 78, 58),
    ),
    WallFinish(
        "seaglass",
        "SEA GLASS",
        (35, 73, 77),
        (164, 224, 205),
        (72, 143, 143),
        (43, 91, 94),
    ),
    WallFinish(
        "orchard",
        "ORCHARD",
        (57, 76, 48),
        (213, 224, 143),
        (111, 147, 75),
        (66, 91, 54),
    ),
)

WALL_FINISH_BY_ID = {finish.id: finish for finish in WALL_FINISHES}
DEFAULT_WALL_FINISH = "canopy"


@dataclass(frozen=True)
class DecorPreset:
    id: str
    label: str
    office_assets: tuple[str, ...]
    recreation_assets: tuple[str, ...]
    lobby_assets: tuple[str, ...]


ORIGINAL_DECOR = DecorPreset(
    "original",
    "SALARYMAN BASE",
    (
        "furniture/WHITEBOARD/WHITEBOARD.png",
        "furniture/BOOKSHELF/BOOKSHELF.png",
        "furniture/PLANT/PLANT.png",
    ),
    (
        "furniture/SOFA/SOFA_FRONT.png",
        "furniture/BOOKSHELF/BOOKSHELF.png",
        "furniture/PLANT/PLANT.png",
    ),
    (),
)

DECOR_PRESETS = (
    ORIGINAL_DECOR,
    DecorPreset(
        "greenhouse",
        "GREENHOUSE",
        (
            "furniture/LARGE_PAINTING/LARGE_PAINTING.png",
            "furniture/DOUBLE_BOOKSHELF/DOUBLE_BOOKSHELF.png",
            "furniture/LARGE_PLANT/LARGE_PLANT.png",
        ),
        (
            "furniture/LARGE_PLANT/LARGE_PLANT.png",
            "furniture/BOOKSHELF/BOOKSHELF.png",
            "furniture/HANGING_PLANT/HANGING_PLANT.png",
        ),
        (
            "furniture/LARGE_PLANT/LARGE_PLANT.png",
            "furniture/PLANT_2/PLANT_2.png",
            "furniture/HANGING_PLANT/HANGING_PLANT.png",
        ),
    ),
    DecorPreset(
        "studio",
        "MAKER STUDIO",
        (
            "furniture/SMALL_PAINTING_2/SMALL_PAINTING_2.png",
            "furniture/BOOKSHELF/BOOKSHELF.png",
            "furniture/WHITEBOARD/WHITEBOARD.png",
        ),
        (
            "furniture/SOFA/SOFA_FRONT.png",
            "furniture/CACTUS/CACTUS.png",
            "furniture/WHITEBOARD/WHITEBOARD.png",
        ),
        (
            "furniture/DOUBLE_BOOKSHELF/DOUBLE_BOOKSHELF.png",
            "furniture/CACTUS/CACTUS.png",
            "furniture/SMALL_PAINTING_2/SMALL_PAINTING_2.png",
        ),
    ),
    DecorPreset(
        "sunroom",
        "SUNROOM",
        (
            "furniture/SMALL_PAINTING/SMALL_PAINTING.png",
            "furniture/HANGING_PLANT/HANGING_PLANT.png",
            "furniture/LARGE_PLANT/LARGE_PLANT.png",
        ),
        (
            "furniture/SOFA/SOFA_FRONT.png",
            "furniture/PLANT_2/PLANT_2.png",
            "furniture/SMALL_PAINTING/SMALL_PAINTING.png",
        ),
        (
            "furniture/BOOKSHELF/BOOKSHELF.png",
            "furniture/HANGING_PLANT/HANGING_PLANT.png",
            "furniture/PLANT_2/PLANT_2.png",
        ),
    ),
)

DECOR_PRESET_BY_ID = {preset.id: preset for preset in DECOR_PRESETS}
DEFAULT_DECOR_PRESET = "original"
DEFAULT_ROOM_CUSTOMIZATION = {
    "wall_style": DEFAULT_WALL_FINISH,
    "decor_style": DEFAULT_DECOR_PRESET,
}


def sanitize_room_customizations(value: object) -> dict[str, dict[str, str]]:
    """Keep only known rooms and catalog-backed visual preset identifiers."""
    if not isinstance(value, dict):
        return {}

    sanitized: dict[str, dict[str, str]] = {}
    for room_id in ROOM_IDS:
        room_value = value.get(room_id)
        if not isinstance(room_value, dict):
            continue
        wall_style = room_value.get("wall_style")
        decor_style = room_value.get("decor_style")
        sanitized[room_id] = {
            "wall_style": (
                wall_style
                if isinstance(wall_style, str) and wall_style in WALL_FINISH_BY_ID
                else DEFAULT_WALL_FINISH
            ),
            "decor_style": (
                decor_style
                if isinstance(decor_style, str) and decor_style in DECOR_PRESET_BY_ID
                else DEFAULT_DECOR_PRESET
            ),
        }
    return sanitized


def room_decor_placements(
    room_id: str,
    bounds: tuple[int, int, int, int],
    decor_style: str,
) -> tuple[tuple[str, tuple[int, int]], ...]:
    """Return safe, fixed decorative anchors; these never affect collisions."""
    preset = DECOR_PRESET_BY_ID.get(decor_style, ORIGINAL_DECOR)
    x, y, width, height = bounds

    if room_id == "lobby":
        if not preset.lobby_assets:
            return ()
        center_x = x + width // 2
        center_y = y + height // 2
        positions = (
            (center_x - 5_200, center_y + 2_000),
            (center_x, center_y - 1_500),
            (center_x + 5_200, center_y + 2_000),
        )
        assets = preset.lobby_assets
    elif room_id == "recreation":
        positions = (
            (x + 500, y + 800),
            (x + width // 2, y + height // 2),
            (x + width - 500, y + 800),
        )
        assets = preset.recreation_assets
    elif room_id in ROOM_IDS:
        if preset.id == "original" and room_id == "executive":
            return ()
        positions = (
            (x + 200, y + 1_200),
            (x + width - 250, y + 1_200),
            (x + width - 250, y + 1_800),
        )
        assets = preset.office_assets
    else:
        return ()

    return tuple(zip(assets, positions, strict=True))
