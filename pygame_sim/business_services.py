"""Existing SALARYMAN screens and explicitly purchasable Tower storefronts.

Other businesses remain informational until a supported service or catalog
allowlist is implemented; this module never grants generic shop access.
"""

from __future__ import annotations

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
