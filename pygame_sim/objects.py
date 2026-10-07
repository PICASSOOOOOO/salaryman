"""Renderer-agnostic physical objects for the Pygame tower slice.

Objects deliberately describe interaction intent rather than drawing details.
The scene and renderer can therefore change independently of the office
simulation and its economy rules.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from math import hypot
from typing import TYPE_CHECKING, Literal

from .approved_content import (
    APPROVED_CAMERA_FOCUS_KINDS,
    APPROVED_INTERACTIVE_OBJECT_KINDS,
)

if TYPE_CHECKING:
    from .scene import TowerScene
    from .state import OfficeState


ObjectKind = Literal[
    "telephone",
    "pay_phone",
    "crt_terminal",
    "tv",
    "atm",
    "vending_machine",
    "elevator",
    "stairs",
    "basement_stairs",
    "pest_job_board",
    "pest_uniform_station",
    "utility_station",
    "carcass_disposal",
    "arcade",
    "desk",
    "chair",
    "window",
    "door",
    "desk_lamp",
    "receptionist",
    "floor_sign",
    "trash_can",
]

VENDING_ITEMS: dict[str, tuple[str, float]] = {
    "coffee": ("COFFEE", 18.0),
}

@dataclass(frozen=True)
class InteractionResult:
    """The small result shared by input handlers, tests, and renderers."""

    success: bool
    message: str
    destination: str | None = None
    route: str | None = None


@dataclass(frozen=True)
class OfficeObject:
    id: str
    kind: ObjectKind
    label: str
    room: str
    position: tuple[int, int]
    prompt: str
    arcade_game_id: str | None = None
    destination_floor: int | None = None
    destination_room: str | None = None
    interactive: bool = True
    display_position: tuple[int, int] | None = None
    parent_id: str | None = None

    @property
    def visual_position(self) -> tuple[int, int]:
        return self.display_position or self.position

    @property
    def camera_focus_enabled(self) -> bool:
        return self.interactive and self.kind in APPROVED_CAMERA_FOCUS_KINDS

    @property
    def collision_half_extents(self) -> tuple[int, int]:
        """Return the solid footprint in world units; tabletop props use zero."""
        return {
            "desk": (300, 150),
            "chair": (180, 130),
            "window": (220, 90),
            "atm": (150, 180),
            "vending_machine": (150, 180),
            "elevator": (0, 0),
            "stairs": (0, 0),
            "basement_stairs": (0, 0),
            "pest_job_board": (0, 0),
            "pest_uniform_station": (90, 90),
            "utility_station": (100, 100),
            "carcass_disposal": (100, 100),
            "door": (0, 0),
            "telephone": (0, 0),
            "crt_terminal": (0, 0),
            "desk_lamp": (0, 0),
            "receptionist": (0, 0),
            "floor_sign": (0, 0),
            "pay_phone": (100, 100),
            "tv": (140, 100),
            "arcade": (140, 160),
            "trash_can": (300, 300),
        }.get(self.kind, (120, 120))


@dataclass
class OfficeObjectRegistry:
    """Stable object lookup and shared interaction dispatch."""

    objects: list[OfficeObject] = field(default_factory=list)

    def add(self, office_object: OfficeObject) -> None:
        if self.get(office_object.id) is not None:
            raise ValueError(f"duplicate office object id: {office_object.id}")
        if (
            office_object.interactive
            and office_object.kind not in APPROVED_INTERACTIVE_OBJECT_KINDS
        ):
            raise ValueError(
                f"interactive object kind is not approved: {office_object.kind}"
            )
        self.objects.append(office_object)

    def get(self, object_id: str) -> OfficeObject | None:
        return next((item for item in self.objects if item.id == object_id), None)

    def nearby(
        self,
        position: tuple[int, int],
        *,
        room: str | None = None,
        radius: int = 1_250,
        allowed_ids: frozenset[str] | None = None,
    ) -> OfficeObject | None:
        candidates = [
            item
            for item in self.objects
            if item.interactive
            and (room is None or item.room == room)
            and (allowed_ids is None or item.id in allowed_ids)
            and hypot(item.position[0] - position[0], item.position[1] - position[1]) <= radius
        ]
        return min(
            candidates,
            key=lambda item: hypot(item.position[0] - position[0], item.position[1] - position[1]),
            default=None,
        )

    def interact(
        self,
        object_id: str,
        state: OfficeState,
        scene: TowerScene,
        *,
        vending_item: str = "coffee",
    ) -> InteractionResult:
        item = self.get(object_id)
        if item is None:
            return InteractionResult(False, "OBJECT NOT FOUND")
        if not item.interactive:
            return InteractionResult(False, f"{item.label.upper()} IS DECORATIVE")

        if item.kind == "elevator":
            state.close_page()
            floor = item.destination_floor or scene.current_floor
            if not scene.select_floor(floor):
                return InteractionResult(False, f"FLOOR {floor:02d} IS UNDER CONSTRUCTION")
            message = f"ELEVATOR ARRIVED / {scene.room.label} / FLOOR {floor:02d}"
            state.notice = message
            return InteractionResult(True, message, destination=f"floor:{floor}")

        if item.kind == "door":
            state.close_page()
            destination_room = item.destination_room
            if destination_room is None or not scene.select_room(destination_room):
                return InteractionResult(False, "OFFICE NOT AVAILABLE")
            message = f"ENTERED {scene.room.label}"
            state.notice = message
            return InteractionResult(True, message, destination=f"room:{destination_room}")

        if item.kind == "stairs":
            state.close_page()
            if scene.current_room == "lobby":
                message = "STAIRS DOWN / B1 ENTRY REQUIRES THE TOWER STAIR"
                state.notice = message
                return InteractionResult(False, message)
            if not scene.climb_stairs():
                next_floor = scene.current_floor + 1
                message = (
                    f"FLOOR {next_floor:02d} IS UNDER CONSTRUCTION"
                    if next_floor <= scene.floor_count
                    else "NO STAIR ACCESS ABOVE THIS FLOOR"
                )
                state.notice = message
                return InteractionResult(False, message)
            message = f"STAIRS / CLIMBED TO FLOOR {scene.current_floor:02d}"
            state.notice = message
            return InteractionResult(True, message, destination=f"floor:{scene.current_floor}")

        if item.kind == "arcade":
            scene.focus_on_interaction(item)
            game_id = item.arcade_game_id or "cyber_serpent"
            state.last_arcade_game = game_id
            message = f"ARCADE ROUTE / {game_id.upper()}"
            state.notice = message
            return InteractionResult(True, message, route=f"/arcade/{game_id}")

        if item.kind == "pay_phone":
            scene.focus_on_interaction(item)
            state.open_page(
                "phone",
                from_object=True,
                source="PAY PHONE",
                source_object_id=item.id,
            )
            message = "PAY PHONE / CALLL HOME + COMMS ONLY"
            state.notice = message
            return InteractionResult(True, message, route="payphone-console")

        if item.kind == "tv":
            scene.focus_on_interaction(item)
            message = "CCTV MONITOR / SURVEILLANCE"
            state.notice = message
            return InteractionResult(True, message, route="surveillance")

        if item.kind == "vending_machine":
            scene.focus_on_interaction(item)
            state.open_page(
                "vending",
                from_object=True,
                source="TOWER VENDING",
                source_object_id=item.id,
            )
            message = "TOWER VENDING / SERVER-PRICED STOCK"
            state.notice = message
            return InteractionResult(True, message, route="tower-vending")

        if item.kind == "crt_terminal":
            permission_message = scene.workstation_permission(item.parent_id)
            if permission_message is not None:
                state.notice = permission_message
                return InteractionResult(False, permission_message)
            scene.focus_on_interaction(item)
            state.open_page(
                "systems",
                from_object=True,
                source="SYSTEMS TERMINAL",
                source_object_id=item.id,
            )

        if item.id == "lobby-reception-desk":
            message = "RECEPTION / TOWER INFORMATION READY"
            state.notice = message
            return InteractionResult(True, message)

        if item.kind == "basement_stairs":
            state.close_page()
            message = "BASEMENT STAIRS / USE THE STAIRWELL TO CHANGE LEVELS"
            state.notice = message
            return InteractionResult(False, message)

        if item.kind == "pest_job_board":
            scene.focus_on_interaction(item)
            if state.open_page(
                "pest_jobs",
                from_object=True,
                source="PEST WORK ORDERS",
                source_object_id=item.id,
            ):
                return InteractionResult(True, "PEST WORK ORDERS / LOCAL PROGRESS ONLY")
            return InteractionResult(False, "WORK ORDER BOARD UNAVAILABLE")

        if item.kind == "pest_uniform_station":
            scene.focus_on_interaction(item)
            if state.open_page(
                "pest_uniform",
                from_object=True,
                source="PEST RESPONSE UNIFORM",
                source_object_id=item.id,
            ):
                return InteractionResult(True, "UNIFORM ISSUE STATION")
            return InteractionResult(False, "UNIFORM STATION UNAVAILABLE")

        if item.kind == "utility_station":
            scene.focus_on_interaction(item)
            state.notice = f"UTILITY WORK / {item.label}"
            return InteractionResult(True, state.notice)

        if item.kind == "carcass_disposal":
            scene.focus_on_interaction(item)
            state.notice = "CARCASS DISPOSAL / CLAIMED RECOVERY ONLY"
            return InteractionResult(True, state.notice)

        messages = {
            "telephone": ("TELEPHONE READY / PHONE CENTER", "phone-center"),
            "crt_terminal": ("SYSTEMS TERMINAL / FULL WORKSPACE", "systems-terminal"),
            "atm": ("ATM / BANCO OMBRA", "banking"),
            "desk": ("EXECUTIVE DESK / OFFICE READY", "office"),
            "chair": ("CHAIR / REST POSITION", "office"),
            "window": ("WINDOW / TOWER VIEW", "tower-view"),
        }
        if item.kind == "atm":
            scene.focus_on_interaction(item)
            state.open_page(
                "bank",
                from_object=True,
                source="ATM",
                source_object_id=item.id,
            )
        message, route = messages[item.kind]
        state.notice = message
        return InteractionResult(True, message, route=route)


def build_tower_object_registry() -> OfficeObjectRegistry:
    """Create the fixed physical-object contract for the first tower slice."""

    registry = OfficeObjectRegistry()
    # Historical workstation placements are deliberately kept inert; the active
    # registry below is the only source of furniture and interactables.
    """
    entries = [
        OfficeObject("lobby-elevator", "elevator", "ELEVATOR", "lobby", (49_977_000, 50_000_000), "RIDE TO FLOOR 06", destination_floor=6),
        OfficeObject("lobby-stairs", "stairs", "STAIRS", "lobby", (49_978_650, 50_000_800), "TAKE STAIRS DOWN TO B1 / FLOORS 02–05 SEALED"),
        OfficeObject("lobby-reception-desk", "desk", "RECEPTION DESK", "lobby", (49_978_250, 49_999_600), "ASK RECEPTION"),
        OfficeObject("lobby-receptionist", "receptionist", "RECEPTIONIST", "lobby", (49_978_250, 49_998_600), "PEST WORK ORDERS"),
        OfficeObject("lobby-pest-job-board", "pest_job_board", "PEST WORK ORDERS", "lobby", (49_979_000, 49_999_100), "W-2 / 1099 LOCAL JOBS"),
        OfficeObject("lobby-pest-uniform", "pest_uniform_station", "WORK UNIFORM", "lobby", (49_978_200, 50_000_100), "EQUIP / REMOVE PEST RESPONSE UNIFORM"),
        OfficeObject("lobby-atm", "atm", "ATM", "lobby", (49_976_750, 50_000_800), "CHECK BANCO OMBRA"),
        OfficeObject("lobby-vending", "vending_machine", "VENDING", "lobby", (49_978_750, 50_000_800), "BUY OFFICE SUPPLIES"),
        OfficeObject("lobby-pay-phone", "pay_phone", "PAY PHONE", "lobby", (49_976_200, 49_999_300), "CALLL HOME / COMMS ONLY"),
        OfficeObject("lobby-stair-floor-sign", "floor_sign", "FLOOR 01", "lobby", (49_978_650, 50_000_800), "FLOOR NUMBER", interactive=False),
        OfficeObject("recreation-elevator", "elevator", "ELEVATOR", "recreation", (1_100, 4_100), "RETURN TO LOBBY", destination_floor=1),
        OfficeObject("recreation-stairs", "stairs", "STAIRS", "recreation", (8_500, 4_100), "CLIMB / CHANGE FLOOR"),
        OfficeObject("recreation-pay-phone", "pay_phone", "PAY PHONE", "recreation", (4_900, 4_300), "CALLL HOME / COMMS ONLY"),
        OfficeObject("recreation-floor-number-sign", "floor_sign", "FLOOR 01", "recreation", (8_500, 3_800), "FLOOR NUMBER", interactive=False),
        OfficeObject("hall-office-1-door", "door", "OFFICE 01", "recreation", (1_800, 5_100), "ENTER OFFICE 01", destination_room="executive"),
        OfficeObject("hall-office-2-door", "door", "OFFICE 02", "recreation", (3_900, 5_100), "ENTER OFFICE 02", destination_room="public"),
        OfficeObject("hall-office-3-door", "door", "OFFICE 03", "recreation", (6_000, 5_100), "ENTER OFFICE 03", destination_room="office_03"),
        OfficeObject("hall-office-4-door", "door", "OFFICE 04", "recreation", (8_100, 5_100), "ENTER OFFICE 04", destination_room="office_04"),
        OfficeObject("arcade-cyber-serpent", "arcade", "CYBER SERPENT", "recreation", (2_500, 4_300), "PLAY CYBER SERPENT", arcade_game_id="cyber_serpent"),
        OfficeObject("arcade-void-invaders", "arcade", "VOID INVADERS", "recreation", (2_900, 4_300), "PLAY VOID INVADERS", arcade_game_id="void_invaders"),
        OfficeObject("arcade-barrel-runner", "arcade", "BARREL RUNNER", "recreation", (3_300, 4_300), "PLAY BARREL RUNNER", arcade_game_id="barrel_runner"),
        OfficeObject("arcade-neon-breaker", "arcade", "NEON BREAKER", "recreation", (3_700, 4_300), "PLAY NEON BREAKER", arcade_game_id="neon_breaker"),
        OfficeObject("executive-elevator", "elevator", "ELEVATOR", "executive", (1_100, 6_400), "RETURN TO HALLWAY", destination_floor=1),
        OfficeObject("executive-stairs", "stairs", "STAIRS", "executive", (2_500, 6_400), "RETURN TO HALLWAY"),
        OfficeObject("executive-desk", "desk", "WORKSTATION 01", "executive", (1_300, 6_100), "USE EXECUTIVE DESK"),
        OfficeObject("executive-chair", "chair", "CHAIR", "executive", (1_300, 6_380), "SIT TO USE COMPUTER", parent_id="executive-desk"),
        OfficeObject(
            "executive-crt",
            "crt_terminal",
            "CRT TERMINAL",
            "executive",
            (1_750, 6_350),
            "SIT TO USE COMPUTER",
            display_position=(1_300, 6_070),
            parent_id="executive-desk",
        ),
        OfficeObject(
            "executive-telephone",
            "telephone",
            "TELEPHONE",
            "executive",
            (1_400, 6_250),
            "OPEN PHONE CENTER",
            display_position=(1_650, 6_220),
        ),
        OfficeObject("executive-atm", "atm", "ATM", "executive", (2_700, 6_150), "CHECK BANCO OMBRA"),
        OfficeObject("executive-vending", "vending_machine", "VENDING", "executive", (2_700, 6_950), "BUY OFFICE SUPPLIES"),
        OfficeObject("executive-window-west", "window", "WEST WINDOW", "executive", (1_400, 5_750), "LOOK OUT"),
        OfficeObject("executive-window-east", "window", "EAST WINDOW", "executive", (2_800, 5_750), "LOOK OUT"),
        OfficeObject(
            "executive-desk-lamp",
            "desk_lamp",
            "DESK LAMP",
            "executive",
            (1_200, 6_042),
            "USE DESK LAMP",
            interactive=False,
            display_position=(1_200, 6_042),
            parent_id="executive-desk",
        ),
        OfficeObject("executive-desk-2", "desk", "WORKSTATION 02", "executive", (2_300, 6_100), "WORKSTATION 02"),
        OfficeObject("executive-chair-2", "chair", "CHAIR", "executive", (2_300, 6_380), "SIT TO USE COMPUTER", parent_id="executive-desk-2"),
        OfficeObject("executive-crt-2", "crt_terminal", "COMPUTER", "executive", (2_300, 6_380), "SIT TO USE COMPUTER", display_position=(2_300, 6_070), parent_id="executive-desk-2"),
        OfficeObject("executive-desk-lamp-2", "desk_lamp", "DESK LAMP", "executive", (2_200, 6_042), "DESK LAMP", interactive=False, display_position=(2_200, 6_042), parent_id="executive-desk-2"),
        OfficeObject("executive-desk-3", "desk", "WORKSTATION 03", "executive", (1_300, 6_800), "WORKSTATION 03"),
        OfficeObject("executive-chair-3", "chair", "CHAIR", "executive", (1_300, 7_080), "SIT TO USE COMPUTER", parent_id="executive-desk-3"),
        OfficeObject("executive-crt-3", "crt_terminal", "COMPUTER", "executive", (1_300, 7_080), "SIT TO USE COMPUTER", display_position=(1_300, 6_770), parent_id="executive-desk-3"),
        OfficeObject("executive-desk-lamp-3", "desk_lamp", "DESK LAMP", "executive", (1_200, 6_742), "DESK LAMP", interactive=False, display_position=(1_200, 6_742), parent_id="executive-desk-3"),
        OfficeObject("executive-desk-4", "desk", "WORKSTATION 04", "executive", (2_300, 6_800), "WORKSTATION 04"),
        OfficeObject("executive-chair-4", "chair", "CHAIR", "executive", (2_300, 7_080), "SIT TO USE COMPUTER", parent_id="executive-desk-4"),
        OfficeObject("executive-crt-4", "crt_terminal", "COMPUTER", "executive", (2_300, 7_080), "SIT TO USE COMPUTER", display_position=(2_300, 6_770), parent_id="executive-desk-4"),
        OfficeObject("executive-desk-lamp-4", "desk_lamp", "DESK LAMP", "executive", (2_200, 6_742), "DESK LAMP", interactive=False, display_position=(2_200, 6_742), parent_id="executive-desk-4"),
        OfficeObject("office4-elevator", "elevator", "ELEVATOR", "public", (3_200, 6_400), "RETURN TO HALLWAY", destination_floor=1),
        OfficeObject("office4-stairs", "stairs", "STAIRS", "public", (4_600, 6_400), "RETURN TO HALLWAY"),
        OfficeObject("office4-desk", "desk", "WORK DESK", "public", (3_900, 6_250), "USE WORK DESK"),
        OfficeObject("office4-chair", "chair", "CHAIR", "public", (3_900, 6_950), "SIT / REST"),
        OfficeObject("office4-crt", "crt_terminal", "SYSTEMS TERMINAL", "public", (3_900, 6_500), "SIT TO USE COMPUTER", display_position=(3_900, 6_100), parent_id="office4-desk"),
        OfficeObject("office4-telephone", "telephone", "TELEPHONE", "public", (3_500, 6_250), "OPEN PHONE CENTER"),
        OfficeObject("office4-vending", "vending_machine", "VENDING", "public", (4_500, 6_950), "BUY OFFICE SUPPLIES"),
        OfficeObject("office3-desk", "desk", "WORK DESK", "office_03", (6_000, 6_250), "USE WORK DESK"),
        OfficeObject("office3-chair", "chair", "CHAIR", "office_03", (6_000, 6_950), "SIT / REST"),
        OfficeObject("office3-crt", "crt_terminal", "SYSTEMS TERMINAL", "office_03", (6_000, 6_500), "SIT TO USE COMPUTER", display_position=(6_000, 6_100), parent_id="office3-desk"),
        OfficeObject("office3-telephone", "telephone", "TELEPHONE", "office_03", (5_600, 6_250), "OPEN PHONE CENTER"),
        OfficeObject("office4b-desk", "desk", "WORK DESK", "office_04", (8_100, 6_250), "USE WORK DESK"),
        OfficeObject("office4b-chair", "chair", "CHAIR", "office_04", (8_100, 6_950), "SIT / REST"),
        OfficeObject("office4b-crt", "crt_terminal", "SYSTEMS TERMINAL", "office_04", (8_100, 6_500), "SIT TO USE COMPUTER", display_position=(8_100, 6_100), parent_id="office4b-desk"),
        OfficeObject("office4b-telephone", "telephone", "TELEPHONE", "office_04", (7_700, 6_250), "OPEN PHONE CENTER"),
    ]
    for level in range(1, 7):
        room = f"basement_b{level}"
        entries.extend(
            [
                OfficeObject(
                    f"basement-stairs-up-b{level}",
                    "basement_stairs",
                    "STAIRS / UP",
                    room,
                    (4_400, 5_000),
                    "TAKE STAIRS UP ONE LANDING",
                ),
                OfficeObject(
                    f"basement-stairs-down-b{level}",
                    "basement_stairs",
                    "STAIRS / DOWN",
                    room,
                    (5_600, 5_000),
                    "TAKE STAIRS DOWN ONE LANDING",
                ),
            ]
        )
        if level == 1:
            entries.extend(
                [
                    OfficeObject("basement-b1-job-board", "pest_job_board", "PEST WORK ORDERS", room, (5_000, 3_200), "W-2 / 1099 LOCAL JOBS"),
                    OfficeObject("basement-b1-uniform", "pest_uniform_station", "UNIFORM ISSUE", room, (4_300, 5_000), "EQUIP / REMOVE PEST RESPONSE UNIFORM"),
                    OfficeObject("basement-b1-power", "utility_station", "POWER PANEL", room, (7_500, 2_000), "MAINTAIN SHARED TOWER POWER"),
                    OfficeObject("basement-b1-plumbing", "utility_station", "PLUMBING PANEL", room, (2_500, 7_500), "MAINTAIN SHARED TOWER PLUMBING"),
                    OfficeObject("basement-b1-upkeep", "utility_station", "UPKEEP BENCH", room, (7_500, 7_500), "MAINTAIN SHARED TOWER UPKEEP"),
                    OfficeObject("basement-b1-disposal", "carcass_disposal", "CARCASS DISPOSAL", room, (5_000, 5_800), "SELL A CLAIMED CARCASS"),
                ]
            )
    """
    # Do not register the old free workstation sets or decorative corridor
    # props. Shared furniture is added only from server-owned office inventory.
    entries = [
        OfficeObject("lobby-elevator", "elevator", "ELEVATOR", "lobby", (49_977_000, 50_000_000), "RIDE TO FLOOR 06", destination_floor=6),
        OfficeObject("lobby-stairs", "stairs", "STAIRS", "lobby", (49_978_650, 50_000_800), "BASEMENT & FLOORS 02–05 UNDER CONSTRUCTION"),
        OfficeObject("lobby-reception-desk", "desk", "RECEPTION DESK", "lobby", (49_978_250, 49_999_600), "ASK RECEPTION"),
        OfficeObject("lobby-receptionist", "receptionist", "RECEPTIONIST", "lobby", (49_978_250, 49_998_600), "RECEPTION", interactive=False),
        OfficeObject("lobby-atm", "atm", "ATM", "lobby", (49_976_750, 50_000_800), "CHECK BANCO OMBRA"),
        OfficeObject("lobby-vending", "vending_machine", "VENDING", "lobby", (49_978_750, 50_000_800), "BUY OFFICE ASSETS"),
        OfficeObject("lobby-pay-phone", "pay_phone", "PAY PHONE", "lobby", (49_976_200, 49_999_300), "OPEN COMMS"),
        OfficeObject("lobby-trash-can", "trash_can", "TRASH CAN", "lobby", (49_975_600, 50_002_300), "TRASH CAN", interactive=False),
        OfficeObject("recreation-elevator", "elevator", "ELEVATOR", "recreation", (11_000, 1_500), "RETURN TO FLOOR 01 LOBBY", destination_floor=1),
        OfficeObject("recreation-stairs", "stairs", "STAIRS", "recreation", (11_000, 23_500), "FLOORS 07–67 UNDER CONSTRUCTION"),
        OfficeObject("recreation-atm", "atm", "ATM", "recreation", (12_500, 5_000), "CHECK BANCO OMBRA"),
        OfficeObject("recreation-vending", "vending_machine", "VENDING", "recreation", (12_500, 8_000), "BUY OFFICE ASSETS"),
        OfficeObject("recreation-trash-can", "trash_can", "TRASH CAN", "recreation", (9_550, 9_000), "TRASH CAN", interactive=False),
        OfficeObject("hall-office-1-door", "door", "OFFICE 01", "recreation", (4_500, 11_000), "ENTER OFFICE 01", destination_room="executive"),
        OfficeObject("hall-office-2-door", "door", "OFFICE 02", "recreation", (17_500, 11_000), "ENTER OFFICE 02", destination_room="public"),
        OfficeObject("hall-office-3-door", "door", "OFFICE 03", "recreation", (4_500, 14_000), "ENTER OFFICE 03", destination_room="office_03"),
        OfficeObject("hall-office-4-door", "door", "OFFICE 04", "recreation", (17_500, 14_000), "ENTER OFFICE 04", destination_room="office_04"),
        OfficeObject("executive-exit-door", "door", "HALLWAY", "executive", (4_500, 11_000), "EXIT TO HALLWAY", destination_room="recreation"),
        OfficeObject("public-exit-door", "door", "HALLWAY", "public", (17_500, 11_000), "EXIT TO HALLWAY", destination_room="recreation"),
        OfficeObject("office_03-exit-door", "door", "HALLWAY", "office_03", (4_500, 14_000), "EXIT TO HALLWAY", destination_room="recreation"),
        OfficeObject("office_04-exit-door", "door", "HALLWAY", "office_04", (17_500, 14_000), "EXIT TO HALLWAY", destination_room="recreation"),
        OfficeObject("executive-suite-door", "door", "EXECUTIVE SUITE", "executive", (2_500, 4_600), "ENTER EXECUTIVE SUITE", destination_room="executive_suite"),
        OfficeObject("executive-suite-exit", "door", "OFFICE 01", "executive_suite", (2_500, 4_600), "RETURN TO OFFICE", destination_room="executive"),
    ]
    for entry in entries:
        registry.add(entry)
    return registry