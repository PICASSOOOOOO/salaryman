"""Small, renderer-agnostic simulation components for the Pygame client."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from .state import OfficeState


ActionKind = Literal["work", "coworker_support", "boss_review", "robbery", "defense", "offense"]
MINIMUM_HOURLY_FIAT = 300.0
DEFAULT_SHIFT_HOURS = 8.0


ACTION_STAMINA_GAIN: dict[ActionKind, float] = {
    "work": 2.5,
    "coworker_support": 3.5,
    "boss_review": 2.5,
    # These are intentionally small, uncommon boosts. They are hooks for the
    # wider world, not a second combat system inside the office client.
    "robbery": 8.0,
    "defense": 6.0,
    "offense": 5.0,
}


@dataclass(frozen=True)
class RecruitCandidate:
    """A candidate offered by the hiring desk."""

    name: str
    role: str
    productivity_per_hour: float
    hourly_wage_fiat: float
    hiring_cost_fiat: float
    accent: tuple[int, int, int]


@dataclass
class Worker:
    """A remote worker whose readiness grows through meaningful activity."""

    name: str
    role: str
    productivity_per_hour: float
    hourly_wage_fiat: float
    accent: tuple[int, int, int]
    wealth_fiat: float = 300.0
    hunger: float = 18.0
    meal_cost: float = 24.0
    meal_recovery: float = 58.0
    stamina: float = 70.0
    max_stamina: float = 100.0
    stamina_gain_per_hour: float = ACTION_STAMINA_GAIN["work"]
    coffee_cost: float = 18.0
    coffee_recovery: float = 28.0
    is_resting: bool = False
    last_output: float = 0.0
    status_note: str = "READY FOR SHIFT"
    meals_eaten_today: int = 0

    def __post_init__(self) -> None:
        self.hourly_wage_fiat = max(MINIMUM_HOURLY_FIAT, float(self.hourly_wage_fiat))

    @property
    def daily_wage(self) -> float:
        """Estimated full-shift pay kept for compact office-record displays."""
        return round(self.hourly_wage_fiat * DEFAULT_SHIFT_HOURS, 2)

    def work_hour(self, state: OfficeState, hour: int) -> float:
        """Produce one workspace hour and record work as a stamina action."""
        self.last_output = 0.0
        self.is_resting = False

        if not state._real_hour_is_working(hour):
            self.status_note = "OFF-DUTY / RECHARGING"
            return 0.0

        self.hunger = min(100.0, self.hunger + 12.0)
        self.perform_action("work")
        efficiency = (
            0.35 + (self.stamina / self.max_stamina) * 0.65
        ) * state.decay_efficiency_multiplier
        self.last_output = round(self.productivity_per_hour * efficiency, 2)
        state.add_funds(self.last_output, f"{self.name} output")
        self.status_note = "PRODUCING VALUE"
        return self.last_output

    def perform_action(self, action: ActionKind) -> float:
        """Increase readiness for any meaningful work-world action."""
        if action == "work":
            gain = self.stamina_gain_per_hour
        else:
            gain = ACTION_STAMINA_GAIN[action]
        before = self.stamina
        self.stamina = min(self.max_stamina, self.stamina + gain)
        return round(self.stamina - before, 2)

    def settle_daily_wage(self, state: OfficeState) -> None:
        """Debit the contracted wage at the end of the work cycle."""
        worked_hours = max(0.0, state.work_minutes_today / 60)
        wage = round(self.hourly_wage_fiat * worked_hours, 2)
        state.remove_funds(wage, f"{self.name} wage", allow_debt=True)
        self.wealth_fiat = round(self.wealth_fiat + wage, 2)
        self.status_note = "WAGE SETTLED / OFF-DUTY"

    def eat_meal(self) -> None:
        """Meet a basic NPC need while keeping food spending visible."""
        self.wealth_fiat = round(self.wealth_fiat - self.meal_cost, 2)
        self.hunger = max(0.0, self.hunger - self.meal_recovery)
        self.meals_eaten_today += 1
        self.status_note = "EATING / RESETTING"

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

    def rest_overnight(self) -> None:
        """Keep readiness gently moving between shifts without a hard reset."""
        self.stamina = min(self.max_stamina, self.stamina + 8.0)
        self.hunger = max(0.0, self.hunger - 30.0)
        self.meals_eaten_today = 0
        self.is_resting = False
        self.last_output = 0.0
        self.status_note = "READY FOR SHIFT"

    @property
    def stamina_ratio(self) -> float:
        return max(0.0, min(1.0, self.stamina / self.max_stamina))

    @property
    def stamina_state(self) -> str:
        if self.stamina_ratio > 0.55:
            return "steady"
        if self.stamina_ratio > 0.2:
            return "warming"
        return "starting"


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

    def eat_meals(self) -> None:
        """Let every NPC meet the same meal need at the same break."""
        for worker in self.workers:
            worker.eat_meal()