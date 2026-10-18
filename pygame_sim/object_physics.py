"""Material and interaction rules shared by every simulated world object.

This module contains authority-side data and pure rules only. Godot can present
the resulting profiles, but it does not decide what an object can withstand.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .objects import ObjectKind


MaterialKind = Literal[
    "wood",
    "steel",
    "copper",
    "brass",
    "concrete",
    "marble",
    "cloth",
    "electronics",
    "glass",
    "plastic",
    "organic",
]


@dataclass(frozen=True)
class MaterialProfile:
    impact_resistance: float
    flammability: float
    burn_rate: float
    electrical_conductivity: float


@dataclass(frozen=True)
class InteractionProfile:
    material: MaterialKind
    movable: bool
    rotatable: bool
    sittable: bool
    standable: bool
    destructible: bool
    fuel_capacity_liters: int = 0

    @property
    def burnable(self) -> bool:
        return MATERIAL_PROFILES[self.material].flammability > 0 or self.fuel_capacity_liters > 0


MATERIAL_PROFILES: dict[MaterialKind, MaterialProfile] = {
    "wood": MaterialProfile(0.42, 0.82, 0.34, 0.03),
    "steel": MaterialProfile(0.94, 0.01, 0.005, 0.82),
    "copper": MaterialProfile(0.69, 0.01, 0.005, 1.0),
    "brass": MaterialProfile(0.77, 0.01, 0.005, 0.72),
    "concrete": MaterialProfile(0.98, 0.0, 0.0, 0.01),
    "marble": MaterialProfile(0.88, 0.0, 0.0, 0.01),
    "cloth": MaterialProfile(0.20, 0.96, 0.82, 0.0),
    "electronics": MaterialProfile(0.28, 0.24, 0.18, 0.88),
    "glass": MaterialProfile(0.18, 0.0, 0.0, 0.0),
    "plastic": MaterialProfile(0.24, 0.68, 0.55, 0.01),
    "organic": MaterialProfile(0.31, 0.74, 0.28, 0.01),
}


OBJECT_MATERIALS: dict[ObjectKind, MaterialKind] = {
    "telephone": "electronics",
    "pay_phone": "steel",
    "crt_terminal": "electronics",
    "tv": "electronics",
    "atm": "steel",
    "vending_machine": "steel",
    "elevator": "steel",
    "service_elevator": "steel",
    "stairs": "concrete",
    "basement_stairs": "concrete",
    "construction_task": "concrete",
    "pest_job_board": "wood",
    "pest_uniform_station": "steel",
    "utility_station": "copper",
    "carcass_disposal": "steel",
    "restroom_stall": "steel",
    "shipping_station": "steel",
    "loading_gate": "steel",
    "arcade": "electronics",
    "desk": "wood",
    "chair": "cloth",
    "partition_h": "concrete",
    "partition_h_short": "concrete",
    "partition_v": "concrete",
    "tunnel_wall_h": "concrete",
    "tunnel_wall_v": "concrete",
    "window": "glass",
    "door": "wood",
    "desk_lamp": "brass",
    "receptionist": "organic",
    "floor_sign": "marble",
    "trash_can": "steel",
    "business_suite": "concrete",
    "business_kiosk": "electronics",
    "yard_gate": "steel",
    "delivery_truck": "steel",
    "forklift": "steel",
    "pallet": "wood",
    "supply_crate": "wood",
    "fire_extinguisher": "steel",
    "temple_tree": "organic",
    "reflection_screen": "glass",
    "meditation_cushion": "cloth",
    "temple_audio_control": "electronics",
    "chapel_pew": "wood",
    "chapel_altar": "marble",
    "library_shelf": "wood",
    "reading_table": "wood",
    "museum_case": "glass",
}

_FIXED_KINDS = frozenset({
    "elevator", "service_elevator", "stairs", "basement_stairs",
    "construction_task", "utility_station", "restroom_stall",
    "loading_gate", "partition_h", "partition_h_short", "partition_v",
    "tunnel_wall_h", "tunnel_wall_v", "window", "door", "business_suite",
    "business_kiosk", "yard_gate", "temple_audio_control",
})
_SITTABLE_KINDS = frozenset({"chair", "chapel_pew", "meditation_cushion"})
_STANDABLE_KINDS = frozenset({
    "desk", "chair", "pallet", "supply_crate", "chapel_pew",
    "chapel_altar", "reading_table",
})
_FUEL_CAPACITY_LITERS = {"delivery_truck": 120, "forklift": 25}
_NON_DAMAGEABLE_KINDS = frozenset({"receptionist"})


def interaction_profile_for(kind: ObjectKind) -> InteractionProfile:
    material = OBJECT_MATERIALS[kind]
    fixed = kind in _FIXED_KINDS
    living_actor = kind in _NON_DAMAGEABLE_KINDS
    return InteractionProfile(
        material=material,
        movable=not fixed and not living_actor,
        rotatable=kind == "door" or (not fixed and not living_actor),
        sittable=kind in _SITTABLE_KINDS,
        standable=kind in _STANDABLE_KINDS,
        destructible=not living_actor,
        fuel_capacity_liters=_FUEL_CAPACITY_LITERS.get(kind, 0),
    )
