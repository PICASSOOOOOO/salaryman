"""Renderer-agnostic physical objects for the Pygame tower slice.

Objects deliberately describe interaction intent rather than drawing details.
The scene and renderer can therefore change independently of the office
simulation and its economy rules.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from math import hypot
from typing import TYPE_CHECKING, Literal

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
    "arcade",
    "desk",
    "chair",
    "window",
    "door",
    "desk_lamp",
]

VENDING_ITEMS: dict[str, tuple[str, float]] = {
    "coffee": ("COFFEE", 18.0),
    "desk_lamp": ("DESK LAMP", 80.0),
    "office_chair": ("OFFICE CHAIR", 160.0),
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


@dataclass
class OfficeObjectRegistry:
    """Stable object lookup and shared interaction dispatch."""

    objects: list[OfficeObject] = field(default_factory=list)

    def add(self, office_object: OfficeObject) -> None:
        if self.get(office_object.id) is not None:
            raise ValueError(f"duplicate office object id: {office_object.id}")
        self.objects.append(office_object)

    def get(self, object_id: str) -> OfficeObject | None:
        return next((item for item in self.objects if item.id == object_id), None)

    def nearby(
        self,
        position: tuple[int, int],
        *,
        room: str | None = None,
        radius: int = 1_250,
    ) -> OfficeObject | None:
        candidates = [
            item
            for item in self.objects
            if item.interactive
            and (room is None or item.room == room)
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
            floor = item.destination_floor or scene.current_floor
            scene.current_floor = floor
            if floor == 1:
                next_room = {
                    "lobby": "recreation",
                    "recreation": "executive",
                    "executive": "recreation",
                    "public": "recreation",
                    "office_03": "recreation",
                    "office_04": "recreation",
                }.get(scene.current_room, "lobby")
                scene.select_room(next_room)
            else:
                scene.select_room("public")
            message = f"ELEVATOR ARRIVED / {scene.room.label} / FLOOR {floor:02d}"
            state.notice = message
            return InteractionResult(True, message, destination=f"floor:{floor}")

        if item.kind == "door":
            destination_room = item.destination_room
            if destination_room is None or not scene.select_room(destination_room):
                return InteractionResult(False, "OFFICE NOT AVAILABLE")
            message = f"ENTERED {scene.room.label}"
            state.notice = message
            return InteractionResult(True, message, destination=f"room:{destination_room}")

        if item.kind == "stairs":
            if scene.current_floor > 1:
                scene.current_floor -= 1
                scene.select_room("public")
            else:
                next_room = {
                    "lobby": "recreation",
                    "recreation": "executive",
                    "executive": "public",
                    "public": "lobby",
                }.get(scene.current_room, "lobby")
                scene.select_room(next_room)
            message = f"STAIRS / {scene.room.label} / FLOOR {scene.current_floor:02d}"
            state.notice = message
            return InteractionResult(True, message, destination=f"floor:{scene.current_floor}")

        if item.kind == "arcade":
            game_id = item.arcade_game_id or "cyber_serpent"
            state.last_arcade_game = game_id
            message = f"ARCADE ROUTE / {game_id.upper()}"
            state.notice = message
            return InteractionResult(True, message, route=f"/arcade/{game_id}")

        if item.kind == "vending_machine":
            label, cost = VENDING_ITEMS.get(vending_item, ("UNKNOWN ITEM", 0.0))
            if vending_item not in VENDING_ITEMS:
                return InteractionResult(False, "VENDING ITEM NOT FOUND")
            if vending_item == "coffee" and state.selected_worker is not None:
                worker_index = state.selected_worker
                if not state.buy_coffee(worker_index):
                    message = f"VENDING DENIED / ƒ{cost:.0f} REQUIRED"
                    state.notice = message
                    return InteractionResult(False, message)
                message = f"VENDING DISPENSED / COFFEE FOR {state.roster.workers[worker_index].name.upper()}"
                state.notice = message
                return InteractionResult(True, message, route="coffee-break")
            if not state.purchase_office_item(vending_item, cost, f"VENDING / {label}"):
                message = f"VENDING DENIED / ƒ{cost:.0f} REQUIRED"
                state.notice = message
                return InteractionResult(False, message)
            message = f"VENDING DISPENSED / {label}"
            state.notice = message
            return InteractionResult(True, message)

        messages = {
            "telephone": ("TELEPHONE READY / PHONE CENTER", "phone-center"),
            "pay_phone": ("PAY PHONE READY / PHONE CENTER", "phone-center"),
            "crt_terminal": ("CRT TERMINAL / OFFICE RECORD", "office-record"),
            "tv": ("TV / SHADOW RADIO", "shadow-radio"),
            "atm": (f"ATM / BANCO OMBRA ƒ{state.funds:,.2f}", "banking"),
            "desk": ("EXECUTIVE DESK / OFFICE READY", "office"),
            "chair": ("CHAIR / REST POSITION", "office"),
            "window": ("WINDOW / TOWER VIEW", "tower-view"),
        }
        if item.kind == "atm":
            state.open_page("economy", from_object=True, source="ATM")
        elif item.kind == "crt_terminal":
            state.open_page("tools", from_object=True, source="CRT TERMINAL")
        message, route = messages[item.kind]
        state.notice = message
        return InteractionResult(True, message, route=route)


def build_tower_object_registry() -> OfficeObjectRegistry:
    """Create the fixed physical-object contract for the first tower slice."""

    registry = OfficeObjectRegistry()
    entries = [
        OfficeObject("lobby-elevator", "elevator", "ELEVATOR", "lobby", (1_800, 3_000), "RIDE TO FLOOR 01", destination_floor=1),
        OfficeObject("lobby-stairs", "stairs", "STAIRS", "lobby", (2_500, 3_000), "CLIMB / CHANGE FLOOR"),
        OfficeObject("lobby-atm", "atm", "ATM", "lobby", (2_350, 2_100), "CHECK BANCO OMBRA"),
        OfficeObject("lobby-pay-phone", "pay_phone", "PAY PHONE", "lobby", (950, 2_100), "CALL PHONE CENTER"),
        OfficeObject("lobby-tv", "tv", "TV", "lobby", (1_050, 2_050), "WATCH SHADOW RADIO"),
        OfficeObject("recreation-elevator", "elevator", "ELEVATOR", "recreation", (1_100, 4_100), "RETURN TO LOBBY", destination_floor=1),
        OfficeObject("recreation-stairs", "stairs", "STAIRS", "recreation", (8_500, 4_100), "CLIMB / CHANGE FLOOR"),
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
        OfficeObject("executive-desk", "desk", "CORNER DESK", "executive", (1_800, 6_250), "USE EXECUTIVE DESK"),
        OfficeObject("executive-chair", "chair", "CHAIR", "executive", (1_800, 6_950), "SIT / REST"),
        OfficeObject("executive-crt", "crt_terminal", "CRT TERMINAL", "executive", (2_100, 6_250), "OPEN OFFICE RECORD"),
        OfficeObject("executive-telephone", "telephone", "TELEPHONE", "executive", (1_400, 6_250), "OPEN PHONE CENTER"),
        OfficeObject("executive-atm", "atm", "ATM", "executive", (2_700, 6_150), "CHECK BANCO OMBRA"),
        OfficeObject("executive-vending", "vending_machine", "VENDING", "executive", (2_700, 6_950), "BUY OFFICE SUPPLIES"),
        OfficeObject("executive-window-west", "window", "WEST WINDOW", "executive", (1_400, 5_300), "LOOK OUT"),
        OfficeObject("executive-window-east", "window", "EAST WINDOW", "executive", (2_800, 5_300), "LOOK OUT"),
        OfficeObject("executive-desk-lamp", "desk_lamp", "DESK LAMP", "executive", (1_900, 6_100), "USE DESK LAMP", interactive=False),
        OfficeObject("office4-elevator", "elevator", "ELEVATOR", "public", (3_200, 6_400), "RETURN TO HALLWAY", destination_floor=1),
        OfficeObject("office4-stairs", "stairs", "STAIRS", "public", (4_600, 6_400), "RETURN TO HALLWAY"),
        OfficeObject("office4-desk", "desk", "WORK DESK", "public", (3_900, 6_250), "USE WORK DESK"),
        OfficeObject("office4-chair", "chair", "CHAIR", "public", (3_900, 6_950), "SIT / REST"),
        OfficeObject("office4-telephone", "telephone", "TELEPHONE", "public", (3_500, 6_250), "OPEN PHONE CENTER"),
        OfficeObject("office4-vending", "vending_machine", "VENDING", "public", (4_500, 6_950), "BUY OFFICE SUPPLIES"),
        OfficeObject("office3-desk", "desk", "WORK DESK", "office_03", (6_000, 6_250), "USE WORK DESK"),
        OfficeObject("office3-chair", "chair", "CHAIR", "office_03", (6_000, 6_950), "SIT / REST"),
        OfficeObject("office3-telephone", "telephone", "TELEPHONE", "office_03", (5_600, 6_250), "OPEN PHONE CENTER"),
        OfficeObject("office4b-desk", "desk", "WORK DESK", "office_04", (8_100, 6_250), "USE WORK DESK"),
        OfficeObject("office4b-chair", "chair", "CHAIR", "office_04", (8_100, 6_950), "SIT / REST"),
        OfficeObject("office4b-telephone", "telephone", "TELEPHONE", "office_04", (7_700, 6_250), "OPEN PHONE CENTER"),
    ]
    for entry in entries:
        registry.add(entry)
    return registry