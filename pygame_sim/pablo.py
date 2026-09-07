"""Small, credential-free client for the shared Pablo capability surface."""

from __future__ import annotations

import json
from urllib.error import URLError
from urllib.request import Request, urlopen


def fetch_pablo_status(server_url: str, timeout: float = 2.0) -> dict[str, object]:
    """Read shared assistant status without sending user content or secrets."""
    if not server_url.strip():
        return {"clientSafe": True, "upgrade": "pablo-core-2026", "model": "offline", "active": False}
    url = f"{server_url.rstrip('/')}/api/chat/pablo/status"
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "SALARYMAN-desktop/1"})
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read(16_384).decode("utf-8"))
        if not isinstance(payload, dict) or payload.get("clientSafe") is not True:
            raise ValueError("unsafe Pablo status response")
        return payload
    except (OSError, URLError, ValueError, json.JSONDecodeError):
        return {"clientSafe": True, "upgrade": "pablo-core-2026", "model": "offline", "active": False}