"""Local-only coworker rivalry mechanics for the downloadable game."""

from __future__ import annotations

import random
from dataclasses import asdict, dataclass, field
from typing import Any


PERSONALITY_TRAITS = {
    "Gossip": {"grudge_multiplier": 1.5, "stamina_drain": 1.0},
    "Sycophant": {"grudge_multiplier": 0.8, "stamina_drain": 1.2},
    "Workaholic": {"grudge_multiplier": 1.0, "stamina_drain": 0.5},
    "Saboteur": {"grudge_multiplier": 1.3, "stamina_drain": 1.0},
}

DEPARTMENT_NAMES = ("Systems", "Operations", "Commercial")
COWORKER_NAMES = (
    "Mara Voss", "Ivo Chen", "Nia Okafor", "Dev Patel", "June Park",
    "Rafi Cole", "Tess Morgan", "Omar Reyes", "Lena Brooks", "Kai Bennett",
)
LETHAL_GAME_ITEM_IDS = frozenset({
    "wpn_bat", "wpn_katana", "wpn_smg", "wpn_railgun", "wpn_plasma_lance",
})
BASE_FATALITY_CHANCE = 0.0001
WEAPON_FATALITY_CHANCE = 0.002

# Abstract game actions only; none of these call shops, payments, or business APIs.
COMPETITION_ACTIONS = (
    {"id": "rumor", "label": "SPREAD A RUMOR", "impact": 20, "treasury_delta": 0},
    {"id": "suppress", "label": "SUPPRESS A PROJECT", "impact": 21, "treasury_delta": -50},
    {"id": "bribe", "label": "OFFER A BRIBE", "impact": 20, "treasury_delta": -100},
    {"id": "sabotage", "label": "DISRUPT A SHOP", "impact": 24, "treasury_delta": -250},
    {"id": "shop_fire", "label": "START A FICTIONAL SHOP FIRE", "impact": 27, "treasury_delta": -500},
    {"id": "robbery", "label": "STEAL A CASHBOX", "impact": 30, "treasury_delta": -350},
    {"id": "extortion", "label": "EXTORT THE TEAM", "impact": 32, "treasury_delta": -200},
    {"id": "fight", "label": "FIGHT (NONLETHAL)", "impact": 24, "treasury_delta": 0},
)


@dataclass
class DepartmentFaction:
    name: str
    department_morale: int = 100
    budget_treasury: int = 5000

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class CoworkerNPC:
    id: str
    name: str
    department_id: str
    trait_name: str
    stamina: int = 100
    grudge_score: int = 0
    corporate_rank: str = "Associate"
    state: str = "Idle"
    alive: bool = True
    memory_vault: list[dict[str, Any]] = field(default_factory=list)

    @property
    def trait_config(self) -> dict[str, float]:
        return PERSONALITY_TRAITS[self.trait_name]

    def log_interaction(
        self,
        event_type: str,
        raw_impact: int,
        department: DepartmentFaction,
        treasury_delta: int = 0,
    ) -> int:
        if not self.alive:
            return 0
        final_impact = int(raw_impact * self.trait_config["grudge_multiplier"])
        self.grudge_score += final_impact
        if final_impact > 15:
            department.department_morale = max(
                0, department.department_morale - int(final_impact * 0.5)
            )
        department.budget_treasury = max(
            0, department.budget_treasury + treasury_delta
        )
        self.memory_vault.append({"action": event_type, "severity": final_impact})
        self.memory_vault = self.memory_vault[-100:]
        self.update_state(department)
        return final_impact

    def update_state(self, department: DepartmentFaction) -> None:
        if not self.alive:
            self.state = "Deceased"
        elif self.stamina <= 0:
            self.state = "Burnout"
        elif self.grudge_score >= 60 or department.department_morale < 40:
            self.state = "Corporate_Warfare"
        elif self.grudge_score >= 25:
            self.state = "Passive_Aggressive"
        else:
            self.state = "Idle"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RivalryEngine:
    departments: dict[str, DepartmentFaction] = field(default_factory=dict)
    coworkers: list[CoworkerNPC] = field(default_factory=list)

    @classmethod
    def new_game(cls, seed: int | None = None) -> RivalryEngine:
        rng = random.Random(seed)
        departments = {
            name.lower(): DepartmentFaction(name=name)
            for name in DEPARTMENT_NAMES
        }
        names = rng.sample(COWORKER_NAMES, 5)
        assignments = list(departments)
        rng.shuffle(assignments)
        assignments.extend(rng.choice(tuple(departments)) for _ in range(2))
        coworkers = [
            CoworkerNPC(
                id=f"coworker-{index + 1}",
                name=name,
                department_id=assignments[index],
                trait_name=rng.choice(tuple(PERSONALITY_TRAITS)),
            )
            for index, name in enumerate(names)
        ]
        return cls(departments=departments, coworkers=coworkers)

    def coworker(self, coworker_id: str) -> CoworkerNPC | None:
        return next((npc for npc in self.coworkers if npc.id == coworker_id), None)

    @staticmethod
    def fatality_chance(inventory: object) -> float:
        if isinstance(inventory, list):
            for item in inventory:
                if not isinstance(item, dict) or item.get("itemId") not in LETHAL_GAME_ITEM_IDS:
                    continue
                try:
                    if int(item.get("quantity", 0) or 0) > 0:
                        return WEAPON_FATALITY_CHANCE
                except (TypeError, ValueError):
                    continue
        return BASE_FATALITY_CHANCE

    def to_dict(self) -> dict[str, Any]:
        return {
            "departments": {
                key: value.to_dict() for key, value in self.departments.items()
            },
            "coworkers": [npc.to_dict() for npc in self.coworkers],
        }

    @classmethod
    def from_dict(cls, data: object) -> RivalryEngine:
        if not isinstance(data, dict):
            return cls.new_game()
        try:
            departments = {
                str(key): DepartmentFaction(
                    name=str(value["name"]),
                    department_morale=max(0, min(100, int(value["department_morale"]))),
                    budget_treasury=max(0, int(value["budget_treasury"])),
                )
                for key, value in data["departments"].items()
                if isinstance(value, dict)
            }
            coworkers = [
                CoworkerNPC(
                    id=str(item["id"]),
                    name=str(item["name"]),
                    department_id=str(item["department_id"]),
                    trait_name=str(item["trait_name"]),
                    stamina=max(0, min(100, int(item.get("stamina", 100)))),
                    grudge_score=max(0, int(item.get("grudge_score", 0))),
                    corporate_rank=str(item.get("corporate_rank", "Associate")),
                    state=str(item.get("state", "Idle")),
                    alive=item.get("alive") is not False,
                    memory_vault=[
                        entry for entry in item.get("memory_vault", [])
                        if isinstance(entry, dict)
                    ][-100:],
                )
                for item in data["coworkers"]
                if isinstance(item, dict)
                and item.get("trait_name") in PERSONALITY_TRAITS
            ]
            if (
                len(departments) == 3
                and len(coworkers) == 5
                and len({npc.name for npc in coworkers}) == 5
                and all(npc.department_id in departments for npc in coworkers)
            ):
                return cls(departments=departments, coworkers=coworkers)
        except (KeyError, TypeError, ValueError):
            pass
        return cls.new_game()
