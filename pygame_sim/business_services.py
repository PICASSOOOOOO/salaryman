"""Existing SALARYMAN screens that Tower business locations may open.

No retail flow is created here. Businesses without a real service screen remain
informational office spaces until a supported service is implemented.
"""

from __future__ import annotations

BUSINESS_SERVICE_ACTIONS: dict[str, tuple[str, ...]] = {
    "banco_ombra": ("bank_balance", "gold_exchange"),
    "tower_realty": ("real_estate",),
    "fish-store": ("read_only_stock",),
    "furniture-store": ("read_only_stock",),
    "phone_store_f03": ("phone",),
    "phone_store_f05": ("phone",),
    "jewelry_store": ("gold_exchange",),
}

BUSINESS_ACTION_LABELS: dict[str, str] = {
    "bank_balance": "VIEW BANCO OMBRA BALANCE",
    "gold_exchange": "OPEN FIAT / GOLD EXCHANGE",
    "real_estate": "OPEN REAL ESTATE",
    "read_only_stock": "VIEW READ-ONLY STOCK",
    "phone": "OPEN CALLL HOME / COMMS",
}

BUSINESS_PAGE_ACTIONS: dict[str, str] = {
    "bank_balance": "bank",
    "read_only_stock": "business_stock",
    "phone": "phone",
}

BUSINESS_LINK_ROUTES: dict[str, str] = {
    "gold_exchange": "/game/economy",
    "real_estate": "/store/realty",
}


def actions_for_business(business_key: str) -> tuple[str, ...]:
    """Return the explicit allowlist for a business screen."""
    return BUSINESS_SERVICE_ACTIONS.get(business_key, ())
