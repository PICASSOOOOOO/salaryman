/**
 * Fleet Vehicle Rental API
 *
 * Orgs can register up to 5 rental vehicles. Players walk to the pickup pin,
 * pay upfront (1-4 hrs), get a speed boost for the duration. Returning to
 * the pin early gives a pro-rated refund. A cron every 2 min expires overdue
 * rentals and credits the org's checking account.
 *
 * Routes:
 *   GET  /fleet              — available vehicles (by city)
 *   POST /fleet              — org registers a vehicle (requires org admin)
 *   DELETE /fleet/:id        — org removes a vehicle
 *   POST /fleet/:id/rent     — player pays upfront, sets rental_ends_at
 *   POST /fleet/:id/return   — early return, pro-rate refund
 */
import { Router, type Request, type Response } from "express";
import {
  db, fleetVehiclesTable, bankAccountsTable, bankTransactionsTable, orgAccountsTable, orgAccountTransactionsTable,
} from "@workspace/db";
import { eq, and, lte, isNotNull, isNull, sql } from "drizzle-orm";
import { resolveCurrentOrgId, canDoInOrg } from "../lib/org-permissions";
import { ensureOrgAccounts, creditOrgAccount } from "./org-accounts";

const router = Router();

const VEHICLE_TYPES = new Set(["cargo_van", "courier_bike", "armored_transport", "off_road_rover", "boat"]);
const SPEED_BONUS: Record<string, number> = {
  cargo_van: 1.2,
  courier_bike: 1.4,
  armored_transport: 1.1,
  off_road_rover: 1.3,
  boat: 1.25,
};
const MAX_VEHICLES_PER_ORG = 5;
const MIN_RENT_HOURS = 1;
const MAX_RENT_HOURS = 4;

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return String((req.user as { id: string }).id);
}

function userName(req: Request): string {
  const u = req.user as any;
  return String(u?.firstName || u?.email?.split("@")[0] || "Anonymous").slice(0, 64);
}

async function getCheckingAccount(userId: string) {
  const accounts = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.userId, userId));
  return accounts.find((a) => a.kind === "checking") ?? accounts[0] ?? null;
}

// GET /fleet — available vehicles by city
router.get("/fleet", async (req: Request, res: Response) => {
  try {
    const city = String(req.query.city || "minx_prime");
    const rows = await db
      .select()
      .from(fleetVehiclesTable)
      .where(eq(fleetVehiclesTable.cityId, city));

    // Mark each as available or rented + attach speed bonus metadata
    const now = new Date();
    const enriched = rows.map((v) => ({
      ...v,
      speedBonus: SPEED_BONUS[v.vehicleType] ?? 1.0,
      available: !v.currentRenterUserId || (v.rentalEndsAt ? v.rentalEndsAt <= now : true),
    }));

    res.json({ vehicles: enriched });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed" });
  }
});

// POST /fleet — org admin registers a vehicle
router.post("/fleet", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const orgId = await resolveCurrentOrgId(userId);
    if (!orgId) { res.status(404).json({ error: "No active organization" }); return; }

    const gate = await canDoInOrg(userId, orgId, "org.settings");
    if (!gate.allowed) { res.status(403).json({ error: "Requires org admin or settings.edit" }); return; }

    const { vehicleType, name, rateFiatPerHr, pickupX, pickupY, cityId } = req.body ?? {};

    if (!VEHICLE_TYPES.has(String(vehicleType))) {
      res.status(400).json({ error: `vehicleType must be one of: ${[...VEHICLE_TYPES].join(", ")}` }); return;
    }
    if (!name || String(name).trim().length < 2) {
      res.status(400).json({ error: "name required" }); return;
    }
    const rate = Math.max(1, Math.min(10_000_000, parseInt(String(rateFiatPerHr || 100), 10) || 100));

    // Enforce per-org cap
    const existing = await db.select({ id: fleetVehiclesTable.id })
      .from(fleetVehiclesTable)
      .where(eq(fleetVehiclesTable.orgId, orgId));
    if (existing.length >= MAX_VEHICLES_PER_ORG) {
      res.status(400).json({ error: `Maximum ${MAX_VEHICLES_PER_ORG} vehicles per org` }); return;
    }

    // Fetch org name from accounts
    const orgAccts = await ensureOrgAccounts(orgId);
    const [orgRow] = await db
      .select({ name: sql<string>`'Fleet Operator'` })
      .from(orgAccountsTable)
      .where(eq(orgAccountsTable.orgId, orgId))
      .limit(1);

    const [created] = await db.insert(fleetVehiclesTable).values({
      orgId,
      orgName: "Fleet Operator",
      vehicleType: String(vehicleType),
      name: String(name).trim().slice(0, 64),
      rateFiatPerHr: rate,
      pickupX: parseFloat(String(pickupX || 0)) || 0,
      pickupY: parseFloat(String(pickupY || 0)) || 0,
      cityId: String(cityId || "minx_prime").slice(0, 32),
    }).returning();

    res.status(201).json({ vehicle: { ...created, speedBonus: SPEED_BONUS[created.vehicleType] ?? 1.0 } });
  } catch (e: any) {
    console.error("[fleet] POST error", e);
    res.status(500).json({ error: e?.message || "Failed to register vehicle" });
  }
});

