"""Existing SALARYMAN screens and explicitly purchasable Tower storefronts.

Other businesses remain informational until a supported service or catalog
allowlist is implemented; this module never grants generic shop access.
"""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

BUSINESS_SERVICE_ACTIONS: dict[str, tuple[str, ...]] = {
    "banco_ombra": ("bank_balance", "gold_exchange"),
    "tower_realty": ("real_estate",),
    "shadow_cafeteria": ("read_only_stock",),
    "tower_clinic": ("read_only_stock",),
    "tower_pharmacy": ("read_only_stock",),
    "fish-store": ("read_only_stock",),
    "furniture-store": ("read_only_stock",),
    "phone_store_f03": ("phone", "read_only_stock"),
    "phone_store_f05": ("phone",),
    "jewelry_store": ("gold_exchange", "read_only_stock"),
}

PURCHASABLE_BUSINESSES = frozenset({
    "fish-store",
    "furniture-store",
    "formal_clothing_store",
    "tool_store",
    "book_store",
    "plant_store",
    "android_replicant_repair",
    "vespa_shop",
    "tower_terminal_repair",
    "vehicle_dealership",
    "shadow_cafeteria",
    "tower_clinic",
    "tower_pharmacy",
    "phone_store_f03",
    "liquor_store",
    "office_equipment_store",
    "jewelry_store",
    "tea_shop",
    "shoe_store",
    "music_shop",
    "mirror_shop",
    "lighting_store",
    "cafe_f04",
    "antique_shop_f04",
    "record_store",
    "restaurant",
    "antique_shop_f05",
    "phone_store_f05",
    "tv_store",
    "mattress_store",
    "hostel",
    "salon",
    "barber",
    "radio_station",
    "music_studio",
    "school",
    "art_supply_store",
    "meeting_room",
    "public_workspace",
    "study_hall",
    "flower_shop",
    "tower_admin",
    "tower_shipping",
    "tower_trash",
    "tower_food_supply",
    "tower_construction",
    "tower_materials_supply",
    "tower_power",
    "tower_water",
})

RETAIL_BUSINESSES = frozenset({
    "shadow_cafeteria", "tower_clinic", "tower_pharmacy", "fish-store",
    "furniture-store", "phone_store_f03", "liquor_store",
    "office_equipment_store", "jewelry_store", "tea_shop", "shoe_store",
    "music_shop", "mirror_shop", "lighting_store", "cafe_f04",
    "antique_shop_f04", "record_store", "book_store", "restaurant",
    "antique_shop_f05", "phone_store_f05", "tv_store", "mattress_store",
    "hostel", "salon", "barber", "art_supply_store", "public_workspace",
    "study_hall", "flower_shop",
})

BUSINESS_HOURS = {
    "always": (frozenset(range(7)), "00:00", "24:00"),
    "all_day_six": (frozenset(range(6)), "00:00", "24:00"),
    "day": (frozenset(range(5)), "08:00", "18:00"),
    "service": (frozenset(range(6)), "06:00", "22:00"),
    "food": (frozenset(range(7)), "06:00", "22:00"),
    "night": (frozenset(range(7)), "17:00", "03:00"),
    "appointment": (frozenset(range(6)), "09:00", "20:00"),
    "finance": (frozenset(range(5)), "08:00", "17:00"),
}

_ALWAYS_OPEN = frozenset({"tower_pharmacy", "tower_trash", "tower_power", "tower_water"})
_ALL_DAY_SIX = frozenset({
    "tower_shipping", "tower_food_supply", "tower_construction", "tower_materials_supply",
})
_FOOD_SERVICE = frozenset({"shadow_cafeteria", "restaurant", "cafe_f04", "tea_shop"})
_NIGHT_SERVICE = frozenset({"liquor_store"})
_APPOINTMENT_SERVICE = frozenset({"tower_clinic", "salon", "barber"})
_FINANCE_SERVICE = frozenset({"banco_ombra"})


def business_hours_profile(business_key: str) -> str:
    if business_key in _ALWAYS_OPEN:
        return "always"
    if business_key in _ALL_DAY_SIX:
        return "all_day_six"
    if business_key in _FOOD_SERVICE:
        return "food"
    if business_key in _NIGHT_SERVICE:
        return "night"
    if business_key in _APPOINTMENT_SERVICE:
        return "appointment"
    if business_key in _FINANCE_SERVICE:
        return "finance"
    if business_key == "tower_admin":
        return "day"
    return "service"


def business_hours_status(
    business_key: str,
    now: datetime | None = None,
) -> tuple[bool, str]:
    """Return current open state and the posted Minx City hours."""
    profile = business_hours_profile(business_key)
    days, opens_at, closes_at = BUSINESS_HOURS[profile]
    timezone = ZoneInfo("America/Los_Angeles")
    current = now or datetime.now(timezone)
    current = current.replace(tzinfo=timezone) if current.tzinfo is None else current.astimezone(timezone)
    minute = current.hour * 60 + current.minute
    open_minute = int(opens_at[:2]) * 60 + int(opens_at[3:])
    close_minute = int(closes_at[:2]) * 60 + int(closes_at[3:])
    if close_minute > open_minute:
        is_open = current.weekday() in days and open_minute <= minute < close_minute
    elif close_minute == open_minute:
        is_open = current.weekday() in days
    else:
        previous_day = (current.weekday() - 1) % 7
        is_open = (
            current.weekday() in days and minute >= open_minute
        ) or (
            previous_day in days and minute < close_minute
        )
    day_label = (
        "EVERY DAY" if len(days) == 7
        else "MON–SAT" if days == frozenset(range(6))
        else "MON–FRI" if days == frozenset(range(5))
        else "SIX DAYS"
    )
    return is_open, f"{day_label} {opens_at}–{closes_at}"


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
