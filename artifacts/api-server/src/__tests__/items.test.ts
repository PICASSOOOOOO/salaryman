import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// Default: act as a normal (non-owner) player so the FIAT spend path runs.
// Individual tests flip this to exercise the free-grant branch.
vi.mock("../lib/plan", async (importActual) => ({
  ...(await importActual<typeof import("../lib/plan")>()),
  isOwnerEmail: vi.fn(() => false),
}));

// Wrap the real FIAT spend so most tests use the genuine deduction logic, but
// the concurrent-race test can override a single call to simulate a rival buy.
vi.mock("../lib/pablo-tax", async (importActual) => {
  const actual = await importActual<typeof import("../lib/pablo-tax")>();
  return { ...actual, spendEarnedFiat: vi.fn(actual.spendEarnedFiat) };
});

import request from "supertest";
import type { Express } from "express";
import { db, playerInventoryTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isOwnerEmail } from "../lib/plan";
import { spendEarnedFiat } from "../lib/pablo-tax";
import { computeGearStats } from "../lib/item-catalog";
import {
  buildApp,
  resetAuthState,
  cleanupTestData,
  seedFiat,
  fiatBalance,
  ownedItemIds,
  loadoutRows,
  itemQuantity,
  installedRows,
  ITEMS_USER,
} from "./helpers/itemsTestApp";

let app: Express;

// Cheap FIAT weapon used across the buy/equip tests.
const BAT = { id: "wpn_bat", price: 5500, slot: "weapon", attack: 16 };

beforeAll(() => {
  app = buildApp();
});
beforeEach(async () => {
  resetAuthState();
  vi.clearAllMocks();
  (isOwnerEmail as ReturnType<typeof vi.fn>).mockReturnValue(false);
  // Start every test from a clean slate so balances/ownership are deterministic.
  await cleanupTestData();
});
afterAll(async () => {
  await cleanupTestData();
});

