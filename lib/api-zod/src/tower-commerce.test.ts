import { describe, expect, it } from "vitest";
import {
  SHADOW_TOWER_MAX_OFFICE_UNITS,
  getTowerBusinessConversation,
  getTowerBusinessPlacement,
  sortTowerBusinessesByExitPriority,
  TOWER_INFRASTRUCTURE_BUSINESSES,
  TOWER_BUSINESS_STOCK_LINES,
  TOWER_GHOST_LISTING,
} from "./index";

describe("Tower business exit placement", () => {
  it("keeps every catalog business uniquely addressable", () => {
    const keys = TOWER_INFRASTRUCTURE_BUSINESSES.map((business) => business.key);
    const tickers = TOWER_INFRASTRUCTURE_BUSINESSES.map((business) => business.ticker);
    const codes = TOWER_INFRASTRUCTURE_BUSINESSES.map((business) => business.code);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(tickers).size).toBe(tickers.length);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("assigns fixed-suite businesses to stable units within the four-unit floor contract", () => {
    const byFloor = new Map<number, number[]>();
    for (const business of TOWER_INFRASTRUCTURE_BUSINESSES) {
      const placement = getTowerBusinessPlacement(business);
      if (placement?.floorNumber != null && placement.unitNumber != null) {
        byFloor.set(placement.floorNumber, [...(byFloor.get(placement.floorNumber) ?? []), placement.unitNumber]);
      }
    }
    for (const units of byFloor.values()) {
      expect(units.length).toBeLessThanOrEqual(SHADOW_TOWER_MAX_OFFICE_UNITS);
      expect(new Set(units).size).toBe(units.length);
    }
  });

  it("ranks numbered floors from the exit upward without promoting lobby businesses", () => {
    const ranked = sortTowerBusinessesByExitPriority();
    const priorities = ranked
      .map((business) => getTowerBusinessPlacement(business)?.exitPriority)
      .filter((priority): priority is number => priority != null);
    expect(priorities.length).toBeGreaterThan(0);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
    expect(getTowerBusinessPlacement("lobby_gift_shop")?.exitPriority).toBeNull();
    expect(getTowerBusinessPlacement("tower_restaurant")?.exitPriority).toBe(12);
  });

  it("derives operator conversation fields from the canonical catalog", () => {
    const business = TOWER_INFRASTRUCTURE_BUSINESSES.find((item) => item.key === "tower_doctor")!;
    expect(getTowerBusinessConversation(business)).toEqual({
      businessName: business.name,
      role: `${business.category.toUpperCase()} · ${business.operatorCode}`,
      service: business.service,
      offer: business.ad,
    });
    expect(getTowerBusinessConversation("missing-business")).toBeNull();
  });
});

describe("Tower business stock catalog", () => {
  it("keeps product families specialized and ready for bounded NPC improvements", () => {
    const listingIds = TOWER_BUSINESS_STOCK_LINES.map((listing) => listing.id);
    expect(new Set(listingIds).size).toBe(listingIds.length);
    expect(listingIds).toEqual(
      expect.arrayContaining([
        "fine-rugs",
        "lamps",
        "desks",
        "chairs",
        "terminals",
        "aquariums-and-fish",
        "water-coolers",
        "vending-machines",
        "atms",
        "education-books",
        "common-table-shift-meal",
        "lumen-care-triage-kit",
        "third-shift-pharmacy-dose",
        "mender9-field-terminal",
        "tower-phone-store-handset",
        "tower-liquor-store-reserve",
        "tower-office-equipment",
        "tower-jewelry-watch",
        "tower-tea-shop-blend",
        "tower-shoe-store-workboots",
        "floor4-music-instrument",
        "floor4-mirror",
        "floor4-lighting",
        "floor4-cafe",
        "floor4-antique",
        "floor4-records",
        "floor5-restaurant-meal",
        "floor5-antique",
        "floor5-phone",
        "floor5-tv",
        "floor5-mattress",
        "floor5-hostel-stay",
        "floor5-salon-refresh",
        "floor5-barber-trim",
        "floor6-radio-pass",
        "floor6-studio-session",
        "floor6-school-course",
        "floor6-art-supplies",
        "floor6-meeting-room-pass",
        "floor6-workspace-pass",
        "floor6-study-course",
        "floor6-flower-shop",
        "b1-admin-pass",
        "b1-shipping-manifest",
        "b1-waste-sorting-kit",
        "b1-food-crate",
        "b1-construction-kit",
        "b1-materials-bundle",
        "b1-power-cell",
        "b1-water-ration",
      ]),
    );
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "common-table-shift-meal"))
      .toMatchObject({
        sellerBusinessKey: "shadow_cafeteria",
        itemIds: ["tower_meal_common_table"],
        priceSource: "catalog_item",
      });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "lumen-care-triage-kit"))
      .toMatchObject({
        sellerBusinessKey: "tower_clinic",
        itemIds: ["tower_clinic_triage_kit"],
        priceSource: "catalog_item",
      });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "third-shift-pharmacy-dose"))
      .toMatchObject({
        sellerBusinessKey: "tower_pharmacy",
        itemIds: ["tower_pharmacy_recovery_dose"],
        priceSource: "catalog_item",
      });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "tower-phone-store-handset"))
      .toMatchObject({ sellerBusinessKey: "phone_store_f03", itemIds: ["tower_phone_handset"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "tower-liquor-store-reserve"))
      .toMatchObject({ sellerBusinessKey: "liquor_store", itemIds: ["tower_house_reserve"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "tower-office-equipment"))
      .toMatchObject({ sellerBusinessKey: "office_equipment_store", itemIds: ["tower_document_scanner"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "tower-jewelry-watch"))
      .toMatchObject({ sellerBusinessKey: "jewelry_store", itemIds: ["tower_ombra_watch"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "tower-tea-shop-blend"))
      .toMatchObject({ sellerBusinessKey: "tea_shop", itemIds: ["tower_tea_blend"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "tower-shoe-store-workboots"))
      .toMatchObject({ sellerBusinessKey: "shoe_store", itemIds: ["tower_service_boots"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor4-music-instrument"))
      .toMatchObject({ sellerBusinessKey: "music_shop", itemIds: ["towerline_synth"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor4-mirror"))
      .toMatchObject({ sellerBusinessKey: "mirror_shop", itemIds: ["tower_smoked_mirror"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor4-lighting"))
      .toMatchObject({ sellerBusinessKey: "lighting_store", itemIds: ["tower_work_lights"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor4-cafe"))
      .toMatchObject({ sellerBusinessKey: "cafe_f04", itemIds: ["tower_atrium_latte"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor4-antique"))
      .toMatchObject({ sellerBusinessKey: "antique_shop_f04", itemIds: ["tower_brass_clock"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor4-records"))
      .toMatchObject({ sellerBusinessKey: "record_store", itemIds: ["tower_afterhours_record"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor5-restaurant-meal"))
      .toMatchObject({ sellerBusinessKey: "restaurant", itemIds: ["tower_night_kitchen_plate"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor5-antique"))
      .toMatchObject({ sellerBusinessKey: "antique_shop_f05", itemIds: ["tower_f05_brass_lamp"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor5-phone"))
      .toMatchObject({ sellerBusinessKey: "phone_store_f05", itemIds: ["tower_phone_handset"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor5-tv"))
      .toMatchObject({ sellerBusinessKey: "tv_store", itemIds: ["tower_office_television"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor5-mattress"))
      .toMatchObject({ sellerBusinessKey: "mattress_store", itemIds: ["tower_shift_mattress"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor5-hostel-stay"))
      .toMatchObject({ sellerBusinessKey: "hostel", itemIds: ["tower_hostel_recovery_pass"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor5-salon-refresh"))
      .toMatchObject({ sellerBusinessKey: "salon", itemIds: ["tower_salon_refresh"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor5-barber-trim"))
      .toMatchObject({ sellerBusinessKey: "barber", itemIds: ["tower_barber_trim"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor6-radio-pass"))
      .toMatchObject({ sellerBusinessKey: "radio_station", itemIds: ["tower_radio_pass"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor6-studio-session"))
      .toMatchObject({ sellerBusinessKey: "music_studio", itemIds: ["tower_studio_session"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor6-school-course"))
      .toMatchObject({ sellerBusinessKey: "school", itemIds: ["tower_work_readiness_course"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor6-art-supplies"))
      .toMatchObject({ sellerBusinessKey: "art_supply_store", itemIds: ["tower_art_material_kit"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor6-meeting-room-pass"))
      .toMatchObject({ sellerBusinessKey: "meeting_room", itemIds: ["tower_meeting_booking"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor6-workspace-pass"))
      .toMatchObject({ sellerBusinessKey: "public_workspace", itemIds: ["tower_workspace_day_pass"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor6-study-course"))
      .toMatchObject({ sellerBusinessKey: "study_hall", itemIds: ["tower_study_focus_course"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "floor6-flower-shop"))
      .toMatchObject({ sellerBusinessKey: "flower_shop", itemIds: ["tower_office_bouquet"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "b1-admin-pass"))
      .toMatchObject({ sellerBusinessKey: "tower_admin", itemIds: ["tower_admin_pass"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "b1-shipping-manifest"))
      .toMatchObject({ sellerBusinessKey: "tower_shipping", itemIds: ["tower_priority_manifest"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "b1-waste-sorting-kit"))
      .toMatchObject({ sellerBusinessKey: "tower_trash", itemIds: ["tower_waste_sorting_kit"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "b1-food-crate"))
      .toMatchObject({ sellerBusinessKey: "tower_food_supply", itemIds: ["tower_food_supply_crate"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "b1-construction-kit"))
      .toMatchObject({ sellerBusinessKey: "tower_construction", itemIds: ["tower_construction_starter_kit"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "b1-materials-bundle"))
      .toMatchObject({ sellerBusinessKey: "tower_materials_supply", itemIds: ["tower_materials_bundle"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "b1-power-cell"))
      .toMatchObject({ sellerBusinessKey: "tower_power", itemIds: ["batt_cell"] });
    expect(TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "b1-water-ration"))
      .toMatchObject({ sellerBusinessKey: "tower_water", itemIds: ["tower_water_ration"] });
    const seating = TOWER_BUSINESS_STOCK_LINES.find((listing) => listing.id === "chairs");
    expect(seating).toMatchObject({
      sellerBusinessKey: "furniture-store",
      itemIds: ["furn_couch"],
      priceSource: "catalog_item",
    });
    for (const listing of TOWER_BUSINESS_STOCK_LINES) {
      expect(listing.npcProductFamily).toBeTruthy();
      expect(listing.npcVersion).toBe(1);
      expect(listing.npcExpansion.scope).toBe("specialty_only");
      expect(listing.npcExpansion.simulationEnabled).toBe(false);
    }
    expect(TOWER_GHOST_LISTING).toMatchObject({
      availability: "direct_npc",
      requiresProximityInteraction: true,
      itemIds: [],
      stockStatus: "not_provided",
      priceSource: "quoted_in_person",
    });
  });
});