// DELETE /fleet/:id — org removes vehicle (must not be actively rented)
router.delete("/fleet/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    const [row] = await db.select().from(fleetVehiclesTable).where(eq(fleetVehiclesTable.id, id)).limit(1);
    if (!row) { res.status(404).json({ error: "not found" }); return; }

    const gate = await canDoInOrg(userId, row.orgId, "org.settings");
    if (!gate.allowed) { res.status(403).json({ error: "Requires org admin" }); return; }
    if (row.currentRenterUserId) { res.status(409).json({ error: "Vehicle is currently rented — wait for return" }); return; }

    await db.delete(fleetVehiclesTable).where(eq(fleetVehiclesTable.id, id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to delete" });
  }
});

// POST /fleet/:id/rent — player pays upfront for 1-4 hrs
router.post("/fleet/:id/rent", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    const hours = Math.min(MAX_RENT_HOURS, Math.max(MIN_RENT_HOURS, parseInt(String(req.body?.hours || 1), 10) || 1));

    const result = await db.transaction(async (tx) => {
      const [vehicle] = await tx.select().from(fleetVehiclesTable)
        .where(eq(fleetVehiclesTable.id, id)).limit(1);
      if (!vehicle) return { status: 404, body: { error: "vehicle not found" } };

      const now = new Date();
      if (vehicle.currentRenterUserId && vehicle.rentalEndsAt && vehicle.rentalEndsAt > now) {
        return { status: 409, body: { error: "vehicle is currently rented" } };
      }

      const totalCost = vehicle.rateFiatPerHr * hours;
      const renterAcct = await getCheckingAccount(userId);
      if (!renterAcct) return { status: 404, body: { error: "No bank account" } };
      if (renterAcct.balance < totalCost) {
        return { status: 402, body: { error: "Insufficient funds", required: totalCost, balance: renterAcct.balance } };
      }

      const rentalEndsAt = new Date(now.getTime() + hours * 3_600_000);
      const renterName = userName(req);

      // Debit renter
      const newBal = renterAcct.balance - totalCost;
      await tx.update(bankAccountsTable)
        .set({ balance: newBal, updatedAt: new Date() })
        .where(eq(bankAccountsTable.id, renterAcct.id));
      await tx.insert(bankTransactionsTable).values({
        userId,
        accountId: renterAcct.id,
        kind: "vehicle_rental",
        description: `VEHICLE RENTAL: ${vehicle.name} (${vehicle.vehicleType}) — ${hours}h @ ƒ${vehicle.rateFiatPerHr}/hr`,
        amount: -totalCost,
        balanceAfter: newBal,
      });

      // Mark vehicle rented
      const [updated] = await tx.update(fleetVehiclesTable)
        .set({
          currentRenterUserId: userId,
          currentRenterName: renterName,
          rentalStartedAt: now,
          rentalEndsAt,
          rentalHours: hours,
          rentalPaidFiat: totalCost,
          updatedAt: new Date(),
        })
        .where(eq(fleetVehiclesTable.id, id))
        .returning();

      return {
        status: 200,
        body: {
          ok: true,
          rentalEndsAt,
          totalCost,
          speedBonus: SPEED_BONUS[vehicle.vehicleType] ?? 1.0,
          vehicle: updated,
        },
      };
    });

    res.status(result.status).json(result.body);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to rent" });
  }
});