describe("POST /items/buy", () => {
  it("401 when not authenticated", async () => {
    resetAuthState();
    const { authState } = await import("./helpers/itemsTestApp");
    authState.authed = false;
    const res = await request(app).post("/api/items/buy").send({ itemId: BAT.id });
    expect(res.status).toBe(401);
  });

  it("400 for an unknown item", async () => {
    const res = await request(app).post("/api/items/buy").send({ itemId: "nope_not_real" });
    expect(res.status).toBe(400);
  });

  it("success: debits FIAT and grants the item", async () => {
    await seedFiat(20000);
    const res = await request(app).post("/api/items/buy").send({ itemId: BAT.id });
    expect(res.status).toBe(200);
    expect(res.body.owned).toBe(true);
    expect(res.body.fiat).toBe(BAT.price);
    expect(res.body.newBalance).toBe(20000 - BAT.price);
    expect(await fiatBalance()).toBe(20000 - BAT.price);
    expect(await ownedItemIds()).toContain(BAT.id);
  });

  it("402 when the player can't afford it (balance untouched)", async () => {
    await seedFiat(100); // far below the price
    const res = await request(app).post("/api/items/buy").send({ itemId: BAT.id });
    expect(res.status).toBe(402);
    expect(res.body.error).toBe("insufficient_fiat");
    expect(res.body.required).toBe(BAT.price);
    expect(await fiatBalance()).toBe(100); // not charged
    expect(await ownedItemIds()).not.toContain(BAT.id);
  });

  it("already-owned: returns alreadyOwned and never charges", async () => {
    await seedFiat(20000);
    await db.insert(playerInventoryTable).values({
      userId: ITEMS_USER.id,
      slotIndex: 0,
      itemId: BAT.id,
      acquiredVia: "grant",
    });
    const res = await request(app).post("/api/items/buy").send({ itemId: BAT.id });
    expect(res.status).toBe(200);
    expect(res.body.alreadyOwned).toBe(true);
    expect(await fiatBalance()).toBe(20000); // untouched
    expect(spendEarnedFiat).not.toHaveBeenCalled();
    // Still exactly one copy owned.
    expect((await ownedItemIds()).filter((i) => i === BAT.id)).toHaveLength(1);
  });

  it("owner gets a free grant (no FIAT spent)", async () => {
    (isOwnerEmail as ReturnType<typeof vi.fn>).mockReturnValue(true);
    await seedFiat(20000);
    const res = await request(app).post("/api/items/buy").send({ itemId: BAT.id });
    expect(res.status).toBe(200);
    expect(res.body.granted).toBe(true);
    expect(await fiatBalance()).toBe(20000); // free
    expect(spendEarnedFiat).not.toHaveBeenCalled();
    expect(await ownedItemIds()).toContain(BAT.id);
  });

  it("pre-owned item returns without entering the atomic spend", async () => {
    await seedFiat(20000);
    await db.insert(playerInventoryTable).values({
      userId: ITEMS_USER.id,
      slotIndex: 0,
      itemId: BAT.id,
      acquiredVia: "fiat",
    });

    const res = await request(app).post("/api/items/buy").send({ itemId: BAT.id });
    expect(res.status).toBe(200);
    expect(res.body.alreadyOwned).toBe(true);
    expect(await fiatBalance()).toBe(20000);
    expect((await ownedItemIds()).filter((i) => i === BAT.id)).toHaveLength(1);
  });

  it("two real concurrent buys: item owned once, charged once", async () => {
    await seedFiat(20000);
    const [a, b] = await Promise.all([
      request(app).post("/api/items/buy").send({ itemId: BAT.id }),
      request(app).post("/api/items/buy").send({ itemId: BAT.id }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    // One request granted it, the other saw it already owned.
    const flags = [a.body, b.body].map((x) => x.alreadyOwned === true);
    expect(flags).toContain(true);
    expect((await ownedItemIds()).filter((i) => i === BAT.id)).toHaveLength(1);
    expect(await fiatBalance()).toBe(20000 - BAT.price); // charged exactly once
  });
});

describe("POST /items/equip & /items/unequip", () => {
  it("equip: 400 when the player doesn't own the item", async () => {
    const res = await request(app).post("/api/items/equip").send({ itemId: BAT.id });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("You don't own this item.");
  });

  it("equip: 400 for a non-equippable item", async () => {
    // Furniture has equipSlot null.
    await db.insert(playerInventoryTable).values({
      userId: ITEMS_USER.id,
      slotIndex: 0,
      itemId: "furn_desk",
      acquiredVia: "grant",
    });
    const res = await request(app).post("/api/items/equip").send({ itemId: "furn_desk" });
    expect(res.status).toBe(400);
  });

  it("equip an owned item then unequip it, with stats reflecting the change", async () => {
    await db.insert(playerInventoryTable).values({
      userId: ITEMS_USER.id,
      slotIndex: 0,
      itemId: BAT.id,
      acquiredVia: "grant",
    });

    const equip = await request(app).post("/api/items/equip").send({ itemId: BAT.id });
    expect(equip.status).toBe(200);
    expect(equip.body.ok).toBe(true);
    expect(equip.body.loadout[BAT.slot]).toBe(BAT.id);
    expect(equip.body.stats.attack).toBe(BAT.attack);
    expect((await loadoutRows()).some((r) => r.itemId === BAT.id)).toBe(true);

    const unequip = await request(app).post("/api/items/unequip").send({ equipSlot: BAT.slot });
    expect(unequip.status).toBe(200);
    expect(unequip.body.ok).toBe(true);
    expect(unequip.body.loadout[BAT.slot]).toBeUndefined();
    expect(unequip.body.stats.attack).toBe(0);
    expect(await loadoutRows()).toHaveLength(0);
  });

  it("equipping a second weapon overwrites the slot (one item per slot)", async () => {
    await db.insert(playerInventoryTable).values([
      { userId: ITEMS_USER.id, slotIndex: 0, itemId: "wpn_briefcase", acquiredVia: "grant" },
      { userId: ITEMS_USER.id, slotIndex: 0, itemId: BAT.id, acquiredVia: "grant" },
    ]);
    await request(app).post("/api/items/equip").send({ itemId: "wpn_briefcase" });
    const second = await request(app).post("/api/items/equip").send({ itemId: BAT.id });
    expect(second.status).toBe(200);
    expect(second.body.loadout.weapon).toBe(BAT.id);
    const rows = await loadoutRows();
    expect(rows.filter((r) => r.equipSlot === "weapon")).toHaveLength(1);
  });
});

// Cheap FIAT consumables used across the stacking/install tests.
const GAS = { id: "fuel_gas_can", price: 600 }; // installTargets: ["vehicle"]
const BATT = { id: "batt_aa", price: 800 }; // installTargets: home/vehicle/bot/companion
const VEHICLE = { id: "veh_horse" }; // a vehicle install target the player can own

describe("POST /items/buy (consumables)", () => {
  it("buys a stack: debits per-unit and increments quantity", async () => {
    await seedFiat(20000);
    const res = await request(app).post("/api/items/buy").send({ itemId: GAS.id, qty: 3 });
    expect(res.status).toBe(200);
    expect(res.body.owned).toBe(true);
    expect(res.body.quantity).toBe(3);
    expect(res.body.fiat).toBe(GAS.price * 3);
    expect(await fiatBalance()).toBe(20000 - GAS.price * 3);
    expect(await itemQuantity(GAS.id)).toBe(3);
  });

  it("buying again stacks onto the existing quantity (never duplicates rows)", async () => {
    await seedFiat(20000);
    await request(app).post("/api/items/buy").send({ itemId: GAS.id, qty: 2 });
    const res = await request(app).post("/api/items/buy").send({ itemId: GAS.id, qty: 4 });
    expect(res.status).toBe(200);
    expect(await itemQuantity(GAS.id)).toBe(6);
    const rows = await db
      .select()
      .from(playerInventoryTable)
      .where(eq(playerInventoryTable.itemId, GAS.id));
    expect(rows.filter((r) => r.userId === ITEMS_USER.id)).toHaveLength(1);
  });

  it("402 when the stack is unaffordable (quantity untouched)", async () => {
    await seedFiat(100);
    const res = await request(app).post("/api/items/buy").send({ itemId: GAS.id, qty: 5 });
    expect(res.status).toBe(402);
    expect(res.body.error).toBe("insufficient_fiat");
    expect(await itemQuantity(GAS.id)).toBe(0);
  });

  it("owner buys a stack for free", async () => {
    (isOwnerEmail as ReturnType<typeof vi.fn>).mockReturnValue(true);
    await seedFiat(20000);
    const res = await request(app).post("/api/items/buy").send({ itemId: GAS.id, qty: 3 });
    expect(res.status).toBe(200);
    expect(res.body.granted).toBe(true);
    expect(await fiatBalance()).toBe(20000); // free
    expect(await itemQuantity(GAS.id)).toBe(3);
  });
});

describe("POST /items/consume", () => {
  it("decrements the stack and deletes the row at zero", async () => {
    await seedFiat(20000);
    await request(app).post("/api/items/buy").send({ itemId: GAS.id, qty: 2 });
    const one = await request(app).post("/api/items/consume").send({ itemId: GAS.id, qty: 1 });
    expect(one.status).toBe(200);
    expect(await itemQuantity(GAS.id)).toBe(1);
    const two = await request(app).post("/api/items/consume").send({ itemId: GAS.id, qty: 1 });
    expect(two.status).toBe(200);
    expect(await itemQuantity(GAS.id)).toBe(0);
    expect((await ownedItemIds()).filter((i) => i === GAS.id)).toHaveLength(0);
  });

  it("409 when consuming more than held (stack untouched)", async () => {
    await seedFiat(20000);
    await request(app).post("/api/items/buy").send({ itemId: GAS.id, qty: 1 });
    const res = await request(app).post("/api/items/consume").send({ itemId: GAS.id, qty: 5 });
    expect(res.status).toBe(409);
    expect(await itemQuantity(GAS.id)).toBe(1);
  });

  it("400 for a non-consumable item", async () => {
    const res = await request(app).post("/api/items/consume").send({ itemId: BAT.id, qty: 1 });
    expect(res.status).toBe(400);
  });
});

describe("install / uninstall into owned targets", () => {
  // Make the player own a vehicle so it resolves as an install target.
  async function grantVehicle() {
    await db.insert(playerInventoryTable).values({
      userId: ITEMS_USER.id,
      slotIndex: 0,
      itemId: VEHICLE.id,
      acquiredVia: "grant",
    });
  }

  it("install: takes one from the stack and records it against the target", async () => {
    await seedFiat(20000);
    await grantVehicle();
    await request(app).post("/api/items/buy").send({ itemId: GAS.id, qty: 2 });

    const res = await request(app).post("/api/items/install").send({
      itemId: GAS.id, targetType: "vehicle", targetId: VEHICLE.id,
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.slotNo).toBe(0);
    expect(await itemQuantity(GAS.id)).toBe(1); // one moved out of the stack
    const installed = await installedRows();
    expect(installed).toHaveLength(1);
    expect(installed[0].targetId).toBe(VEHICLE.id);
    expect(installed[0].itemId).toBe(GAS.id);
  });

  it("install: 404 when the target isn't owned", async () => {
    await seedFiat(20000);
    await request(app).post("/api/items/buy").send({ itemId: GAS.id, qty: 1 });
    const res = await request(app).post("/api/items/install").send({
      itemId: GAS.id, targetType: "vehicle", targetId: VEHICLE.id,
    });
    expect(res.status).toBe(404);
    expect(await itemQuantity(GAS.id)).toBe(1); // nothing consumed
  });

  it("install: 400 when the item can't go into that target type", async () => {
    await seedFiat(20000);
    await grantVehicle();
    await request(app).post("/api/items/buy").send({ itemId: GAS.id, qty: 1 });
    // Gas cans only install into vehicles, never homes.
    const res = await request(app).post("/api/items/install").send({
      itemId: GAS.id, targetType: "home", targetId: "home_base",
    });
    expect(res.status).toBe(400);
  });

  it("install: 409 when the target is at capacity (vehicle holds 1)", async () => {
    await seedFiat(20000);
    await grantVehicle();
    await request(app).post("/api/items/buy").send({ itemId: GAS.id, qty: 1 });
    await request(app).post("/api/items/buy").send({ itemId: BATT.id, qty: 1 });
    const first = await request(app).post("/api/items/install").send({
      itemId: GAS.id, targetType: "vehicle", targetId: VEHICLE.id,
    });
    expect(first.status).toBe(200);
    const second = await request(app).post("/api/items/install").send({
      itemId: BATT.id, targetType: "vehicle", targetId: VEHICLE.id,
    });
    expect(second.status).toBe(409);
    expect(await itemQuantity(BATT.id)).toBe(1); // not consumed
    expect(await installedRows()).toHaveLength(1);
  });

  it("uninstall: returns one to the stack and clears the slot", async () => {
    await seedFiat(20000);
    await grantVehicle();
    await request(app).post("/api/items/buy").send({ itemId: GAS.id, qty: 1 });
    const ins = await request(app).post("/api/items/install").send({
      itemId: GAS.id, targetType: "vehicle", targetId: VEHICLE.id,
    });
    expect(await itemQuantity(GAS.id)).toBe(0);
    const res = await request(app).post("/api/items/uninstall").send({
      targetType: "vehicle", targetId: VEHICLE.id, slotNo: ins.body.slotNo,
    });
    expect(res.status).toBe(200);
    expect(res.body.uninstalled).toBe(GAS.id);
    expect(await itemQuantity(GAS.id)).toBe(1); // returned to the stack
    expect(await installedRows()).toHaveLength(0);
  });

  it("uninstall: 404 when nothing is installed in that slot", async () => {
    await grantVehicle();
    const res = await request(app).post("/api/items/uninstall").send({
      targetType: "vehicle", targetId: VEHICLE.id, slotNo: 0,
    });
    expect(res.status).toBe(404);
  });
});

describe("consumables can't be stored in the locker", () => {
  it("deposit: 400 for a consumable (stack stays in inventory)", async () => {
    await seedFiat(20000);
    await request(app).post("/api/items/buy").send({ itemId: GAS.id, qty: 3 });
    const res = await request(app).post("/api/items/storage/deposit").send({ itemId: GAS.id });
    expect(res.status).toBe(400);
    expect(await itemQuantity(GAS.id)).toBe(3); // untouched
  });
});

describe("computeGearStats resolver math", () => {
  it("returns all-zero stats for an empty loadout", () => {
    expect(computeGearStats([])).toEqual({ attack: 0, defense: 0, magic: 0, tech: 0 });
  });

  it("sums stats across equipped items", () => {
    // wpn_bat: attack 16; cloth_jumpsuit: defense 3; tech_neural: tech 38, magic 10.
    const total = computeGearStats(["wpn_bat", "cloth_jumpsuit", "tech_neural"]);
    expect(total).toEqual({ attack: 16, defense: 3, magic: 10, tech: 38 });
  });

  it("ignores unknown ids and non-equippable (furniture/decor) items", () => {
    const total = computeGearStats(["wpn_bat", "furn_desk", "decor_neon", "made_up_id"]);
    // Only the bat contributes; placed items have equipSlot null.
    expect(total).toEqual({ attack: 16, defense: 0, magic: 0, tech: 0 });
  });

  it("aggregates a legendary full loadout's multi-stat items correctly", () => {
    // wpn_plasma_lance: attack 140, magic 30, tech 30
    // armor_aegis: defense 95, magic 20, tech 25
    const total = computeGearStats(["wpn_plasma_lance", "armor_aegis"]);
    expect(total).toEqual({ attack: 140, defense: 95, magic: 50, tech: 55 });
  });
});
