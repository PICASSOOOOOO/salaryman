"""Global simulation state and calibrated workspace-time loop."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

from .models import ActionKind, LedgerEntry, OfficeRoster, Worker


SECONDS_PER_WORKSPACE_HOUR = 2.0
SECONDS_PER_WORKSPACE_QUARTER_HOUR = SECONDS_PER_WORKSPACE_HOUR / 4
SHIFT_START = 9
SHIFT_END = 17
BreakKind = Literal["short", "lunch"]


@dataclass
class BreakPolicy:
    """Employer-controlled, local-policy-aware work rhythm settings.

    The client does not claim to determine labor law. It gives the employer a
    visible local policy to configure, then automatically keeps the workday
    inside that policy.
    """

    jurisdiction: str = "LOCAL POLICY"
    auto_breaks: bool = True
    short_break_every_minutes: int = 150
    short_break_minutes: int = 15
    meal_after_work_minutes: int = 240
    meal_break_minutes: int = 60
    eat_at_desk: bool = False
    overtime_allowed: bool = False
    overtime_end_hour: int = 20


@dataclass
class OfficeState:
    """The desktop client's autoload-like global state manager.

    The renderer never owns time or finance. It reads this object, while all
    worker production, wage settlement, and day transitions happen here.
    """

    funds: float = 1200.0
    day: int = 1
    hour: int = SHIFT_START
    minute: int = 0
    elapsed_seconds: float = 0.0
    running: bool = True
    roster: OfficeRoster = field(default_factory=OfficeRoster)
    ledger: list[LedgerEntry] = field(default_factory=list)
    hours_completed_today: int = 0
    total_output: float = 0.0
    total_wages_paid: float = 0.0
    drawer_open: bool = False
    selected_worker: int | None = None
    notice: str = "SHIFT READY"
    policy: BreakPolicy = field(default_factory=BreakPolicy)
    real_time: bool = False
    real_date: str | None = None
    real_date_label: str | None = None
    last_real_hour: int | None = None
    manual_break_end_minute: int | None = None
    work_minutes_today: int = 0
    work_minutes_since_break: int = 0
    break_kind: BreakKind | None = None
    break_minutes_remaining: int = 0
    breaks_taken_today: int = 0
    lunch_taken_today: bool = False

    @classmethod
    def with_default_roster(cls, *, real_time: bool = False) -> OfficeState:
        state = cls(real_time=real_time)
        state.roster.workers.extend(
            [
                Worker(
                    "Mara Voss",
                    "CIRCULARITY LEAD",
                    300.0,
                    165.0,
                    (71, 190, 154),
                    stamina_gain_per_hour=2.5,
                ),
                Worker(
                    "Ivo Chen",
                    "SYSTEMS GROWER",
                    420.0,
                    230.0,
                    (248, 185, 87),
                    stamina_gain_per_hour=2.0,
                    coffee_cost=22.0,
                ),
                Worker(
                    "Nia Okafor",
                    "COMMUNITY OPS",
                    350.0,
                    140.0,
                    (240, 119, 103),
                    stamina_gain_per_hour=3.0,
                    coffee_cost=16.0,
                ),
            ]
        )
        state.ledger.append(LedgerEntry("OPENING CAPITAL", state.funds, state.funds))
        if state.real_time:
            state.sync_real_time()
        return state

    @property
    def is_working(self) -> bool:
        return self.running and self._within_work_window() and self.break_kind is None

    @property
    def time_label(self) -> str:
        if self.real_time and self.real_date_label:
            return f"{self.real_date_label}  /  {self.hour:02d}:{self.minute:02d}"
        return f"DAY {self.day:02d}  /  {self.hour:02d}:{self.minute:02d}"

    @property
    def shift_progress(self) -> float:
        end_hour = self.policy.overtime_end_hour if self.policy.overtime_allowed else SHIFT_END
        total_minutes = max(1, (end_hour - SHIFT_START) * 60)
        current_minutes = (self.hour - SHIFT_START) * 60 + self.minute
        return max(0.0, min(1.0, current_minutes / total_minutes))

    @property
    def break_label(self) -> str:
        if self.break_kind == "lunch":
            return f"LUNCH {self.break_minutes_remaining}M LEFT"
        if self.break_kind == "short":
            return f"BREAK {self.break_minutes_remaining}M LEFT"
        if self.policy.auto_breaks:
            return "AUTO BREAKS ON"
        return "BREAKS MANUAL"

    @property
    def net_today(self) -> float:
        return self.total_output - self.total_wages_paid

    def add_funds(self, amount: float, label: str) -> None:
        self.funds = round(self.funds + amount, 2)
        self.ledger.append(LedgerEntry(label, amount, self.funds))

    def remove_funds(self, amount: float, label: str, *, allow_debt: bool = False) -> bool:
        if amount < 0 or (not allow_debt and self.funds < amount):
            return False
        self.funds = round(self.funds - amount, 2)
        self.ledger.append(LedgerEntry(label, -amount, self.funds))
        return True

    def toggle_running(self) -> None:
        self.running = not self.running
        self.notice = "SHIFT RUNNING" if self.running else "SHIFT PAUSED"

    def toggle_auto_breaks(self) -> None:
        self.policy.auto_breaks = not self.policy.auto_breaks
        self.notice = "AUTO BREAKS ON" if self.policy.auto_breaks else "BREAKS MANUAL"

    def start_break(self, kind: BreakKind = "short") -> bool:
        """Start a purposeful break without making it a dead-end action."""
        if self.break_kind is not None or not self._within_work_window():
            return False
        if kind == "lunch" and self.policy.eat_at_desk:
            return False
        self.break_kind = kind
        self.break_minutes_remaining = (
            self.policy.meal_break_minutes if kind == "lunch" else self.policy.short_break_minutes
        )
        self.breaks_taken_today += 1
        if kind == "lunch":
            self.lunch_taken_today = True
        if self.real_time:
            self.manual_break_end_minute = self.hour * 60 + self.minute + self.break_minutes_remaining
        self.notice = "LUNCH STARTED" if kind == "lunch" else "BREAK STARTED"
        return True

    def toggle_drawer(self) -> None:
        """Open the physical desk drawer that contains the office record."""
        self.drawer_open = not self.drawer_open
        self.notice = "OFFICE RECORD OPEN" if self.drawer_open else "OFFICE RECORD CLOSED"

    def select_worker(self, index: int) -> bool:
        """Select a worker for direct keyboard or card actions."""
        if not 0 <= index < len(self.roster.workers):
            return False
        self.selected_worker = index
        self.notice = f"{self.roster.workers[index].name.upper()} SELECTED"
        return True

    def buy_coffee(self, index: int) -> bool:
        """Run a worker action through the state manager, not the renderer."""
        if not 0 <= index < len(self.roster.workers):
            return False
        worker = self.roster.workers[index]
        bought = worker.buy_coffee(self)
        self.selected_worker = index
        self.notice = (
            f"{worker.name.upper()} TAKING A BREAK"
            if bought
            else f"{worker.name.upper()} NEEDS ƒ{worker.coffee_cost:.0f}"
        )
        return bought

    def apply_action(self, index: int, action: ActionKind) -> bool:
        """Expose one shared action boundary for office and world activity."""
        if not 0 <= index < len(self.roster.workers):
            return False
        worker = self.roster.workers[index]
        gain = worker.perform_action(action)
        self.selected_worker = index
        worker.status_note = {
            "coworker_support": "SUPPORTING COWORKER",
            "boss_review": "IN BOSS REVIEW",
            "robbery": "FIELD EVENT",
            "defense": "DEFENDING TEAM",
            "offense": "FIELD EVENT",
            "work": "PRODUCING VALUE",
        }[action]
        self.notice = f"{worker.name.upper()} +{gain:.1f} STAMINA"
        return True

    def reset(self) -> None:
        fresh = OfficeState.with_default_roster(real_time=self.real_time)
        self.funds = fresh.funds
        self.day = fresh.day
        self.hour = fresh.hour
        self.minute = fresh.minute
        self.elapsed_seconds = fresh.elapsed_seconds
        self.running = fresh.running
        self.roster = fresh.roster
        self.ledger = fresh.ledger
        self.hours_completed_today = fresh.hours_completed_today
        self.total_output = fresh.total_output
        self.total_wages_paid = fresh.total_wages_paid
        self.drawer_open = False
        self.selected_worker = None
        self.notice = "SHIFT READY"
        self.work_minutes_today = 0
        self.work_minutes_since_break = 0
        self.break_kind = None
        self.break_minutes_remaining = 0
        self.breaks_taken_today = 0
        self.lunch_taken_today = False
        self.real_date = fresh.real_date
        self.real_date_label = fresh.real_date_label
        self.last_real_hour = fresh.last_real_hour
        self.manual_break_end_minute = fresh.manual_break_end_minute

    def update(self, delta_seconds: float) -> int:
        """Advance using precise frame delta; return completed workspace hours."""
        if self.real_time:
            if self.running:
                self.sync_real_time()
            return 0
        if not self.running or delta_seconds <= 0:
            return 0

        # Preserve the calibrated contract even when a test or a background
        # tab supplies a larger frame delta: two real seconds must equal one
        # workspace hour.
        self.elapsed_seconds += delta_seconds
        hours_advanced = 0
        while self.elapsed_seconds >= SECONDS_PER_WORKSPACE_QUARTER_HOUR:
            self.elapsed_seconds -= SECONDS_PER_WORKSPACE_QUARTER_HOUR
            hours_advanced += self.advance_workspace_minutes(15)
        return hours_advanced

    def sync_real_time(self, now: datetime | None = None) -> None:
        """Follow the local wall clock for the production desktop client."""
        if not self.real_time:
            return
        current = (now or datetime.now().astimezone()).astimezone()
        current_date = current.date().isoformat()
        if self.real_date != current_date:
            if self.real_date is not None:
                self._reset_daily_counters()
                for worker in self.roster.workers:
                    worker.rest_overnight()
            self.real_date = current_date
            self.real_date_label = current.strftime("%a %d %b").upper()
            self.day = current.timetuple().tm_yday
            self.last_real_hour = current.hour
        elif self.last_real_hour is not None and current.hour > self.last_real_hour:
            for work_hour in range(self.last_real_hour, current.hour):
                if self._real_hour_is_working(work_hour):
                    self.total_output += self.roster.work_hour(self, work_hour)
                    self.hours_completed_today += 1
            self.last_real_hour = current.hour

        self.hour = current.hour
        self.minute = current.minute
        self._sync_real_break(current.hour * 60 + current.minute)

    def _real_hour_is_working(self, work_hour: int) -> bool:
        end_hour = self.policy.overtime_end_hour if self.policy.overtime_allowed else SHIFT_END
        return SHIFT_START <= work_hour < end_hour

    def _real_break_windows(self) -> list[tuple[int, int, BreakKind]]:
        if not self.policy.auto_breaks or self.policy.eat_at_desk:
            return []
        windows: list[tuple[int, int, BreakKind]] = []
        work_minutes = 0
        since_break = 0
        clock_minute = SHIFT_START * 60
        lunch_taken = False
        end_hour = self.policy.overtime_end_hour if self.policy.overtime_allowed else SHIFT_END
        total_work_minutes = (end_hour - SHIFT_START) * 60
        while work_minutes < total_work_minutes:
            if not lunch_taken and work_minutes >= self.policy.meal_after_work_minutes:
                end = clock_minute + self.policy.meal_break_minutes
                windows.append((clock_minute, end, "lunch"))
                clock_minute = end
                lunch_taken = True
                since_break = 0
                continue
            if since_break >= self.policy.short_break_every_minutes:
                end = clock_minute + self.policy.short_break_minutes
                windows.append((clock_minute, end, "short"))
                clock_minute = end
                since_break = 0
                continue
            work_minutes += 15
            since_break += 15
            clock_minute += 15
        return windows

    def _sync_real_break(self, current_minute: int) -> None:
        if self.manual_break_end_minute is not None:
            if current_minute < self.manual_break_end_minute:
                self.break_minutes_remaining = self.manual_break_end_minute - current_minute
                return
            self.manual_break_end_minute = None
            self.break_kind = None
            self.break_minutes_remaining = 0
        for start, end, kind in self._real_break_windows():
            if start <= current_minute < end:
                self.break_kind = kind
                self.break_minutes_remaining = end - current_minute
                return
        self.break_kind = None
        self.break_minutes_remaining = 0

    def _reset_daily_counters(self) -> None:
        self.hours_completed_today = 0
        self.total_output = 0.0
        self.total_wages_paid = 0.0
        self.work_minutes_today = 0
        self.work_minutes_since_break = 0
        self.break_kind = None
        self.break_minutes_remaining = 0
        self.breaks_taken_today = 0
        self.lunch_taken_today = False

    def advance_workspace_hour(self) -> None:
        """Process one wall-clock hour, including any scheduled break."""
        if self.hour >= SHIFT_END and not self.policy.overtime_allowed:
            self._begin_next_day()
            return
        for _ in range(4):
            self.advance_workspace_minutes(15)

    def advance_workspace_minutes(self, minutes: int) -> int:
        """Advance in quarter-hour slices so 2.5-hour breaks stay precise."""
        if minutes <= 0:
            return 0
        hours_advanced = 0
        for _ in range(max(1, minutes // 15)):
            hours_advanced += int(self._advance_quarter_hour())
        return hours_advanced

    def _within_work_window(self) -> bool:
        end_hour = self.policy.overtime_end_hour if self.policy.overtime_allowed else SHIFT_END
        return SHIFT_START <= self.hour < end_hour

    def _maybe_start_scheduled_break(self) -> bool:
        if not self.policy.auto_breaks or self.policy.eat_at_desk:
            return False
        if not self.lunch_taken_today and self.work_minutes_today >= self.policy.meal_after_work_minutes:
            return self.start_break("lunch")
        if self.work_minutes_since_break >= self.policy.short_break_every_minutes:
            return self.start_break("short")
        return False

    def _advance_clock(self, minutes: int) -> None:
        total = self.hour * 60 + self.minute + minutes
        self.hour = total // 60
        self.minute = total % 60

    def _advance_quarter_hour(self) -> bool:
        if self.hour >= SHIFT_END and not self.policy.overtime_allowed:
            self._begin_next_day()
            return False

        if self.break_kind is not None:
            self.break_minutes_remaining -= 15
            self._advance_clock(15)
            if self.break_minutes_remaining <= 0:
                self.break_kind = None
                self.break_minutes_remaining = 0
                self.work_minutes_since_break = 0
                self.notice = "BACK TO WORK"
            return False

        if not self._within_work_window():
            self._begin_next_day()
            return False

        if self._maybe_start_scheduled_break():
            self.break_minutes_remaining -= 15
            self._advance_clock(15)
            if self.break_minutes_remaining <= 0:
                self.break_kind = None
                self.break_minutes_remaining = 0
                self.work_minutes_since_break = 0
                self.notice = "BACK TO WORK"
            return False

        previous_hour = self.hour
        self.work_minutes_today += 15
        self.work_minutes_since_break += 15
        self._advance_clock(15)
        if self.minute == 0 and self.hour > previous_hour:
            self.total_output += self.roster.work_hour(self, previous_hour)
            self.hours_completed_today += 1
            end_hour = self.policy.overtime_end_hour if self.policy.overtime_allowed else SHIFT_END
            if self.hour == end_hour:
                self.total_wages_paid += self.roster.settle_daily_wages(self)
            return True
        return False

    def _begin_next_day(self) -> None:
        self.day += 1
        self.hour = SHIFT_START
        self.minute = 0
        self.hours_completed_today = 0
        self.total_output = 0.0
        self.total_wages_paid = 0.0
        self.selected_worker = None
        self.work_minutes_today = 0
        self.work_minutes_since_break = 0
        self.break_kind = None
        self.break_minutes_remaining = 0
        self.breaks_taken_today = 0
        self.lunch_taken_today = False
        self.notice = f"DAY {self.day:02d} STARTED"
        for worker in self.roster.workers:
            worker.rest_overnight()