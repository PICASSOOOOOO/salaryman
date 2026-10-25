"""Renderer-agnostic physical objects for the Pygame tower slice.

Objects deliberately describe interaction intent rather than drawing details.
The scene and renderer can therefore change independently of the office
simulation and its economy rules.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from math import hypot
from typing import TYPE_CHECKING, Literal

from .approved_content import (
    APPROVED_CAMERA_FOCUS_KINDS,
    APPROVED_INTERACTIVE_OBJECT_KINDS,
)
from .business_services import (
    PURCHASABLE_BUSINESSES,
    RETAIL_BUSINESSES,
    actions_for_business,
    business_hours_status,
)
from .world_layout import FLOOR_PLAN, scale_legacy_position

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
    "service_elevator",
    "stairs",
    "basement_stairs",
    "construction_task",
    "pest_job_board",
    "pest_uniform_station",
    "utility_station",
    "carcass_disposal",
    "restroom_stall",
    "shipping_station",
    "loading_gate",
    "shop_freight_dock",
    "arcade",
    "desk",
    "chair",
    "partition_h",
    "partition_h_short",
    "partition_v",
    "tunnel_wall_h",
    "tunnel_wall_v",
    "window",
    "door",
    "desk_lamp",
    "receptionist",
    "floor_sign",
    "trash_can",
    "business_suite",
    "business_kiosk",
    "yard_gate",
    "delivery_truck",
    "forklift",
    "pallet",
    "supply_crate",
    "fire_extinguisher",
    "temple_tree",
    "reflection_screen",
    "meditation_cushion",
    "temple_audio_control",
    "chapel_pew",
    "chapel_altar",
    "library_shelf",
    "reading_table",
    "museum_case",
]

VENDING_ITEMS: dict[str, tuple[str, float]] = {
    "coffee": ("COFFEE", 18.0),
}

MILA_LOBBY_STORY_LINES = (
    "MILA / THE SCHOOL WANTS AN OPEN MIC. THE RADIO STATION WANTS IT LIVE.",
    "MILA / THEY CAME BACK TO ARGUE ABOUT THE FIRST SET. NO ONE HAS LEFT YET.",
    "MILA / THE FLOWER SHOP ON SIX THINKS THE STAGE NEEDS SOMETHING GREEN.",
)

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
    construction_plan_id: int | None = None
    construction_task_id: str | None = None
    stairwell_number: int | None = None
    completed: bool = False
    work_progress: float = 0.0
    construction_status: str = "ready"
    business_key: str | None = None
    unit_number: int | None = None
    service_actions: tuple[str, ...] = ()
    suite_bounds: tuple[int, int, int, int] | None = None
    solid_half_extents: tuple[int, int] | None = None
    retail_customer_service: bool = False

    @property
    def visual_position(self) -> tuple[int, int]:
        return self.display_position or self.position

    @property
    def camera_focus_enabled(self) -> bool:
        return self.interactive and self.kind in APPROVED_CAMERA_FOCUS_KINDS

    @property
    def collision_half_extents(self) -> tuple[int, int]:
        """Return the solid footprint in world units; tabletop props use zero."""
        if self.solid_half_extents is not None:
            return self.solid_half_extents
        return {
            "desk": (300, 150),
            "chair": (180, 130),
            "partition_h": (750, 60),
            "partition_h_short": (250, 60),
            "partition_v": (60, 750),
            "tunnel_wall_h": (500, 70),
            "tunnel_wall_v": (70, 500),
            "window": (220, 90),
            "atm": (150, 180),
            "vending_machine": (150, 180),
            "elevator": (0, 0),
            "service_elevator": (0, 0),
            "stairs": (0, 0),
            "basement_stairs": (0, 0),
            "construction_task": (0, 0),
            "pest_job_board": (0, 0),
            "pest_uniform_station": (90, 90),
            "utility_station": (100, 100),
            "carcass_disposal": (100, 100),
            "restroom_stall": (240, 300),
            "shipping_station": (320, 220),
            "loading_gate": (240, 180),
            "shop_freight_dock": (320, 220),
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
            "business_suite": (0, 0),
            "business_kiosk": (110, 140),
            "yard_gate": (0, 0),
            "delivery_truck": (900, 1_500),
            "forklift": (300, 450),
            "pallet": (300, 220),
            "supply_crate": (250, 250),
            "fire_extinguisher": (0, 0),
            "temple_tree": (320, 320),
            "reflection_screen": (450, 80),
            "meditation_cushion": (90, 90),
            "temple_audio_control": (0, 0),
            "chapel_pew": (260, 90),
            "chapel_altar": (280, 160),
            "library_shelf": (300, 100),
            "reading_table": (250, 180),
            "museum_case": (350, 180),
        }.get(self.kind, (120, 120))


@dataclass
class OfficeObjectRegistry:
    """Stable object lookup and shared interaction dispatch."""

    objects: list[OfficeObject] = field(default_factory=list)
    auto_scale_legacy_coordinates: bool = False
    _legacy_positions: dict[str, tuple[int, int]] = field(default_factory=dict, repr=False)

    def add(
        self,
        office_object: OfficeObject,
        *,
        scale_legacy_coordinates: bool | None = None,
    ) -> None:
        if self.get(office_object.id) is not None:
            raise ValueError(f"duplicate office object id: {office_object.id}")
        if (
            office_object.interactive
            and office_object.kind not in APPROVED_INTERACTIVE_OBJECT_KINDS
        ):
            raise ValueError(
                f"interactive object kind is not approved: {office_object.kind}"
            )
        should_scale = (
            self.auto_scale_legacy_coordinates
            if scale_legacy_coordinates is None
            else scale_legacy_coordinates
        )
        legacy_position = office_object.position
        legacy_display_position = office_object.display_position
        if should_scale:
            parent = self.get(office_object.parent_id) if office_object.parent_id else None
            parent_legacy_position = (
                self._legacy_positions.get(office_object.parent_id)
                if office_object.parent_id
                else None
            )
            if parent is not None and parent_legacy_position is not None:
                scaled_position = (
                    parent.position[0] + legacy_position[0] - parent_legacy_position[0],
                    parent.position[1] + legacy_position[1] - parent_legacy_position[1],
                )
                scaled_display_position = (
                    (
                        parent.position[0] + legacy_display_position[0] - parent_legacy_position[0],
                        parent.position[1] + legacy_display_position[1] - parent_legacy_position[1],
                    )
                    if legacy_display_position is not None
                    else None
                )
            else:
                scaled_position = scale_legacy_position(office_object.room, legacy_position)
                scaled_display_position = (
                    scale_legacy_position(office_object.room, legacy_display_position)
                    if legacy_display_position is not None
                    else None
                )
            office_object = replace(
                office_object,
                position=scaled_position,
                display_position=scaled_display_position,
            )
        self.objects.append(office_object)
        self._legacy_positions[office_object.id] = legacy_position

    def remove(self, object_id: str) -> None:
        self.objects[:] = [item for item in self.objects if item.id != object_id]

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

        if item.id == "tower-ghost":
            proximity = hypot(
                scene.player_position[0] - item.position[0],
                scene.player_position[1] - item.position[1],
            )
            if item.room != scene.current_room or proximity > 1_250:
                message = "THE GHOST IS NOT CLOSE ENOUGH TO SPEAK"
                state.notice = message
                return InteractionResult(False, message)

        if item.kind in {"elevator", "service_elevator"}:
            state.close_page()
            floor = item.destination_floor or scene.current_floor
            if not scene.select_floor(floor):
                return InteractionResult(False, f"FLOOR {floor:02d} IS UNDER CONSTRUCTION")
            message = f"ELEVATOR ARRIVED / {scene.room.label} / FLOOR {floor:02d}"
            state.notice = message
            return InteractionResult(True, message, destination=f"floor:{floor}")

        if item.kind == "door":
            state.close_page()
            if item.business_key is not None:
                is_open, hours = business_hours_status(item.business_key)
                message = (
                    f"{item.label.upper()} / OPEN · {hours}"
                    if is_open
                    else f"{item.label.upper()} / LOCKED · OPENS {hours}"
                )
                state.notice = message
                return InteractionResult(is_open, message)
            destination_room = item.destination_room
            if destination_room is None:
                opened = scene.toggle_door(item.id)
                message = f"{item.label.upper()} / {'OPEN' if opened else 'CLOSED'}"
                state.notice = message
                return InteractionResult(True, message)
            if not scene.select_room(destination_room):
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

        if item.kind == "telephone":
            scene.focus_on_interaction(item)
            state.open_page(
                "phone",
                from_object=True,
                source="DESK PHONE",
                source_object_id=item.id,
            )
            message = "DESK PHONE / CALLL HOME + COMMS"
            state.notice = message
            return InteractionResult(True, message, route="phone-center")

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

        if item.kind in {"business_suite", "business_kiosk"}:
            scene.focus_on_interaction(item)
            if item.business_key:
                is_open, hours = business_hours_status(item.business_key)
                if not is_open:
                    message = f"{item.label.upper()} IS CLOSED · {hours}"
                    state.notice = message
                    return InteractionResult(False, message)
            page = (
                "reception"
                if item.business_key == "tower_reception_kiosk"
                else "business_shop"
                if item.business_key in PURCHASABLE_BUSINESSES
                else "business"
            )
            state.open_page(
                page,
                from_object=True,
                source=item.label,
                source_object_id=item.id,
            )
            return InteractionResult(True, f"{item.label.upper()} / OFFICE SERVICES")

        if item.kind == "yard_gate":
            scene.focus_on_interaction(item)
            state.notice = (
                "REAR ENTRANCE / B1 LOADING YARD"
                if item.id == "lobby-back-entrance"
                else "B1 REAR ENTRANCE / TOWER LOBBY"
                if item.id == "basement-b1-back-entrance"
                else "B1 LOADING YARD / STAFF ACCESS"
            )
            return InteractionResult(True, state.notice)

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

        if item.id == "tower-ghost":
            scene.focus_on_interaction(item)
            state.open_page(
                "merchant",
                from_object=True,
                source="THE GHOST",
                source_object_id=item.id,
            )
            message = "THE GHOST / YOU DIDN'T SEE HIM"
            state.notice = message
            return InteractionResult(True, message, route="merchant")

        if item.id.startswith("coworker-"):
            npc = state.rivalry.coworker(item.id)
            if npc is None or not npc.alive:
                return InteractionResult(False, "COWORKER RECORD NOT FOUND")
            proximity = hypot(
                scene.player_position[0] - item.position[0],
                scene.player_position[1] - item.position[1],
            )
            if item.room != scene.current_room or proximity > 1_250:
                message = "MOVE CLOSER TO THE COWORKER"
                state.notice = message
                return InteractionResult(False, message)
            scene.focus_on_interaction(item)
            state.open_page(
                "competition",
                from_object=True,
                source=npc.name,
                source_object_id=item.id,
            )
            return InteractionResult(True, f"RIVALRY / {npc.name.upper()}")

        if item.id == "lobby-reception-desk":
            message = "RECEPTION / TOWER INFORMATION READY"
            state.notice = message
            return InteractionResult(True, message)

        if item.kind == "basement_stairs":
            state.close_page()
            message = "BASEMENT STAIRS / USE THE STAIRWELL TO CHANGE LEVELS"
            state.notice = message
            return InteractionResult(False, message)

        if item.id == "lobby-receptionist":
            scene.focus_on_interaction(item)
            story_index = int(scene.npc_motion_seconds // 90.0) % len(MILA_LOBBY_STORY_LINES)
            message = MILA_LOBBY_STORY_LINES[story_index]
            if state.open_page(
                "reception",
                from_object=True,
                source="MILA / RECEPTION",
                source_object_id=item.id,
            ):
                state.notice = message
                return InteractionResult(True, message)
            return InteractionResult(False, "MILA IS UNAVAILABLE")

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

        if item.kind == "construction_task":
            state.notice = item.prompt
            return InteractionResult(False, item.prompt)

        if item.kind == "carcass_disposal":
            scene.focus_on_interaction(item)
            state.notice = "CARCASS DISPOSAL / CLAIMED RECOVERY ONLY"
            return InteractionResult(True, state.notice)

        if item.kind == "restroom_stall":
            scene.focus_on_interaction(item)
            state.notice = "PRIVATE RESTROOM / USE STALL"
            return InteractionResult(True, state.notice)

        if item.kind == "shipping_station":
            scene.focus_on_interaction(item)
            state.notice = "B1 SHIPPING / DELIVER CARRIED TRASH"
            return InteractionResult(True, state.notice)

        if item.kind == "loading_gate":
            scene.focus_on_interaction(item)
            state.notice = "GATED LOADING ZONE / TOWER STAFF ONLY"
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

    registry = OfficeObjectRegistry(auto_scale_legacy_coordinates=True)
    for index, position in enumerate(
        ((8_000, 43_000), (13_000, 43_000), (18_000, 43_000),
         (8_000, 56_000), (18_000, 56_000)),
        start=1,
    ):
        registry.add(
            OfficeObject(
                f"coworker-{index}",
                "receptionist",
                "COWORKER",
                "office_03",
                position,
                "OPEN COMPETITION MENU",
            ),
            scale_legacy_coordinates=False,
        )
    # Historical workstation placements are deliberately kept inert; the active
    # registry below is the only source of furniture and interactables.
    """
    entries = [
        OfficeObject("lobby-elevator", "elevator", "PASSENGER ELEVATOR", "lobby", (49_977_000, 50_000_000), "RIDE TO FLOOR 02", destination_floor=2),
        OfficeObject("lobby-elevator-1", "elevator", "PASSENGER ELEVATOR", "lobby", (49_975_500, 50_000_000), "RIDE TO FLOOR 02", destination_floor=2),
        OfficeObject("lobby-elevator-2", "elevator", "PASSENGER ELEVATOR", "lobby", (49_976_300, 50_000_000), "RIDE TO FLOOR 02", destination_floor=2),
        OfficeObject("lobby-elevator-4", "elevator", "PASSENGER ELEVATOR", "lobby", (49_977_900, 50_000_000), "RIDE TO FLOOR 02", destination_floor=2),
        OfficeObject("lobby-service-elevator", "service_elevator", "SERVICE ELEVATOR", "lobby", (49_977_600, 49_999_100), "SERVICE ACCESS / ALL OPEN FLOORS", destination_floor=2),
        OfficeObject("lobby-stairs", "stairs", "STAIRWELL 01", "lobby", (49_978_650, 50_000_800), "STAIRS / SELECT AN ADJACENT FLOOR", stairwell_number=1),
        OfficeObject("lobby-stairwell-2", "stairs", "STAIRWELL 02", "lobby", (49_975_350, 50_000_900), "STAIRS / SELECT AN ADJACENT FLOOR", stairwell_number=2),
        OfficeObject("lobby-reception-desk", "desk", "RECEPTION DESK", "lobby", (49_978_250, 49_999_600), "ASK RECEPTION"),
        OfficeObject("lobby-receptionist", "receptionist", "RECEPTIONIST", "lobby", (49_978_250, 49_998_600), "PEST WORK ORDERS"),
        OfficeObject("lobby-pest-job-board", "pest_job_board", "PEST WORK ORDERS", "lobby", (49_979_000, 49_999_100), "W-2 / 1099 LOCAL JOBS"),
        OfficeObject("lobby-pest-uniform", "pest_uniform_station", "WORK UNIFORM", "lobby", (49_978_300, 50_000_400), "EQUIP / REMOVE PEST RESPONSE UNIFORM"),
        OfficeObject("lobby-atm", "atm", "ATM", "lobby", (49_976_750, 50_000_800), "CHECK BANCO OMBRA"),
        OfficeObject("lobby-vending", "vending_machine", "VENDING", "lobby", (49_978_750, 50_000_800), "BUY OFFICE SUPPLIES"),
        OfficeObject("lobby-pay-phone", "pay_phone", "PAY PHONE", "lobby", (49_976_200, 49_999_300), "CALLL HOME / COMMS ONLY"),
        OfficeObject("lobby-stair-floor-sign", "floor_sign", "FLOOR 01", "lobby", (49_978_650, 50_000_800), "FLOOR NUMBER", interactive=False),
        OfficeObject("recreation-elevator", "elevator", "ELEVATOR", "recreation", (1_100, 4_100), "RETURN TO LOBBY", destination_floor=1),
        OfficeObject("recreation-stairs", "stairs", "STAIRS", "recreation", (8_500, 4_100), "CLIMB / CHANGE FLOOR"),
        OfficeObject("recreation-pay-phone", "pay_phone", "PAY PHONE", "recreation", (9_200, 5_000), "CALLL HOME / COMMS ONLY"),
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
            ]
        )
        if level < 6:
            entries.append(
                OfficeObject(
                    f"basement-stairs-down-b{level}",
                    "basement_stairs",
                    "STAIRS / DOWN",
                    room,
                    (5_600, 5_000),
                    "TAKE STAIRS DOWN ONE LANDING",
                )
            )
        if level == 1:
            entries.extend(
                [
                    OfficeObject("basement-b1-job-board", "pest_job_board", "PEST WORK ORDERS", room, (5_000, 3_200), "W-2 / 1099 LOCAL JOBS"),
                    OfficeObject("basement-b1-uniform", "pest_uniform_station", "UNIFORM ISSUE", room, (4_300, 5_000), "EQUIP / REMOVE PEST RESPONSE UNIFORM"),
                    OfficeObject("basement-b1-power", "utility_station", "POWER PANEL", room, (7_500, 2_000), "MAINTAIN SHARED TOWER POWER"),
                    OfficeObject("basement-b1-plumbing", "utility_station", "PLUMBING PANEL", room, (2_500, 7_500), "MAINTAIN SHARED TOWER PLUMBING"),
                    OfficeObject("basement-b1-upkeep", "utility_station", "UPKEEP BENCH", room, (7_500, 7_500), "MAINTAIN SHARED TOWER UPKEEP"),
                    OfficeObject("basement-b1-disposal", "carcass_disposal", "CARCASS DISPOSAL", room, (5_000, 5_500), "SELL A CLAIMED CARCASS"),
                    OfficeObject("basement-b1-shipping-waste", "shipping_station", "SHIPPING / WASTE", room, (9_000, 9_000), "DELIVER CARRIED TRASH"),
                    OfficeObject("basement-b1-loading-gate", "loading_gate", "GATED LOADING ZONE", room, (9_000, 7_000), "RECEIVE TOWER SUPPLIES"),
                ]
            )
    """
    # Do not register the old free workstation sets or decorative corridor
    # props. Shared furniture is added only from server-owned office inventory.
    entries = [
        OfficeObject("lobby-stairs", "stairs", "STAIRWELL 01", "lobby", (49_978_650, 50_000_800), "STAIRS / SELECT AN ADJACENT FLOOR", stairwell_number=1),
        OfficeObject("lobby-stairwell-2", "stairs", "STAIRWELL 02", "lobby", (49_975_350, 50_000_900), "STAIRS / SELECT AN ADJACENT FLOOR", stairwell_number=2),
        OfficeObject("lobby-reception-desk", "desk", "RECEPTION DESK", "lobby", (49_978_250, 49_999_600), "ASK RECEPTION"),
        OfficeObject("lobby-receptionist", "receptionist", "MILA / RECEPTIONIST", "lobby", (49_978_250, 49_998_600), "BUSINESS SERVICES / CLASSIFIEDS"),
        OfficeObject("lobby-atm", "atm", "ATM", "lobby", (49_976_750, 50_000_800), "CHECK BANCO OMBRA"),
        OfficeObject("lobby-vending", "vending_machine", "VENDING", "lobby", (49_978_750, 50_000_800), "BUY OFFICE ASSETS"),
        OfficeObject("lobby-reception-desk-phone", "telephone", "RECEPTION DESK PHONE", "lobby", (49_977_700, 49_999_200), "OPEN PHONE CENTER"),
        OfficeObject("lobby-pay-phone", "pay_phone", "PAY PHONE", "lobby", (49_976_200, 49_999_300), "OPEN COMMS"),
        OfficeObject("lobby-restroom-stall-1", "restroom_stall", "RESTROOM STALL", "lobby", (49_978_300, 50_002_200), "PRIVATE RESTROOM / RESTORE STAMINA"),
        OfficeObject("lobby-restroom-stall-2", "restroom_stall", "RESTROOM STALL", "lobby", (49_978_300, 50_001_600), "PRIVATE RESTROOM / RESTORE STAMINA"),
        OfficeObject("lobby-trash-can", "trash_can", "TRASH CAN", "lobby", (49_975_600, 50_002_300), "PICK UP TRASH"),
    ]
    for entry in entries:
        registry.add(entry)

    base_layout = FLOOR_PLAN["baseLayout"]
    passenger_positions = base_layout["passengerElevators"]["positions"]
    service_position = tuple(base_layout["serviceElevator"]["position"])
    stair_positions = base_layout["stairs"]["positions"]
    lobby_data = base_layout["elevatorLobby"]
    lobby_bounds = tuple(int(value) for value in lobby_data["bounds"])
    lobby_hall = base_layout["hallways"][0]
    lobby_opening_center = lobby_bounds[0] + int(FLOOR_PLAN["lobbyHallwayOpening"])
    hallway_center = int(lobby_hall[0]) + int(lobby_hall[2]) // 2
    lobby_elevator_y = lobby_bounds[1] + lobby_bounds[3] - 800
    lobby_passenger_positions = [
        (
            lobby_opening_center + int(position[0]) - hallway_center,
            lobby_elevator_y,
        )
        for position in passenger_positions
    ]
    lobby_passenger_ids = [
        "lobby-elevator-1",
        "lobby-elevator-2",
        "lobby-elevator",
        "lobby-elevator-4",
    ]
    for index, position in enumerate(lobby_passenger_positions):
        registry.add(OfficeObject(
            lobby_passenger_ids[index],
            "elevator",
            "PASSENGER ELEVATOR",
            "lobby",
            position,
            "SELECT AN OPEN FLOOR",
            destination_floor=6,
        ), scale_legacy_coordinates=False)
    lobby_service_y = lobby_bounds[1] + lobby_bounds[3] - 800
    registry.add(OfficeObject(
        "lobby-service-elevator",
        "service_elevator",
        "SERVICE ELEVATOR",
        "lobby",
        (
            lobby_opening_center + int(service_position[0]) - hallway_center,
            lobby_service_y,
        ),
        "B1–B6 / OPEN FLOORS",
        destination_floor=6,
    ), scale_legacy_coordinates=False)

    def add_floor_transport(room: str, floor: int, prefix: str) -> None:
        passenger_ids = (
            ["recreation-elevator-1", "recreation-elevator-2", "recreation-elevator", "recreation-elevator-4"]
            if prefix == "recreation"
            else ["floor07-elevator-1", "floor07-elevator-2", "floor07-elevator", "floor07-elevator-4"]
        )
        for index, position in enumerate(passenger_positions):
            registry.add(OfficeObject(
                passenger_ids[index],
                "elevator",
                "PASSENGER ELEVATOR",
                room,
                tuple(int(value) for value in position),
                "RETURN TO FLOOR 01 LOBBY",
                destination_floor=1,
            ), scale_legacy_coordinates=False)
        registry.add(OfficeObject(
            f"{prefix}-service-elevator",
            "service_elevator",
            "SERVICE ELEVATOR",
            room,
            service_position,
            "SERVICE ACCESS / ALL OPEN FLOORS",
            destination_floor=1,
        ), scale_legacy_coordinates=False)
        for index, position in enumerate(stair_positions, start=1):
            destination = floor - 1 if index == 1 else floor + 1
            if not 1 <= destination <= 12:
                continue
            stair_id = (
                f"{prefix}-stairs"
                if index == 1
                else f"{prefix}-stairwell-2"
            )
            registry.add(OfficeObject(
                stair_id,
                "stairs",
                f"STAIRWELL {index:02d}",
                room,
                tuple(int(value) for value in position),
                f"STAIRS / TO FLOOR {destination:02d}",
                destination_floor=destination,
                stairwell_number=index,
            ), scale_legacy_coordinates=False)

    add_floor_transport("recreation", 6, "recreation")
    add_floor_transport("floor07_business", 7, "floor07")

    for office in base_layout["offices"]:
        room = str(office["id"])
        x, y, width, height = (int(value) for value in office["bounds"])
        entrance = tuple(int(value) for value in office["entrance"])
        index = int(office["unitNumber"])
        registry.add(OfficeObject(
            f"hall-office-{index}-door",
            "door",
            str(office["label"]),
            "recreation",
            entrance,
            f"ENTER {str(office['label'])}",
            destination_room=room,
            display_position=entrance,
        ), scale_legacy_coordinates=False)
        registry.add(OfficeObject(
            f"{room}-exit-door",
            "door",
            "HALLWAY",
            room,
            entrance,
            "EXIT TO HALLWAY",
            destination_room="recreation",
            display_position=entrance,
        ), scale_legacy_coordinates=False)

    suite_door = tuple(int(value) for value in base_layout["executiveSuite"]["door"])
    registry.add(OfficeObject(
        "executive-suite-door",
        "door",
        "EXECUTIVE SUITE",
        "executive",
        suite_door,
        "ENTER EXECUTIVE SUITE",
        destination_room="executive_suite",
        display_position=suite_door,
    ), scale_legacy_coordinates=False)
    registry.add(OfficeObject(
        "executive-suite-exit",
        "door",
        "OFFICE 01",
        "executive_suite",
        suite_door,
        "RETURN TO OFFICE",
        destination_room="executive",
        display_position=suite_door,
    ), scale_legacy_coordinates=False)
    # The starter office includes one private executive workstation. The open
    # office floor stays clear until its owner buys and places furnishings.
    registry.add(OfficeObject(
        "executive-desk",
        "desk",
        "EXECUTIVE DESK",
        "executive_suite",
        (2_600, 14_500),
        "USE EXECUTIVE DESK",
    ), scale_legacy_coordinates=False)
    registry.add(OfficeObject(
        "executive-chair",
        "chair",
        "EXECUTIVE CHAIR",
        "executive_suite",
        (2_600, 14_780),
        "SIT TO USE COMPUTER",
        parent_id="executive-desk",
    ), scale_legacy_coordinates=False)
    registry.add(OfficeObject(
        "executive-crt",
        "crt_terminal",
        "EXECUTIVE TERMINAL",
        "executive_suite",
        (3_050, 14_750),
        "SIT TO USE COMPUTER",
        display_position=(2_600, 14_470),
        parent_id="executive-desk",
    ), scale_legacy_coordinates=False)

    for index, y in enumerate((31_350, 31_650), start=1):
        registry.add(OfficeObject(
            f"recreation-restroom-stall-{index}",
            "restroom_stall",
            "RESTROOM STALL",
            "recreation",
            (6_000 + (index - 1) * 1_000, y),
            "PRIVATE RESTROOM / RESTORE STAMINA",
        ), scale_legacy_coordinates=False)
    def add_wall(
        room: str,
        tag: str,
        orientation: str,
        x: int,
        y: int,
        length: int,
        thickness: int = 60,
    ) -> None:
        kind: ObjectKind = "partition_h" if orientation == "h" else "partition_v"
        object_id = f"{tag}-wall-{orientation}-{x}-{y}-{length}"
        if registry.get(object_id) is not None:
            return
        half_extents = (
            (length // 2, thickness // 2)
            if orientation == "h"
            else (thickness // 2, length // 2)
        )
        registry.add(OfficeObject(
            object_id,
            kind,
            "BUSINESS SUITE PARTITION",
            room,
            (x, y),
            "",
            interactive=False,
            solid_half_extents=half_extents,
        ), scale_legacy_coordinates=False)

    def add_business_storage(
        room: str,
        tag: str,
        business_key: str,
        label: str,
        unit_number: int,
        bounds: tuple[int, int, int, int],
        door_side: str,
    ) -> None:
        x, y, width, height = bounds
        storage_depth = max(1_200, height // 4)
        storage_start_y = y if door_side == "south" else y + height - storage_depth
        storage_center_y = storage_start_y + storage_depth // 2
        partition_y = y + storage_depth if door_side == "south" else storage_start_y
        passage = max(700, width // 7)
        segment_length = (width - passage) // 2
        add_wall(room, tag, "h", x + segment_length // 2, partition_y, segment_length, 30)
        add_wall(room, tag, "h", x + width - segment_length // 2, partition_y, segment_length, 30)

        storage_id = f"{tag}-business-{unit_number:02d}-storage"
        for index, offset in enumerate((-1, 1), start=1):
            storage_x = x + width // 2 + offset * max(500, width // 4)
            registry.add(OfficeObject(
                f"{storage_id}-pallet-{index}",
                "pallet",
                f"{label} STOCK ROOM PALLET",
                room,
                (storage_x, storage_center_y),
                "",
                interactive=False,
                business_key=business_key,
                unit_number=unit_number,
                suite_bounds=(x, storage_start_y, width, storage_depth),
            ), scale_legacy_coordinates=False)
            registry.add(OfficeObject(
                f"{storage_id}-crate-{index}",
                "supply_crate",
                f"{label} STOCK CRATE",
                room,
                (storage_x, storage_center_y - 260),
                "",
                interactive=False,
                business_key=business_key,
                unit_number=unit_number,
            ), scale_legacy_coordinates=False)

    def add_suite(
        room: str,
        tag: str,
        business: dict[str, object],
        bounds: tuple[int, int, int, int],
        door_side: str,
        *,
        build_walls: bool,
    ) -> None:
        business_key = str(business.get("businessKey", ""))
        label = str(business.get("label", "BUSINESS OFFICE"))
        unit_number = int(business.get("unitNumber", 0))
        x, y, width, height = bounds
        center_x = x + width // 2
        front_y = y + height if door_side == "south" else y
        counter_y = y + height - 3_500 if door_side == "south" else y + 3_500
        interaction_y = counter_y - 700 if door_side == "south" else counter_y + 700
        registry.add(OfficeObject(
            f"{tag}-business-{unit_number:02d}",
            "business_suite",
            label,
            room,
            (center_x, interaction_y),
            f"{'SHOP AT' if business_key in RETAIL_BUSINESSES else 'ASK'} {label}",
            business_key=business_key,
            unit_number=unit_number,
            service_actions=actions_for_business(business_key),
            suite_bounds=bounds,
            retail_customer_service=business_key in RETAIL_BUSINESSES,
        ), scale_legacy_coordinates=False)
        add_business_storage(room, tag, business_key, label, unit_number, bounds, door_side)

        # Every listed business gets a real reception point: retail locations
        # serve customers at a shop counter, while Pablo Corp offices use the
        # same footprint as a staffed advice/reception desk.
        if build_walls:
            registry.add(OfficeObject(
                f"{tag}-business-{unit_number:02d}-counter",
                "desk",
                f"{label} CUSTOMER COUNTER" if business_key in RETAIL_BUSINESSES else f"{label} RECEPTION",
                room,
                (center_x, counter_y),
                "",
                interactive=False,
                business_key=business_key,
                unit_number=unit_number,
                solid_half_extents=(520, 180),
            ), scale_legacy_coordinates=False)
            waiting_y = front_y - 1_400 if door_side == "south" else front_y + 1_400
            seat_offset = min(1_200, max(700, width // 5))
            for seat, offset in enumerate((-seat_offset, seat_offset), start=1):
                registry.add(OfficeObject(
                    f"{tag}-business-{unit_number:02d}-waiting-{seat}",
                    "chair",
                    f"{label} WAITING SEAT",
                    room,
                    (center_x + offset, waiting_y),
                    "",
                    interactive=False,
                    business_key=business_key,
                    unit_number=unit_number,
                ), scale_legacy_coordinates=False)

        door_position = (
            center_x,
            front_y + (150 if door_side == "south" else -150),
        )
        registry.add(OfficeObject(
            f"{tag}-business-{unit_number:02d}-door",
            "door",
            f"{label} ENTRY",
            room,
            door_position,
            "TOGGLE ENTRY DOOR",
            display_position=(center_x, front_y),
            business_key=business_key,
            retail_customer_service=business_key in RETAIL_BUSINESSES,
        ), scale_legacy_coordinates=False)
        if not build_walls:
            return

        wall = 30
        gap = 180
        mid_x = x + width // 2
        north_y = y
        south_y = y + height
        if door_side == "south":
            add_wall(room, tag, "h", x + width // 4, north_y, width // 2, wall)
            add_wall(room, tag, "h", x + (width - gap) // 4, south_y, (width - gap) // 2, wall)
            add_wall(room, tag, "h", x + (width + gap) // 2 + (width - gap) // 4, south_y, (width - gap) // 2, wall)
        else:
            add_wall(room, tag, "h", x + (width - gap) // 4, north_y, (width - gap) // 2, wall)
            add_wall(room, tag, "h", x + (width + gap) // 2 + (width - gap) // 4, north_y, (width - gap) // 2, wall)
            add_wall(room, tag, "h", x + width // 4, south_y, width // 2, wall)
        add_wall(room, tag, "v", x, y + height // 2, height, wall)
        add_wall(room, tag, "v", x + width, y + height // 2, height, wall)


    for floor in (*range(2, 6), *range(8, 13)):
        room = str(FLOOR_PLAN["playableFloors"][str(floor)]["room"])
        for index, position in enumerate(passenger_positions, start=1):
            registry.add(OfficeObject(
                f"floor-{floor:02d}-passenger-elevator-{index}",
                "elevator",
                "PASSENGER ELEVATOR",
                room,
                tuple(int(value) for value in position),
                "RETURN TO FLOOR 01 LOBBY",
                destination_floor=1,
            ), scale_legacy_coordinates=False)
        registry.add(OfficeObject(
            f"floor-{floor:02d}-service-elevator",
            "service_elevator",
            "SERVICE ELEVATOR",
            room,
            service_position,
            "SERVICE ACCESS / ALL OPEN FLOORS",
            destination_floor=1,
        ), scale_legacy_coordinates=False)
        for stairwell, position in enumerate(stair_positions, start=1):
            destination = floor - 1 if stairwell == 1 else floor + 1
            if not 1 <= destination <= 12:
                continue
            registry.add(OfficeObject(
                f"floor-{floor:02d}-stairwell-{stairwell}",
                "stairs",
                f"STAIRWELL {stairwell:02d}",
                room,
                tuple(int(value) for value in position),
                f"STAIRS / TO FLOOR {destination:02d}",
                destination_floor=destination,
                stairwell_number=stairwell,
            ), scale_legacy_coordinates=False)
    for floor in range(2, 13):
        room = str(FLOOR_PLAN["playableFloors"][str(floor)]["room"])
        for shared in base_layout["sharedObjects"]:
            shared_id = str(shared["id"])
            suffix = shared_id.removeprefix("recreation-")
            object_id = shared_id if floor == 6 else f"floor-{floor:02d}-{suffix}"
            kind = str(shared["kind"])
            position = tuple(int(value) for value in shared["position"])
            interactive = kind != "fire_extinguisher" and not (
                floor == 7 and kind == "vending_machine"
            )
            registry.add(OfficeObject(
                object_id,
                kind,  # type: ignore[arg-type]
                kind.replace("_", " ").upper(),
                room,
                position,
                "BUY OFFICE ASSETS" if kind == "vending_machine" and interactive else "",
                interactive=interactive,
            ), scale_legacy_coordinates=False)

    # The lobby kiosks are the only kiosk-style business locations.
    for kiosk in FLOOR_PLAN["businessSuiteLayout"]["lobbyKiosks"]:
        business_key = str(kiosk["businessKey"])
        label = str(kiosk["label"])
        position = tuple(int(value) for value in kiosk["position"])
        registry.add(OfficeObject(
            f"lobby-kiosk-{business_key}",
            "business_kiosk",
            label,
            "lobby",
            position,  # type: ignore[arg-type]
            f"OPEN {label}",
            business_key=business_key,
            service_actions=actions_for_business(business_key),
        ), scale_legacy_coordinates=False)
    lobby_back_entry = FLOOR_PLAN["businessSuiteLayout"]["lobbyBackEntrance"]
    registry.add(OfficeObject(
        "lobby-back-entrance",
        "yard_gate",
        "REAR ENTRANCE",
        "lobby",
        tuple(int(value) for value in lobby_back_entry),  # type: ignore[arg-type]
        "ENTER B1 LOADING YARD",
    ), scale_legacy_coordinates=False)

    # Standard lower floors use separate office suites, with one set of
    # partitions and a single shared ATM/vending pair along the east hallway wall.
    floor_layouts = FLOOR_PLAN["businessSuiteLayout"]
    for floor in (2, 3, 4, 5, 8, 9, 10, 11, 12):
        floor_data = FLOOR_PLAN["playableFloors"][str(floor)]
        room = str(floor_data["room"])
        layout_key = str(floor_data.get("suiteLayout", "standardFloorUnits"))
        standard_units = floor_layouts.get(layout_key, floor_layouts["standardFloorUnits"])
        for business in floor_data.get("businesses", []):
            unit_number = int(business["unitNumber"])
            unit = next(
                (item for item in standard_units if int(item["unitNumber"]) == unit_number),
                None,
            )
            if unit is None:
                continue
            raw_bounds = unit["bounds"]
            bounds = tuple(int(value) for value in raw_bounds)
            add_suite(
                room,
                f"floor-{floor:02d}",
                business,
                bounds,  # type: ignore[arg-type]
                str(unit["doorSide"]),
                build_walls=True,
            )

    # Floor 6 keeps its four existing offices; each houses two business areas
    # separated by a partition with an open shared entry.
    floor_six = FLOOR_PLAN["playableFloors"]["6"]
    office_bounds = {
        str(item["id"]): tuple(int(value) for value in item["bounds"])
        for item in FLOOR_PLAN["baseLayout"]["offices"]
    }
    for business in floor_six.get("businesses", []):
        room = str(business["officeRoom"])
        office = office_bounds[room]
        x, y, width, height = office
        half_width = width // 2
        half_x = x if business["officeHalf"] == "west" else x + half_width
        bounds = (half_x, y, half_width, height)
        add_suite(
            room,
            "floor-06",
            business,
            bounds,
            "south" if y == 0 else "north",
            build_walls=False,
        )
    registry.add(
        OfficeObject(
            "floor-06-meeting-table",
            "desk",
            "VIDEO MEETING TABLE",
            "office_03",
            (11_500, 52_000),
            "START VIDEO MEETING",
            solid_half_extents=(520, 300),
        ),
        scale_legacy_coordinates=False,
    )
    for office_id, bounds in office_bounds.items():
        x, y, width, height = bounds
        divider_x = x + width // 2
        gap = 180
        door_side = "south" if y == 0 else "north"
        if door_side == "south":
            add_wall(
                office_id,
                "floor-06",
                "v",
                divider_x,
                y + (height - gap) // 2,
                height - gap,
                30,
            )
        else:
            add_wall(
                office_id,
                "floor-06",
                "v",
                divider_x,
                y + gap + (height - gap) // 2,
                height - gap,
                30,
            )
    for level in range(1, 7):
        room = f"basement_b{level}"
        registry.add(OfficeObject(
            f"basement-stairs-up-b{level}",
            "basement_stairs",
            "STAIRS / UP",
            room,
            (5_500, 5_500),
            "RETURN TO LOBBY" if level == 1 else "TAKE STAIRS UP ONE LANDING",
        ), scale_legacy_coordinates=False)
        registry.add(OfficeObject(
            f"basement-b{level}-service-elevator",
            "service_elevator",
            "SERVICE ELEVATOR",
            room,
            (4_500, 4_500),
            "SERVICE ELEVATOR / SELECT A FLOOR",
            destination_floor=1,
        ), scale_legacy_coordinates=False)
        if level < 6:
            registry.add(OfficeObject(
                f"basement-stairs-down-b{level}",
                "basement_stairs",
                "STAIRS / DOWN",
                room,
                (5_500, 4_500),
                "TAKE STAIRS DOWN ONE LANDING",
            ), scale_legacy_coordinates=False)
        if level == 1:
            for entry in (
                OfficeObject("basement-b1-job-board", "pest_job_board", "PEST WORK ORDERS", room, (5_000, 4_650), "W-2 / 1099 LOCAL JOBS"),
                OfficeObject("basement-b1-uniform", "pest_uniform_station", "UNIFORM ISSUE", room, (4_300, 5_000), "EQUIP / REMOVE PEST RESPONSE UNIFORM"),
                OfficeObject("basement-b1-disposal", "carcass_disposal", "CARCASS DISPOSAL", room, (5_700, 5_000), "SELL A CLAIMED CARCASS"),
                OfficeObject("basement-b1-shipping-waste", "shipping_station", "SHIPPING / WASTE", room, (15_000, 9_000), "DELIVER CARRIED TRASH"),
                OfficeObject("basement-b1-loading-gate", "loading_gate", "GATED LOADING ZONE", room, (18_500, 7_000), "RECEIVE TOWER SUPPLIES"),
                OfficeObject("basement-b1-shop-freight-dock", "shop_freight_dock", "SHOP FREIGHT DOCK", room, (16_500, 7_000), "CHECK / LOAD SHOP SHIPMENT"),
            ):
                registry.add(entry)
            basement_program = FLOOR_PLAN["floorProgram"]["pabloCorpBusinessArea"]
            b1_businesses = basement_program["b1Businesses"]
            b1_layout = FLOOR_PLAN["businessSuiteLayout"]["b1"]
            for business in b1_businesses:
                unit_number = int(business["unitNumber"])
                unit = next(
                    (item for item in b1_layout["businessUnits"] if int(item["unitNumber"]) == unit_number),
                    None,
                )
                if unit is None:
                    continue
                add_suite(
                    room,
                    "b1",
                    business,
                    tuple(int(value) for value in unit["bounds"]),  # type: ignore[arg-type]
                    str(unit["doorSide"]),
                    build_walls=True,
                )
            yard_access = tuple(int(value) for value in b1_layout["yardAccess"])
            gate_position = tuple(int(value) for value in b1_layout["exteriorGate"])
            registry.add(OfficeObject(
                "basement-b1-yard-access",
                "yard_gate",
                "LOADING YARD ACCESS",
                room,
                yard_access,  # type: ignore[arg-type]
                "CROSS TO THE REAR LOADING YARD",
            ), scale_legacy_coordinates=False)
            registry.add(OfficeObject(
                "basement-b1-back-entrance",
                "yard_gate",
                "REAR ENTRANCE / LEVEL 01",
                room,
                gate_position,  # type: ignore[arg-type]
                "ENTER THE TOWER THROUGH THE REAR LOBBY DOOR",
            ), scale_legacy_coordinates=False)
            for index, prop in enumerate(b1_layout["yardProps"], start=1):
                kind = str(prop["kind"])
                position = tuple(int(value) for value in prop["position"])
                registry.add(OfficeObject(
                    f"basement-b1-yard-prop-{index:02d}",
                    kind,  # type: ignore[arg-type]
                    str(prop["label"]),
                    room,
                    position,  # type: ignore[arg-type]
                    "",
                    interactive=False,
                ), scale_legacy_coordinates=False)
        elif level == 2:
            for office_index in range(6):
                registry.add(OfficeObject(
                    f"basement-b2-collections-desk-{office_index + 1:02d}",
                    "desk",
                    f"COLLECTIONS {office_index + 1:02d}",
                    room,
                    (
                        1_700 + (office_index % 3) * 1_750,
                        2_500 + (office_index // 3) * 1_900,
                    ),
                    "COLLECTIONS FACILITY",
                    interactive=office_index == 0,
                ), scale_legacy_coordinates=False)
            registry.add(OfficeObject("basement-b2-jail-door", "door", "DETENTION CELLS", room, (7_300, 2_200), "CORPORATE DETENTION", interactive=False), scale_legacy_coordinates=False)
            registry.add(OfficeObject("basement-b2-security-desk", "desk", "CORPORATE SECURITY", room, (7_200, 5_000), "REVIEW THE DISPATCH LOG"), scale_legacy_coordinates=False)
            registry.add(OfficeObject("basement-b2-investigations-desk", "desk", "INVESTIGATIONS", room, (7_200, 7_100), "COMPARE THE CONFLICTING RECORDS"), scale_legacy_coordinates=False)
            registry.add(OfficeObject("basement-b2-collections-clerk", "receptionist", "COLLECTIONS CLERK", room, (2_800, 5_400), "OPEN / FILE A COLLECTIONS CASE"), scale_legacy_coordinates=False)
            registry.add(OfficeObject("basement-b2-security-patrol", "receptionist", "CORPORATE SECURITY / PATROL", room, (7_800, 6_000), "CORPORATE STAFF / NOT POLICE", interactive=False), scale_legacy_coordinates=False)
        elif level == 3:
            registry.add(OfficeObject("basement-b3-job-board", "pest_job_board", "PEST RESPONSE WORK ORDERS", room, (5_000, 3_200), "W-2 / 1099 LOCAL JOBS"), scale_legacy_coordinates=False)
            registry.add(OfficeObject("basement-b3-uniform", "pest_uniform_station", "RESPONSE UNIFORM ISSUE", room, (4_300, 5_000), "EQUIP / REMOVE PEST RESPONSE UNIFORM"), scale_legacy_coordinates=False)
            registry.add(OfficeObject("basement-b3-upkeep", "utility_station", "UPKEEP BENCH", room, (7_500, 7_500), "MAINTAIN SHARED TOWER UPKEEP"), scale_legacy_coordinates=False)
            registry.add(OfficeObject("basement-b3-disaster-response", "desk", "DISASTER RESPONSE", room, (2_000, 2_000), "CHECK LIVE TOWER RESPONSE STATUS"), scale_legacy_coordinates=False)
            registry.add(OfficeObject("basement-b3-fire-station", "desk", "FIRE STATION", room, (2_000, 4_000), "TOWER FIRE RESPONSE", interactive=False), scale_legacy_coordinates=False)
            registry.add(OfficeObject("basement-b3-maintenance", "desk", "MAINTENANCE BAY", room, (2_000, 6_000), "BUILDING MAINTENANCE", interactive=False), scale_legacy_coordinates=False)
            registry.add(OfficeObject("basement-b3-incinerator", "carcass_disposal", "INCINERATOR / CLAIMS", room, (5_000, 7_000), "SELL A CLAIMED CARCASS"), scale_legacy_coordinates=False)
        elif level == 4:
            registry.add(OfficeObject("basement-b4-supply-store", "desk", "VITAL SUPPLIES / ISSUE TRIAGE KIT", room, (5_000, 6_500), "ISSUE ONE CLINIC TRIAGE KIT / TOWER STAFF", interactive=True), scale_legacy_coordinates=False)
        elif level == 5:
            registry.add(OfficeObject("basement-b5-power", "utility_station", "POWER / GENERATORS", room, (7_500, 2_000), "MAINTAIN SHARED TOWER POWER"), scale_legacy_coordinates=False)
        elif level == 6:
            registry.add(OfficeObject("basement-b6-plumbing", "utility_station", "WATER / PLUMBING", room, (2_500, 7_500), "MAINTAIN SHARED TOWER PLUMBING"), scale_legacy_coordinates=False)
    for room_data in FLOOR_PLAN["rooms"]:
        room = str(room_data.get("id", ""))
        raw_cells = room_data.get("mazeCells")
        if not room.startswith("basement_b") or not isinstance(raw_cells, list):
            continue
        cell_size = int(room_data.get("mazeCellUnits", 1_000))
        if cell_size <= 0:
            continue
        level = int(room.rsplit("b", 1)[-1])
        walkable = {
            (int(cell[0]), int(cell[1]))
            for cell in raw_cells
            if isinstance(cell, list) and len(cell) == 2
        }
        for col, row in sorted(walkable):
            center_x = col * cell_size + cell_size // 2
            center_y = row * cell_size + cell_size // 2
            walls = (
                ("north", (0, -1), "tunnel_wall_h", (center_x, center_y - cell_size // 2)),
                ("east", (1, 0), "tunnel_wall_v", (center_x + cell_size // 2, center_y)),
                ("south", (0, 1), "tunnel_wall_h", (center_x, center_y + cell_size // 2)),
                ("west", (-1, 0), "tunnel_wall_v", (center_x - cell_size // 2, center_y)),
            )
            for side, (dx, dy), kind, position in walls:
                if (col + dx, row + dy) in walkable:
                    continue
                registry.add(
                    OfficeObject(
                        f"basement-b{level}-maze-{col}-{row}-{side}",
                        kind,  # type: ignore[arg-type]
                        "TUNNEL WALL",
                        room,
                        position,
                        "",
                        interactive=False,
                    ),
                    scale_legacy_coordinates=False,
                )

    # Each playable-floor template represents one physical floor at a time.
    # Floors 13–67 reuse their architectural templates, so a single shared set
    # here appears once on each instantiated level without opening construction.
    floor_rooms: dict[str, int] = {}
    for floor_key, floor_data in FLOOR_PLAN["playableFloors"].items():
        room = str(floor_data.get("room", ""))
        if room:
            floor_rooms.setdefault(room, int(floor_key))
    for room, floor in floor_rooms.items():
        if room.startswith("basement_b"):
            continue
        if room == "lobby":
            fixtures = (
                ("atm", "HALLWAY ATM", (49_976_750, 50_000_800), "CHECK BANCO OMBRA"),
                ("vending_machine", "HALLWAY VENDING", (49_978_750, 50_000_800), "BUY OFFICE ASSETS"),
                ("pay_phone", "HALLWAY PAY PHONE", (49_976_200, 49_999_300), "OPEN COMMS"),
                ("trash_can", "HALLWAY TRASH CAN", (49_975_600, 50_002_300), "PICK UP TRASH"),
                ("fire_extinguisher", "FIRE EXTINGUISHER", (49_975_250, 50_001_000), ""),
            )
        else:
            fixtures = (
                ("atm", "SHARED HALLWAY ATM", (12_790, 5_000), "CHECK BANCO OMBRA"),
                ("vending_machine", "SHARED HALLWAY VENDING", (12_790, 8_000), "BUY OFFICE ASSETS"),
                ("pay_phone", "HALLWAY PAY PHONE", (9_200, 5_000), "OPEN COMMS"),
                ("trash_can", "HALLWAY TRASH CAN", (9_200, 8_000), "PICK UP TRASH"),
                ("fire_extinguisher", "FIRE EXTINGUISHER", (9_200, 3_500), ""),
            )
        existing_kinds = {
            item.kind for item in registry.objects if item.room == room
        }
        for kind, label, position, prompt in fixtures:
            if kind in existing_kinds:
                continue
            is_vending_fixture = kind == "vending_machine"
            registry.add(OfficeObject(
                f"floor-{floor:02d}-hallway-{kind}",
                kind,  # type: ignore[arg-type]
                label,
                room,
                position,
                "" if is_vending_fixture else prompt,
                interactive=kind not in {"fire_extinguisher", "vending_machine"},
            ))
            existing_kinds.add(kind)  # type: ignore[arg-type]

    for floor_key, floor_data in FLOOR_PLAN["playableFloors"].items():
        room = str(floor_data.get("room", ""))
        for index, prop in enumerate(floor_data.get("interiorProps", []), start=1):
            position = tuple(int(value) for value in prop.get("position", []))
            if len(position) != 2:
                continue
            raw_extents = prop.get("collisionHalfExtents")
            extents = (
                tuple(int(value) for value in raw_extents)
                if isinstance(raw_extents, list) and len(raw_extents) == 2
                else None
            )
            registry.add(OfficeObject(
                f"floor-{int(floor_key):02d}-interior-prop-{index:02d}",
                str(prop.get("kind", "floor_sign")),  # type: ignore[arg-type]
                str(prop.get("label", "TOWER FIXTURE")),
                room,
                position,  # type: ignore[arg-type]
                "",
                interactive=bool(prop.get("interactive", False)),
                solid_half_extents=extents,  # type: ignore[arg-type]
            ), scale_legacy_coordinates=False)

    basement_hallway_fixtures = {
        1: (
            (6_800, 5_000), (7_600, 5_000), (8_400, 5_000),
            (9_200, 5_000), (9_600, 5_250),
        ),
        2: (
            (8_600, 4_000), (8_600, 5_000), (8_600, 6_000),
            (8_600, 7_000), (8_600, 8_000),
        ),
        3: (
            (8_500, 2_000), (8_500, 3_000), (8_500, 4_000),
            (8_500, 5_000), (8_500, 6_000),
        ),
        4: (
            (1_500, 2_500), (1_500, 3_500), (1_500, 4_500),
            (2_500, 5_500), (2_500, 6_500),
        ),
        5: (
            (2_500, 3_500), (2_500, 4_500), (2_500, 5_500),
            (2_500, 6_500), (3_500, 3_500),
        ),
        6: (
            (7_500, 2_500), (7_500, 3_500), (7_500, 4_500),
            (7_500, 5_500), (8_500, 3_500),
        ),
    }
    fixture_kinds = (
        ("atm", "SHARED HALLWAY ATM", "CHECK BANCO OMBRA"),
        ("vending_machine", "SHARED HALLWAY VENDING", "BUY OFFICE ASSETS"),
        ("pay_phone", "HALLWAY PAY PHONE", "OPEN COMMS"),
        ("trash_can", "HALLWAY TRASH CAN", "PICK UP TRASH"),
        ("fire_extinguisher", "FIRE EXTINGUISHER", ""),
    )
    for level, positions in basement_hallway_fixtures.items():
        room = f"basement_b{level}"
        for (kind, label, prompt), position in zip(fixture_kinds, positions, strict=True):
            is_vending_fixture = kind == "vending_machine"
            registry.add(OfficeObject(
                f"basement-b{level}-hallway-{kind}",
                kind,  # type: ignore[arg-type]
                label,
                room,
                position,
                "" if is_vending_fixture else prompt,
                interactive=kind not in {"fire_extinguisher", "vending_machine"},
            ), scale_legacy_coordinates=False)
    registry.auto_scale_legacy_coordinates = False
    return registry