// POST /fleet/:id/return — early return with pro-rated refund
router.post("/fleet/:id/return", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseInt(String(req.params.id || ""), 10);

    const result = await db.transaction(async (tx) => {
      const [vehicle] = await tx.select().from(fleetVehiclesTable)
        .where(eq(fleetVehiclesTable.id, id)).limit(1);
      if (!vehicle) return { status: 404, body: { error: "vehicle not found" } };
      if (vehicle.currentRenterUserId !== userId) {
        return { status: 403, body: { error: "you are not renting this vehicle" } };
      }

      const now = new Date();
      const startedAt = vehicle.rentalStartedAt ?? now;
      const endsAt = vehicle.rentalEndsAt ?? now;
      const totalPaid = vehicle.rentalPaidFiat ?? 0;
      const orgId = vehicle.orgId;

      // Calculate used time
      const totalMs = endsAt.getTime() - startedAt.getTime();
      const usedMs = Math.min(now.getTime() - startedAt.getTime(), totalMs);
      const usedFraction = totalMs > 0 ? Math.min(1, usedMs / totalMs) : 1;
      const earnedByOrg = Math.round(totalPaid * usedFraction);
      const refundToRenter = totalPaid - earnedByOrg;

      // Credit org
      if (earnedByOrg > 0) {
        await creditOrgAccount(orgId, "checking", earnedByOrg,
          `VEHICLE RENTAL EARNING: ${vehicle.name} — ${vehicle.currentRenterName ?? userId}`,
          "fleet_rental", userId);
      }

      // Refund renter (if any unused time)
      if (refundToRenter > 0) {
        const renterAcct = await getCheckingAccount(userId);
        if (renterAcct) {
          const newBal = renterAcct.balance + refundToRenter;
          await tx.update(bankAccountsTable)
            .set({ balance: newBal, updatedAt: new Date() })
            .where(eq(bankAccountsTable.id, renterAcct.id));
          await tx.insert(bankTransactionsTable).values({
            userId,
            accountId: renterAcct.id,
            kind: "vehicle_refund",
            description: `VEHICLE RENTAL REFUND: ${vehicle.name} early return — ƒ${refundToRenter}`,
            amount: refundToRenter,
            balanceAfter: newBal,
          });
        }
      }

      // Clear rental state
      const [updated] = await tx.update(fleetVehiclesTable)
        .set({
          currentRenterUserId: null,
          currentRenterName: null,
          rentalStartedAt: null,
          rentalEndsAt: null,
          rentalHours: null,
          rentalPaidFiat: null,
          updatedAt: new Date(),
        })
        .where(eq(fleetVehiclesTable.id, id))
        .returning();

      return {
        status: 200,
        body: { ok: true, earnedByOrg, refundToRenter, vehicle: updated },
      };
    });

    res.status(result.status).json(result.body);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to return vehicle" });
  }
});

/**
 * Expire overdue rentals — called by a periodic cron every 2 minutes.
 * Credits the full remaining amount to the org's checking account.
 */
export async function expireOverdueRentals(): Promise<void> {
  const now = new Date();
  const overdue = await db
    .select()
    .from(fleetVehiclesTable)
    .where(
      and(
        isNotNull(fleetVehiclesTable.currentRenterUserId),
        lte(fleetVehiclesTable.rentalEndsAt, now),
      ),
    );

  for (const v of overdue) {
    try {
      const earned = v.rentalPaidFiat ?? 0;
      if (earned > 0) {
        await creditOrgAccount(v.orgId, "checking", earned,
          `VEHICLE RENTAL EXPIRY: ${v.name} — ${v.currentRenterName ?? "?"}`,
          "fleet_rental_expiry", null);
      }
      await db.update(fleetVehiclesTable)
        .set({
          currentRenterUserId: null,
          currentRenterName: null,
          rentalStartedAt: null,
          rentalEndsAt: null,
          rentalHours: null,
          rentalPaidFiat: null,
          updatedAt: new Date(),
        })
        .where(eq(fleetVehiclesTable.id, v.id));
    } catch (e) {
      console.error(`[fleet] expire error for vehicle ${v.id}:`, e);
    }
  }
}

export default router;
