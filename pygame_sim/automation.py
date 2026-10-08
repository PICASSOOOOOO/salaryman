"""Read-only connection to SALARYMAN autopilot status and its game characters."""

from __future__ import annotations

from dataclasses import dataclass
import json
import os
from pathlib import Path
import re
import threading
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


AUTOPILOT_DOMAINS = (
    "business_ops",
    "accounting",
    "crm_calls",
    "marketing",
    "creative_work",
    "market_research",
)


@dataclass(frozen=True)
class AutomationCharacter:
    domain: str
    name: str
    role: str
    room_id: str
    sprite: str
    accent: tuple[int, int, int]
    route: tuple[tuple[int, int], ...]
    work_stops: tuple[str, ...]
    speed: float
    app_label: str
    phase_seconds: float = 0.0


# Routes stay inside the existing first-floor rooms. They are deliberately
# separate from the employee loops so each automation has its own work circuit.
AUTOMATION_CHARACTERS = (
    AutomationCharacter(
        "business_ops", "PIP", "SHIFT COORDINATOR", "office_03",
        "characters/char_1.png", (91, 208, 155),
        ((5_250, 5_500), (6_700, 5_500), (6_700, 6_000), (5_250, 6_000)),
        ("SORT TASKS", "CHECK STAFFING", "ROUTE WORK", "UPDATE BOARD"),
        76.0,
        app_label="JOB COMMAND",
        phase_seconds=0.4,
    ),
    AutomationCharacter(
        "accounting", "LEDGER", "BOOKKEEPER", "executive",
        "characters/char_2.png", (242, 194, 96),
        ((1_100, 5_450), (2_450, 5_450), (2_450, 7_250), (1_100, 7_250)),
        ("RECONCILE", "CHECK BILLS", "REVIEW RUN", "BALANCE BOOKS"),
        66.0,
        app_label="ACCOUNTING",
        phase_seconds=1.7,
    ),
    AutomationCharacter(
        "crm_calls", "ECHO", "CLIENT CARE", "public",
        "characters/char_3.png", (105, 198, 207),
        ((3_150, 5_450), (4_650, 5_450), (4_650, 6_050), (3_150, 6_050)),
        ("SORT INBOX", "CHECK OPT-OUTS", "QUEUE FOLLOW-UP", "LOG ACTIVITY"),
        82.0,
        app_label="CONTACTS",
        phase_seconds=0.9,
    ),
    AutomationCharacter(
        "marketing", "KITE", "CAMPAIGN DESIGNER", "office_04",
        "characters/char_4.png", (238, 139, 103),
        ((7_450, 5_450), (8_850, 5_450), (8_850, 6_050), (7_450, 6_050)),
        ("DRAFT CAMPAIGN", "CHECK CHANNELS", "REVIEW QUEUE", "PREPARE POST"),
        79.0,
        app_label="MARKETING",
        phase_seconds=2.3,
    ),
    AutomationCharacter(
        "creative_work", "MUSE", "CREATIVE PARTNER", "recreation",
        "characters/char_5.png", (177, 153, 219),
        ((1_550, 3_700), (4_000, 3_700), (4_000, 4_900), (1_550, 4_900)),
        ("SHAPE A BRIEF", "REVIEW PROJECT", "SORT REFERENCES", "PREPARE DRAFT"),
        72.0,
        app_label="DARKROOM",
        phase_seconds=1.1,
    ),
    AutomationCharacter(
        "market_research", "SCOUT", "MARKET ANALYST", "office_03",
        "characters/char_1.png", (114, 187, 231),
        ((5_300, 6_650), (6_700, 6_650), (6_700, 7_200), (5_300, 7_200)),
        ("SCAN SOURCES", "COMPARE SIGNALS", "BUILD BRIEF", "QUEUE REVIEW"),
        70.0,
        app_label="INTELLIGENCE REPORTS",
        phase_seconds=2.8,
    ),
)


@dataclass(frozen=True)
class AutopilotDomainStatus:
    enabled: bool
    last_run_at: str | None


@dataclass(frozen=True)
class AutopilotSnapshot:
    state: str
    domains: dict[str, AutopilotDomainStatus]
    message: str | None
    revision: int


@dataclass(frozen=True)
class DesktopLink:
    server_url: str
    device_id: str
    credential: str


def default_desktop_link_path(override: str | Path | None = None) -> Path:
    if override:
        return Path(override).expanduser()
    configured = os.environ.get("SALARYMAN_DESKTOP_LINK_FILE")
    if configured:
        return Path(configured).expanduser()
    return Path.home() / ".salaryman" / "desktop-link.json"


