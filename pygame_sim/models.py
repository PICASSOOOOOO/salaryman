"""Small, renderer-agnostic simulation components for the Pygame client."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .state import OfficeState


@dataclass
class Worker:
    """An independent worker component represented by one visual card."""

    name: str
    role: str
    productivity_per_hour: float
    daily_wage: float
    accent: tuple[int, int, int]
    stamina: float = 100.0
    max_stamina: float = 100.0
    stamina_drain_per_hour: float = 8.0
    coffee_cost: float = 18.0
    coffee_recovery: float = 28.0
    is_resting: bool = False
    last_output: float = 0.0
    status_note: str = "READY FOR SHIFT"

    def work_hour(self, state: OfficeState, hour: int) -> float:
        """Produce one workspace hour of value and drain stamina."""
        self.last_output = 0.0
        self.is_resting = False

        if not 9 <= hour < 17:
            self.status_note = "OFF-DUTY / RECHARGING"
            return 0.0

        self.stamina = max(0.0, self.stamina - self.stamina_drain_per_hour)
        efficiency = 0.35 + (self.stamina / self.max_stamina) * 0.65
        self.last_output = round(self.productivity_per_hour * efficiency, 2)
        state.add_funds(self.last_output, f"{self.name} output")
        self.status_note = "PRODUCING VALUE"
        return self.last_output

    def settle_daily_wage(self, state: OfficeState) -> None:
        """Debit the contracted wage at the end of the work cycle."""
        state.remove_funds(self.daily_wage, f"{self.name} daily wage")
        self.status_note = "WAGE SETTLED / OFF-DUTY"

    def buy_coffee(self, state: OfficeState) -> bool:
        """Use the card's action boundary to purchase a stamina recovery."""
        if state.funds < self.coffee_cost:
            self.status_note = "COFFEE DENIED / LOW FUNDS"
            return False

        state.remove_funds(self.coffee_cost, f"{self.name} coffee")
        self.stamina = min(self.max_stamina, self.stamina + self.coffee_recovery)
        self.is_resting = True
        self.status_note = "COFFEE BREAK / RECOVERING"
        return True

    @property
    def stamina_ratio(self) -> float:
        return max(0.0, min(1.0, self.stamina / self.max_stamina))

    @property
    def stamina_state(self) -> str:
        if self.stamina_ratio > 0.55:
            return "emerald"
        if self.stamina_ratio > 0.2:
            return "warning"
        return "depletion"


@dataclass
class LedgerEntry:
    label: str
    amount: float
    balance: float


@dataclass
class OfficeRoster:
    """Component collection kept separate from the global clock manager."""

    workers: list[Worker] = field(default_factory=list)

    def work_hour(self, state: OfficeState, hour: int) -> float:
        return round(sum(worker.work_hour(state, hour) for worker in self.workers), 2)

    def settle_daily_wages(self, state: OfficeState) -> float:
        before = state.funds
        for worker in self.workers:
            worker.settle_daily_wage(state)
        return round(before - state.funds, 2)