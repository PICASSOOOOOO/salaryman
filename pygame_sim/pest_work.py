"""Local work-order definitions and the shared melee vocabulary."""

from __future__ import annotations

from typing import Any


MELEE_MOVES: tuple[dict[str, Any], ...] = (
    {"id": "stomp_kick", "label": "STOMPING KICK", "stamina": 7, "targets": ("pest", "hostile_humanoid")},
    {"id": "punch", "label": "PUNCH", "stamina": 4, "targets": ("pest", "hostile_humanoid")},
    {"id": "side_kick", "label": "SIDE KICK", "stamina": 7, "targets": ("pest", "hostile_humanoid")},
    {"id": "roundhouse_kick", "label": "ROUNDHOUSE KICK", "stamina": 9, "targets": ("pest", "hostile_humanoid")},
    {"id": "elbow", "label": "ELBOW", "stamina": 5, "targets": ("pest", "hostile_humanoid")},
    {"id": "biting", "label": "BITING", "stamina": 5, "targets": ("pest", "hostile_humanoid")},
    {"id": "headbutting", "label": "HEADBUTTING", "stamina": 6, "targets": ("pest", "hostile_humanoid")},
    {"id": "dirty_fighting", "label": "DIRTY FIGHTING", "stamina": 8, "targets": ("pest", "hostile_humanoid")},
    {"id": "stabbing", "label": "STABBING", "stamina": 12, "toolRequired": True, "targets": ("pest",)},
)
MELEE_MOVE_BY_ID = {move["id"]: move for move in MELEE_MOVES}

PEST_JOBS: tuple[dict[str, Any], ...] = (
    {
        "id": "pest_w2",
        "label": "W-2 PEST TECH",
        "description": "Clear three shared infestations. Progress is local to this save.",
        "progressLabel": "INFESTATIONS CLEARED",
        "goal": 3,
        "event": "defeat",
    },
    {
        "id": "pest_1099",
        "label": "1099 CARCASS RECOVERY",
        "description": "Sell three carcasses at the B1 disposal desk. No order payout.",
        "progressLabel": "CARCASSES SOLD",
        "goal": 3,
        "event": "sale",
    },
)
PEST_JOB_BY_ID = {job["id"]: job for job in PEST_JOBS}
STAMINA_SUPPLY_ITEMS = frozenset({"vend_shift_tonic", "vend_foreman_meal"})


def normalize_work_orders(raw: object) -> dict[str, dict[str, int | bool]]:
    """Load bounded local counters without treating saves as server authority."""
    result: dict[str, dict[str, int | bool]] = {}
    values = raw if isinstance(raw, dict) else {}
    for job in PEST_JOBS:
        saved = values.get(job["id"])
        saved = saved if isinstance(saved, dict) else {}
        try:
            progress = int(saved.get("progress", 0))
        except (TypeError, ValueError):
            progress = 0
        progress = max(0, min(int(job["goal"]), progress))
        result[job["id"]] = {
            "progress": progress,
            "complete": saved.get("complete") is True or progress >= int(job["goal"]),
        }
    return result
