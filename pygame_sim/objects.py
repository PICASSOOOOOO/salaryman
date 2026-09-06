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
                    "executive": "lobby",
                }.get(scene.current_room, "lobby")
                scene.select_room(next_room)
            else:
                scene.select_room("public")
            message = f"ELEVATOR ARRIVED / {scene.room.label} / FLOOR {floor:02d}"
            state.notice = message
            return InteractionResult(True, message, destination=f"floor:{floor}")

        if item.kind == "stairs":
            if scene.current_floor > 1:
                scene.current_floor -= 1
                scene.select_room("public")
            else:
                next_room = {
                    "lobby": "recreation",
                    "recreation": "executive",
                    "executive": "lobby",
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
        message, route = messages[item.kind]
        state.notice = message
        return InteractionResult(True, message, route=route)


def build_tower_object_registry() -> OfficeObjectRegistry:
    """Create the fixed physical-object contract for the first tower slice."""

    registry = OfficeObjectRegistry()
    entries = [
        OfficeObject("lobby-elevator", "elevator", "ELEVATOR", "lobby", (1_700, 2_400), "RIDE TO FLOOR 01", destination_floor=1),
        OfficeObject("lobby-stairs", "stairs", "STAIRS", "lobby", (3_000, 2_400), "CLIMB / CHANGE FLOOR"),
        OfficeObject("lobby-atm", "atm", "ATM", "lobby", (4_200, 2_500), "CHECK BANCO OMBRA"),
        OfficeObject("lobby-pay-phone", "pay_phone", "PAY PHONE", "lobby", (5_300, 2_400), "CALL PHONE CENTER"),
        OfficeObject("lobby-tv", "tv", "TV", "lobby", (6_700, 1_700), "WATCH SHADOW RADIO"),
        OfficeObject("recreation-elevator", "elevator", "ELEVATOR", "recreation", (1_500, 5_900), "RETURN TO FLOOR 01", destination_floor=1),
        OfficeObject("recreation-stairs", "stairs", "STAIRS", "recreation", (8_400, 5_900), "CLIMB / CHANGE FLOOR"),
        OfficeObject("arcade-cyber-serpent", "arcade", "CYBER SERPENT", "recreation", (2_900, 6_200), "PLAY CYBER SERPENT", arcade_game_id="cyber_serpent"),
        OfficeObject("arcade-void-invaders", "arcade", "VOID INVADERS", "recreation", (4_500, 6_200), "PLAY VOID INVADERS", arcade_game_id="void_invaders"),
        OfficeObject("arcade-barrel-runner", "arcade", "BARREL RUNNER", "recreation", (6_100, 6_200), "PLAY BARREL RUNNER", arcade_game_id="barrel_runner"),
        OfficeObject("arcade-neon-breaker", "arcade", "NEON BREAKER", "recreation", (7_700, 6_200), "PLAY NEON BREAKER", arcade_game_id="neon_breaker"),
        OfficeObject("executive-elevator", "elevator", "ELEVATOR", "executive", (5_700, 2_000), "RETURN TO FLOOR 01", destination_floor=1),
        OfficeObject("executive-stairs", "stairs", "STAIRS", "executive", (8_600, 2_000), "CLIMB / CHANGE FLOOR"),
        OfficeObject("executive-desk", "desk", "CORNER DESK", "executive", (4_700, 4_300), "USE EXECUTIVE DESK"),
        OfficeObject("executive-chair", "chair", "CHAIR", "executive", (4_700, 5_100), "SIT / REST"),
        OfficeObject("executive-crt", "crt_terminal", "CRT TERMINAL", "executive", (5_400, 4_300), "OPEN OFFICE RECORD"),
        OfficeObject("executive-telephone", "telephone", "TELEPHONE", "executive", (3_500, 4_400), "OPEN PHONE CENTER"),
        OfficeObject("executive-atm", "atm", "ATM", "executive", (7_200, 4_300), "CHECK BANCO OMBRA"),
        OfficeObject("executive-vending", "vending_machine", "VENDING", "executive", (7_200, 5_500), "BUY OFFICE SUPPLIES"),
        OfficeObject("executive-window-west", "window", "WEST WINDOW", "executive", (2_700, 3_400), "LOOK OUT"),
        OfficeObject("executive-window-east", "window", "EAST WINDOW", "executive", (8_000, 3_400), "LOOK OUT"),
        OfficeObject("executive-desk-lamp", "desk", "DESK LAMP", "executive", (5_800, 4_600), "USE DESK LAMP", interactive=False),
    ]
    for entry in entries:
        registry.add(entry)
    return registry