def load_desktop_link(
    path: str | Path | None = None,
    *,
    fallback_server_url: str = "",
) -> DesktopLink | None:
    link_path = default_desktop_link_path(path)
    if not link_path.exists():
        return None
    try:
        payload = json.loads(link_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("Desktop link file is unreadable or invalid JSON") from exc
    if not isinstance(payload, dict):
        raise ValueError("Desktop link file must contain a JSON object")

    server_url = payload.get("serverUrl", fallback_server_url)
    device_id = payload.get("deviceId")
    credential = payload.get("credential")
    if (
        not isinstance(server_url, str)
        or not re.match(r"^https?://[^/\s]+", server_url)
        or not isinstance(device_id, str)
        or not re.fullmatch(r"[a-zA-Z0-9._:-]{8,128}", device_id)
        or not isinstance(credential, str)
        or not re.fullmatch(r"sm_desktop_[A-Za-z0-9_-]{40,60}", credential)
    ):
        raise ValueError("Desktop link file is missing a valid server URL or credential")
    return DesktopLink(server_url.rstrip("/"), device_id, credential)


def fetch_autopilot_snapshot(
    link: DesktopLink,
    *,
    opener: Callable[..., Any] = urlopen,
    timeout_seconds: float = 3.0,
) -> dict[str, AutopilotDomainStatus]:
    request = Request(
        f"{link.server_url}/api/autopilot/desktop-snapshot",
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {link.credential}",
            "X-Salaryman-Device-Id": link.device_id,
        },
        method="GET",
    )
    try:
        with opener(request, timeout=timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        # Do not copy the response body into UI/logs; it may contain account data.
        raise RuntimeError(f"HTTP_{exc.code}") from None
    except (URLError, TimeoutError, OSError):
        raise RuntimeError("NETWORK_UNAVAILABLE") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("INVALID_SERVER_RESPONSE") from exc

    if not isinstance(payload, dict) or not isinstance(payload.get("domains"), list):
        raise RuntimeError("INVALID_SERVER_RESPONSE")
    result: dict[str, AutopilotDomainStatus] = {}
    for item in payload["domains"]:
        if not isinstance(item, dict):
            raise RuntimeError("INVALID_SERVER_RESPONSE")
        domain = item.get("domain")
        enabled = item.get("enabled")
        last_run_at = item.get("lastRunAt")
        if domain not in AUTOPILOT_DOMAINS:
            continue
        if not isinstance(enabled, bool) or (
            last_run_at is not None and not isinstance(last_run_at, str)
        ):
            raise RuntimeError("INVALID_SERVER_RESPONSE")
        result[domain] = AutopilotDomainStatus(enabled, last_run_at)
    return result


class AutopilotPoller:
    """Poll status off the Pygame thread and discard stale data on link failure."""

    def __init__(
        self,
        link: DesktopLink | None,
        *,
        poll_interval_seconds: float = 45.0,
    ) -> None:
        self.link = link
        self.poll_interval_seconds = max(5.0, poll_interval_seconds)
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._snapshot = AutopilotSnapshot(
            "unlinked" if link is None else "connecting",
            {},
            "NO DESKTOP LINK" if link is None else None,
            0,
        )

    def start(self) -> None:
        if self.link is None or self._thread is not None:
            return
        self._thread = threading.Thread(target=self._run, name="salaryman-autopilot-status", daemon=True)
        self._thread.start()

    def _run(self) -> None:
        link = self.link
        if link is None:
            return
        while not self._stop.is_set():
            try:
                domains = fetch_autopilot_snapshot(link)
                snapshot = AutopilotSnapshot("connected", domains, None, 0)
            except RuntimeError as exc:
                reason = str(exc)
                message = {
                    "HTTP_401": "LINK REVOKED",
                    "HTTP_402": "AUTOMATION PLAN REQUIRED",
                    "HTTP_403": "AUTOMATION ACCESS DENIED",
                    "HTTP_404": "NO ACTIVE ORGANIZATION",
                    "NETWORK_UNAVAILABLE": "SERVER UNAVAILABLE",
                    "INVALID_SERVER_RESPONSE": "INVALID SERVER RESPONSE",
                }.get(reason, "STATUS SYNC FAILED")
                snapshot = AutopilotSnapshot("error", {}, message, 0)
            except Exception:
                snapshot = AutopilotSnapshot("error", {}, "STATUS SYNC FAILED", 0)

            with self._lock:
                self._snapshot = AutopilotSnapshot(
                    snapshot.state,
                    snapshot.domains,
                    snapshot.message,
                    self._snapshot.revision + 1,
                )
            if self._stop.wait(self.poll_interval_seconds):
                break

    def current(self) -> AutopilotSnapshot:
        with self._lock:
            return AutopilotSnapshot(
                self._snapshot.state,
                dict(self._snapshot.domains),
                self._snapshot.message,
                self._snapshot.revision,
            )

    def close(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=1.0)
