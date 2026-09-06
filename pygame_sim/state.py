"""Global simulation state and calibrated workspace-time loop."""

from __future__ import annotations

from dataclasses import dataclass, field

from .models import LedgerEntry, OfficeRoster, Worker


SECONDS_PER_WORKSPACE_HOUR = 2.0
SHIFT_START = 9
SHIFT_END = 17


@dataclass
class OfficeState:
    """The desktop client's autoload-like global state manager.

    The renderer never owns time or finance. It reads this object, while all
    worker production, wage settlement, and day transitions happen here.
    """

    funds: float = 1200.0
    day: int = 1
    hour: int = SHIFT_START
    elapsed_seconds: float = 0.0
    running: bool = True
    roster: OfficeRoster = field(default_factory=OfficeRoster)
    ledger: list[LedgerEntry] = field(default_factory=list)
    hours_completed_today: int = 0
    total_output: float = 0.0
    total_wages_paid: float = 0.0
    drawer_open: bool = False

    @classmethod
    def with_default_roster(cls) -> OfficeState:
        state = cls()
        state.roster.workers.extend(
            [
                Worker(
                    "Mara Voss",
                    "CIRCULARITY LEAD",
                    42.0,
                    165.0,
                    (71, 190, 154),
                    stamina_drain_per_hour=7.0,
                ),
                Worker(
                    "Ivo Chen",
                    "SYSTEMS GROWER",
                    56.0,
                    230.0,
                    (248, 185, 87),
                    stamina_drain_per_hour=9.5,
                    coffee_cost=22.0,
                ),
                Worker(
                    "Nia Okafor",
                    "COMMUNITY OPS",
                    35.0,
                    140.0,
                    (240, 119, 103),
                    stamina_drain_per_hour=6.0,
                    coffee_cost=16.0,
                ),
            ]
        )
        state.ledger.append(LedgerEntry("OPENING CAPITAL", state.funds, state.funds))
        return state

    @property
    def is_working(self) -> bool:
        return SHIFT_START <= self.hour < SHIFT_END and self.running

    @property
    def time_label(self) -> str:
        return f"DAY {self.day:02d}  /  {self.hour:02d}:00"

    @property
    def shift_progress(self) -> float:
        return max(0.0, min(1.0, (self.hour - SHIFT_START) / (SHIFT_END - SHIFT_START)))

    @property
    def net_today(self) -> float:
        return self.total_output - self.total_wages_paid

    def add_funds(self, amount: float, label: str) -> None:
        self.funds = round(self.funds + amount, 2)
        self.ledger.append(LedgerEntry(label, amount, self.funds))

    def remove_funds(self, amount: float, label: str) -> bool:
        if amount < 0 or self.funds < amount:
            return False
        self.funds = round(self.funds - amount, 2)
        self.ledger.append(LedgerEntry(label, -amount, self.funds))
        return True

    def toggle_running(self) -> None:
        self.running = not self.running

    def toggle_drawer(self) -> None:
        """Open the physical desk drawer that contains the office record."""
        self.drawer_open = not self.drawer_open

    def reset(self) -> None:
        fresh = OfficeState.with_default_roster()
        self.funds = fresh.funds
        self.day = fresh.day
        self.hour = fresh.hour
        self.elapsed_seconds = fresh.elapsed_seconds
        self.running = fresh.running
        self.roster = fresh.roster
        self.ledger = fresh.ledger
        self.hours_completed_today = fresh.hours_completed_today
        self.total_output = fresh.total_output
        self.total_wages_paid = fresh.total_wages_paid
        self.drawer_open = False

    def update(self, delta_seconds: float) -> int:
        """Advance using precise frame delta; return completed workspace hours."""
        if not self.running or delta_seconds <= 0:
            return 0

        self.elapsed_seconds += min(delta_seconds, 0.25)
        hours_advanced = 0
        while self.elapsed_seconds >= SECONDS_PER_WORKSPACE_HOUR:
            self.elapsed_seconds -= SECONDS_PER_WORKSPACE_HOUR
            self.advance_workspace_hour()
            hours_advanced += 1
        return hours_advanced

    def advance_workspace_hour(self) -> None:
        """Process the current hour, settle at 17:00, then loop the day."""
        if self.hour < SHIFT_END:
            self.total_output += self.roster.work_hour(self, self.hour)
            self.hours_completed_today += 1
            self.hour += 1
            if self.hour == SHIFT_END:
                self.total_wages_paid += self.roster.settle_daily_wages(self)
            return

        self.day += 1
        self.hour = SHIFT_START
        self.hours_completed_today = 0
        self.total_output = 0.0
        self.total_wages_paid = 0.0
        for worker in self.roster.workers:
            worker.status_note = "READY FOR SHIFT"