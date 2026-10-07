"""Approved game content for the first playable Tower slice.

Keep physical art, character identities, and usable object kinds explicit here.
Add future devices only after their asset, placement, interaction, and backend
contract have all been approved.
"""

from __future__ import annotations

APPROVED_PYGAME_CHARACTER_ASSETS = tuple(
    f"characters/char_{index}.png" for index in range(6)
)

APPROVED_PYGAME_OBJECT_ASSETS = (
    "furniture/DESK/DESK_FRONT.png",
    "furniture/CUSHIONED_CHAIR/CUSHIONED_CHAIR_FRONT.png",
    "furniture/WOODEN_CHAIR/WOODEN_CHAIR_FRONT.png",
    "furniture/PC/PC_FRONT_ON_1.png",
    "furniture/PC/PC_FRONT_ON_2.png",
    "furniture/PC/PC_FRONT_ON_3.png",
)

APPROVED_GODOT_TOWER_ASSETS = (
    "godot/office-client/shadow-tower-assets/desk-terminal.png",
    "godot/office-client/shadow-tower-assets/atm.png",
    "godot/office-client/shadow-tower-assets/vending.png",
    "godot/office-client/agentshire-assets/characters/character-male-a.glb",
    "godot/office-client/agentshire-assets/furniture/chair_A.gltf",
    "godot/office-client/agentshire-assets/furniture/table_medium.gltf",
)

APPROVED_STARTER_CHARACTERS = (
    "Mara Voss",
    "Ivo Chen",
    "Nia Okafor",
)

APPROVED_RECRUITABLE_CHARACTERS = (
    "Devin Wright",
    "Clara Oswald",
    "Marcus Vance",
    "Sarah Connor",
    "Ada Lovelace",
    "Alan Turing",
)

APPROVED_AUTOMATION_CHARACTERS = (
    "PIP",
    "LEDGER",
    "ECHO",
    "KITE",
    "MUSE",
    "SCOUT",
)

APPROVED_INTERACTIVE_OBJECT_KINDS = frozenset(
    {
        "telephone",
        "pay_phone",
        "crt_terminal",
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
        "trash_can",
        "receptionist",
        "arcade",
        "desk",
        "chair",
        "window",
        "door",
        "business_suite",
        "business_kiosk",
        "yard_gate",
    }
)

# These are service/device surfaces. Exits and furniture remain interactive,
# but should not pull the camera away from the player when activated.
APPROVED_CAMERA_FOCUS_KINDS = frozenset(
    {
        "telephone",
        "pay_phone",
        "crt_terminal",
        "atm",
        "vending_machine",
        "arcade",
        "pest_job_board",
        "pest_uniform_station",
        "utility_station",
        "carcass_disposal",
        "business_suite",
        "business_kiosk",
    }
)
