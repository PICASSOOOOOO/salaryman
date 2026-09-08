"""Global simulation state and calibrated workspace-time loop."""

from __future__ import annotations

import json
import random
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Literal

from .models import ActionKind, LedgerEntry, OfficeRoster, RecruitCandidate, Worker


SECONDS_PER_WORKSPACE_HOUR = 2.0
SECONDS_PER_WORKSPACE_QUARTER_HOUR = SECONDS_PER_WORKSPACE_HOUR / 4
SHIFT_START = 9
SHIFT_END = 17
BreakKind = Literal["short", "lunch"]
GameRole = Literal["player", "moderator", "admin"]
OverlayPage = Literal["tools", "economy"]
RECRUITMENT_REFRESH_COST = 50.0
DECAY_PER_WORKSPACE_MINUTE = 0.07
MAINTENANCE_BASE_COST = 40.0
MAINTENANCE_DECAY_REDUCTION = 24.0
RECRUITMENT_POOL: tuple[RecruitCandidate, ...] = (
    RecruitCandidate("Devin Wright", "OPERATIONS ASSOCIATE", 330.0, 300.0, 400.0, (96, 165, 250)),
    RecruitCandidate("Clara Oswald", "CLIENT SUCCESS LEAD", 410.0, 360.0, 750.0, (244, 114, 182)),
    RecruitCandidate("Marcus Vance", "SYSTEMS ANALYST", 520.0, 460.0, 1200.0, (167, 139, 250)),
    RecruitCandidate("Sarah Connor", "REVENUE DIRECTOR", 680.0, 600.0, 2200.0, (251, 146, 60)),
    RecruitCandidate("Ada Lovelace", "AUTOMATION ARCHITECT", 860.0, 760.0, 5000.0, (45, 212, 191)),
    RecruitCandidate("Alan Turing", "RESEARCH DIRECTOR", 1100.0, 980.0, 12000.0, (74, 222, 128)),
)


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
    office_inventory: dict[str, int] = field(default_factory=dict)
    last_arcade_game: str | None = None
    recruitment_candidates: list[RecruitCandidate] = field(default_factory=list)
    recruitment_open: bool = False
    role: GameRole = "player"
    active_page: OverlayPage | None = None
    page_source: str | None = None
    tool_menu_open: bool = False
    decay: float = 8.0
    maintenance_runs: int = 0

    @classmethod
    def with_default_roster(
        cls,
        *,
        real_time: bool = False,
        role: GameRole = "player",
    ) -> OfficeState:
        state = cls(real_time=real_time, role=cls.normalize_role(role))
        state.roster.workers.extend(
            [
                Worker(
                    "Mara Voss",
                    "CIRCULARITY LEAD",
                    300.0,
                    300.0,
                    (71, 190, 154),
                    stamina_gain_per_hour=2.5,
                ),
                Worker(
                    "Ivo Chen",
                    "SYSTEMS GROWER",
                    420.0,
                    420.0,
                    (248, 185, 87),
                    stamina_gain_per_hour=2.0,
                    coffee_cost=22.0,
                ),
                Worker(
                    "Nia Okafor",
                    "COMMUNITY OPS",
                    350.0,
                    350.0,
                    (240, 119, 103),
                    stamina_gain_per_hour=3.0,
                    coffee_cost=16.0,
                ),
            ]
        )
        state.ledger.append(LedgerEntry("OPENING CAPITAL", state.funds, state.funds))
        state.refresh_recruitment_candidates(charge=False)
        if state.real_time:
            state.sync_real_time()
        return state

    @staticmethod
    def normalize_role(role: str) -> GameRole:
        if role == "admin":
            return "admin"
        if role in {"moderator", "mod"}:
            return "moderator"
        return "player"

    @property
    def has_operator_access(self) -> bool:
        return self.role in {"admin", "moderator"}

    @property
    def decay_ratio(self) -> float:
        return max(0.0, min(1.0, self.decay / 100.0))

    @property
    def decay_label(self) -> str:
        if self.decay >= 75:
            return "CRITICAL"
        if self.decay >= 45:
            return "UNSTABLE"
        if self.decay >= 20:
            return "WEARING"
        return "STABLE"

    @property
    def decay_efficiency_multiplier(self) -> float:
        """Decay lowers output without making the office permanently unusable."""
        return max(0.58, 1.0 - self.decay_ratio * 0.42)

    def open_page(
        self,
        page: OverlayPage,
        *,
        from_object: bool = False,
        source: str = "OBJECT",
    ) -> bool:
        """Open shared pages while keeping operator tools role-gated."""
        if not from_object and not self.has_operator_access:
            self.notice = "ACCESS DENIED / FIND THE LIVE OBJECT"
            return False
        self.active_page = page
        self.page_source = source
        self.tool_menu_open = False
        self.notice = f"{page.upper()} PAGE / {source}"
        return True

    def close_page(self) -> None:
        self.active_page = None
        self.page_source = None
        self.tool_menu_open = False

    def toggle_tool_menu(self) -> bool:
        if not self.has_operator_access:
            self.notice = "OPERATOR TOOLS LOCKED / USE LIVE OBJECTS"
            return False
        if self.active_page is not None:
            self.close_page()
        else:
            self.tool_menu_open = not self.tool_menu_open
            self.notice = "OPERATOR MENU OPEN" if self.tool_menu_open else "OPERATOR MENU CLOSED"
        return True

    def repair_decay(self) -> bool:
        """Pay for a focused maintenance cycle and restore office efficiency."""
        if self.decay <= 0:
            self.notice = "SYSTEMS STABLE / NO MAINTENANCE NEEDED"
            return False
        cost = MAINTENANCE_BASE_COST + round(self.decay * 0.5, 2)
        if not self.remove_funds(cost, "MAINTENANCE / DECAY CONTROL"):
            self.notice = f"MAINTENANCE DENIED / ƒ{cost:,.0f} REQUIRED"
            return False
        self.decay = max(0.0, round(self.decay - MAINTENANCE_DECAY_REDUCTION, 2))
        self.maintenance_runs += 1
        self.notice = f"MAINTENANCE COMPLETE / DECAY {self.decay:,.1f}%"
        return True

    def _increase_decay(self, minutes: int) -> None:
        if minutes > 0:
            self.decay = min(100.0, round(self.decay + minutes * DECAY_PER_WORKSPACE_MINUTE, 2))

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

    def purchase_office_item(self, item_id: str, cost: float, label: str) -> bool:
        """Purchase a local office item through the same ledger boundary as coffee."""
        if cost < 0 or not self.remove_funds(cost, label):
            return False
        self.office_inventory[item_id] = self.office_inventory.get(item_id, 0) + 1
        return True

    def toggle_recruitment(self) -> None:
        self.recruitment_open = not self.recruitment_open
        self.notice = "RECRUITMENT DESK OPEN" if self.recruitment_open else "WORKFLOOR OPEN"

    def refresh_recruitment_candidates(self, *, charge: bool = True) -> bool:
        """Refresh the hiring desk through the same ledger boundary as office spend."""
        if charge and not self.remove_funds(
            RECRUITMENT_REFRESH_COST,
            "RECRUITMENT DESK REFRESH",
        ):
            self.notice = f"REFRESH DENIED / ƒ{RECRUITMENT_REFRESH_COST:.0f} REQUIRED"
            return False
        self.recruitment_candidates = list(random.sample(RECRUITMENT_POOL, k=3))
        self.notice = "RECRUITMENT POOL REFRESHED"
        return True

    def hire_candidate(self, index: int) -> bool:
        """Hire a candidate and convert it into the existing Worker model."""
        if not 0 <= index < len(self.recruitment_candidates):
            return False
        candidate = self.recruitment_candidates[index]
        if not self.remove_funds(candidate.hiring_cost_fiat, f"HIRE / {candidate.name}"):
            self.notice = f"HIRE DENIED / ƒ{candidate.hiring_cost_fiat:,.0f} REQUIRED"
            return False

        self.roster.workers.append(
            Worker(
                candidate.name,
                candidate.role,
                candidate.productivity_per_hour,
                candidate.hourly_wage_fiat,
                candidate.accent,
            )
        )
        self.recruitment_candidates.pop(index)
        self.selected_worker = len(self.roster.workers) - 1
        self.notice = f"{candidate.name.upper()} JOINED THE TEAM"
        return True

    def save_to_file(self, path: str | Path) -> None:
        """Persist the office state without exposing persistence to the renderer."""
        destination = Path(path).expanduser()
        destination.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": 1,
            "funds": self.funds,
            "day": self.day,
            "hour": self.hour,
            "minute": self.minute,
            "selected_worker": self.selected_worker,
            "office_inventory": self.office_inventory,
            "decay": self.decay,
            "maintenance_runs": self.maintenance_runs,
            "workers": [
                {
                    "name": worker.name,
                    "role": worker.role,
                    "productivity_per_hour": worker.productivity_per_hour,
                    "hourly_wage_fiat": worker.hourly_wage_fiat,
                    "accent": list(worker.accent),
                    "wealth_fiat": worker.wealth_fiat,
                    "hunger": worker.hunger,
                    "stamina": worker.stamina,
                    "meals_eaten_today": worker.meals_eaten_today,
                }
                for worker in self.roster.workers
            ],
            "ledger": [
                {"label": entry.label, "amount": entry.amount, "balance": entry.balance}
                for entry in self.ledger[-100:]
            ],
        }
        destination.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    @classmethod
    def load_from_file(
        cls,
        path: str | Path,
        *,
        real_time: bool = False,
        role: GameRole = "player",
    ) -> OfficeState:
        """Load a compatible save, falling back to a clean office on bad input."""
        destination = Path(path).expanduser()
        state = cls.with_default_roster(real_time=real_time, role=role)
        if not destination.exists():
            return state
        try:
            payload = json.loads(destination.read_text(encoding="utf-8"))
            workers = [
                Worker(
                    str(item["name"]),
                    str(item.get("role", "TEAM MEMBER")),
                    float(item["productivity_per_hour"]),
                    float(item["hourly_wage_fiat"]),
                    tuple(item.get("accent", [71, 190, 154])),
                    wealth_fiat=float(item.get("wealth_fiat", 300.0)),
                    hunger=float(item.get("hunger", 18.0)),
                    stamina=float(item.get("stamina", 70.0)),
                    meals_eaten_today=int(item.get("meals_eaten_today", 0)),
                )
                for item in payload.get("workers", [])
            ]
            if workers:
                state.roster.workers = workers
            state.funds = float(payload.get("funds", state.funds))
            state.day = max(1, int(payload.get("day", state.day)))
            state.hour = max(0, min(23, int(payload.get("hour", state.hour))))
            state.minute = max(0, min(59, int(payload.get("minute", state.minute))))
            state.selected_worker = payload.get("selected_worker")
            state.office_inventory = {
                str(key): max(0, int(value))
                for key, value in payload.get("office_inventory", {}).items()
            }
            state.decay = max(0.0, min(100.0, float(payload.get("decay", state.decay))))
            state.maintenance_runs = max(0, int(payload.get("maintenance_runs", 0)))
            entries = payload.get("ledger", [])
            if entries:
                state.ledger = [
                    LedgerEntry(str(item["label"]), float(item["amount"]), float(item["balance"]))
                    for item in entries
                ]
            state.notice = "OFFICE RECORD RESTORED"
            state.refresh_recruitment_candidates(charge=False)
        except (OSError, TypeError, ValueError, KeyError, json.JSONDecodeError):
            state.notice = "NEW OFFICE RECORD"
        return state

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
            self.roster.eat_meals()
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
        fresh = OfficeState.with_default_roster(real_time=self.real_time, role=self.role)
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
        self.office_inventory = {}
        self.last_arcade_game = None
        self.recruitment_candidates = []
        self.recruitment_open = False
        self.active_page = None
        self.page_source = None
        self.tool_menu_open = False
        self.decay = fresh.decay
        self.maintenance_runs = 0
        fresh.refresh_recruitment_candidates(charge=False)
        self.recruitment_candidates = fresh.recruitment_candidates
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
            self.work_minutes_today = self._real_work_minutes_until(current.hour * 60 + current.minute)
            for work_hour in range(self.last_real_hour, current.hour):
                self._increase_decay(60)
                if self._real_hour_is_working(work_hour):
                    self.total_output += self.roster.work_hour(self, work_hour)
                    self.hours_completed_today += 1
                    end_hour = self.policy.overtime_end_hour if self.policy.overtime_allowed else SHIFT_END
                    if work_hour + 1 == end_hour:
                        self.total_wages_paid += self.roster.settle_daily_wages(self)
            self.last_real_hour = current.hour
        elif self.last_real_hour is not None and current.hour < self.last_real_hour:
            # Re-anchor after a same-day clock correction. This also keeps
            # deterministic callers that sample an earlier wall-clock time
            # from silently skipping the rest of that workday.
            self.last_real_hour = current.hour

        self.hour = current.hour
        self.minute = current.minute
        self.work_minutes_today = self._real_work_minutes_until(current.hour * 60 + current.minute)
        if (
            self.policy.eat_at_desk
            and not self.lunch_taken_today
            and self.work_minutes_today >= self.policy.meal_after_work_minutes
        ):
            self.roster.eat_meals()
            self.lunch_taken_today = True
            self.notice = "MEAL AT DESK"
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

    def _real_work_minutes_until(self, current_minute: int) -> int:
        start = SHIFT_START * 60
        end_hour = self.policy.overtime_end_hour if self.policy.overtime_allowed else SHIFT_END
        end = end_hour * 60
        elapsed = max(0, min(current_minute, end) - start)
        for break_start, break_end, _ in self._real_break_windows():
            elapsed -= max(0, min(current_minute, break_end) - break_start)
        return max(0, elapsed)

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
                if self.break_kind != kind:
                    self.breaks_taken_today += 1
                    if kind == "lunch":
                        self.lunch_taken_today = True
                        self.roster.eat_meals()
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
        self._increase_decay(15)
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

        if (
            self.policy.eat_at_desk
            and not self.lunch_taken_today
            and self.work_minutes_today >= self.policy.meal_after_work_minutes
        ):
            self.roster.eat_meals()
            self.lunch_taken_today = True
            self.notice = "MEAL AT DESK"

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