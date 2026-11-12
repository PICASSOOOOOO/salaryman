/**
 * Internal Services Board API
 *
 * Player-to-player and org-to-org gig economy. Categories: Repair, Transport,
 * Security, Legal, Design, Accounting, Construction, Cleaning, Delivery, Other.
 *
 * Escrow lifecycle:
 *   POST /services          → poster's bank checking debited by payFiat → escrowFiat stored
 *   POST /services/:id/claim  → claimer set, claimedAt stamped
 *   POST /services/:id/complete → escrow released to claimer's bank checking
 *   POST /services/:id/dispute → escrow returned to poster; if 24h+ since claim both can dispute
 *   POST /services/:id/cancel  → poster cancels, escrow returned
 *   POST /services/:id/rate    → 1-5 star rating after complete
 */
import { Router, type Request, type Response } from "express";
import { db, serviceListingsTable, serviceRatingsTable, bankAccountsTable, bankTransactionsTable, playerLedgerTable, cfSubmissionsTable, orgMembersTable, hasRoleAccess, type OrgRole } from "@workspace/db";
import { getShadowTowerServiceTenant } from "@workspace/api-zod/shadow-tower";
import { eq, and, desc, sql, or, isNull, lte, inArray } from "drizzle-orm";

const router = Router();

const SERVICE_CATEGORIES = new Set([
  "Repair", "Transport", "Security", "Legal", "Design",
  "Accounting", "Construction", "Cleaning", "Delivery", "Other",
]);

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

/** Get the player's bank checking balance and account id */
async function getCheckingAccount(userId: string) {
  const accounts = await db
    .select()
    .from(bankAccountsTable)
    .where(eq(bankAccountsTable.userId, userId));
  return accounts.find((a) => a.kind === "checking") ?? accounts[0] ?? null;
}

function requestedBusinessKey(req: Request): string | null {
  const value = req.query.tenant ?? req.query.businessKey;
  if (typeof value !== "string") return null;
  const key = value.trim();
  return key.length > 0 ? key : null;
}

function tenantResponse(businessKey: string | null) {
  if (!businessKey) return null;
  const tenant = getShadowTowerServiceTenant(businessKey);
  return tenant
    ? {
        businessKey: tenant.businessKey,
        name: tenant.business.name,
        service: tenant.service.label,
        description: tenant.service.description,
        floorNumber: tenant.floorNumber,
        unitNumber: tenant.unitNumber,
      }
    : null;
}

// GET /services — browse open gigs, filterable by category, city, and Tower tenant
router.get("/services", async (req: Request, res: Response) => {
  try {
    const { category, city, status } = req.query;
    const st = String(status || "open");
    const businessKey = requestedBusinessKey(req);
    const tenant = tenantResponse(businessKey);
    let rows = await db
      .select()
      .from(serviceListingsTable)
      .where(
        and(
          eq(serviceListingsTable.status, st),
          category ? eq(serviceListingsTable.category, String(category)) : undefined,
          city ? eq(serviceListingsTable.cityId, String(city)) : undefined,
          businessKey ? eq(serviceListingsTable.businessKey, businessKey) : undefined,
        ),
      )
      .orderBy(desc(serviceListingsTable.createdAt))
      .limit(100);

    // Attach aggregated ratings for each poster
    // Unknown or unavailable tenant keys intentionally resolve to an empty
    // board rather than falling back to shared listings or inventing content.
    res.json({ listings: tenant ? rows : businessKey ? [] : rows, tenant });
  } catch (e: any) {
    console.error("[services] GET error", e);
    res.status(500).json({ error: "Failed to load services" });
  }
});

// GET /services/by-org/:orgId — open/claimed listings posted by this org (manager-gated)
router.get("/services/by-org/:orgId", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const orgId = parseInt(String(req.params.orgId || ""), 10);
  if (!orgId || !isFinite(orgId)) { res.status(400).json({ error: "invalid orgId" }); return; }
  try {
    const [membership] = await db
      .select({ role: orgMembersTable.role })
      .from(orgMembersTable)
      .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
      .limit(1);
    if (!membership || !hasRoleAccess(membership.role as OrgRole, "manager")) {
      res.status(403).json({ error: "Org manager access required" }); return;
    }
    const rows = await db
      .select()
      .from(serviceListingsTable)
      .where(and(eq(serviceListingsTable.posterOrgId, orgId), inArray(serviceListingsTable.status, ["open", "claimed"])))
      .orderBy(desc(serviceListingsTable.createdAt))
      .limit(100);
    res.json({ listings: rows });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed" });
  }
});

// GET /services/mine — gigs posted by me OR claimed by me
router.get("/services/mine", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const businessKey = requestedBusinessKey(req);
    const tenant = tenantResponse(businessKey);
    const rows = await db
      .select()
      .from(serviceListingsTable)
      .where(
        and(
          or(
            eq(serviceListingsTable.posterUserId, userId),
            eq(serviceListingsTable.claimerUserId, userId),
          ),
          businessKey ? eq(serviceListingsTable.businessKey, businessKey) : undefined,
        ),
      )
      .orderBy(desc(serviceListingsTable.createdAt))
      .limit(200);
    res.json({ listings: tenant ? rows : businessKey ? [] : rows, tenant });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed" });
  }
});

// GET /services/ratings/:userId — aggregate rating for a user
router.get("/services/ratings/:userId", async (req: Request, res: Response) => {
  try {
    const rateeId = String(req.params.userId || "");
    const rows = await db
      .select({ stars: serviceRatingsTable.stars, note: serviceRatingsTable.note, createdAt: serviceRatingsTable.createdAt })
      .from(serviceRatingsTable)
      .where(eq(serviceRatingsTable.rateeUserId, rateeId))
      .orderBy(desc(serviceRatingsTable.createdAt))
      .limit(50);
    const avg = rows.length > 0
      ? rows.reduce((s, r) => s + r.stars, 0) / rows.length
      : null;
    res.json({ ratings: rows, avg, count: rows.length });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed" });
  }
});

// POST /services — create a listing; escrow debited from poster's bank checking
router.post("/services", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const {
      category, title, description, payFiat, payType, cityId, location, deadline, posterOrgId,
      businessKey: rawBusinessKey,
    } = req.body ?? {};
    const businessKey = typeof (rawBusinessKey ?? req.body?.tenant) === "string"
      ? String(rawBusinessKey ?? req.body.tenant).trim() || null
      : null;

    if (typeof title !== "string" || title.trim().length < 2) {
      res.status(400).json({ error: "title required (min 2 chars)" }); return;
    }
    if (!SERVICE_CATEGORIES.has(String(category))) {
      res.status(400).json({ error: "invalid category" }); return;
    }
    const tenant = businessKey ? getShadowTowerServiceTenant(businessKey) : null;
    if (businessKey && !tenant) {
      res.status(400).json({ error: "Tower tenant service is unavailable" }); return;
    }
    const pay = Math.max(0, Math.min(parseInt(String(payFiat || 0), 10) || 0, 500_000_000));
    if (pay <= 0) { res.status(400).json({ error: "payFiat required" }); return; }

    // Debit poster's checking for escrow
    const acct = await getCheckingAccount(userId);
    if (!acct) { res.status(404).json({ error: "No bank account found" }); return; }
    if (acct.balance < pay) {
      res.status(402).json({ error: "Insufficient funds for escrow", required: pay, balance: acct.balance });
      return;
    }

    const dlDate = deadline ? new Date(deadline) : null;
    const posterName = userName(req);

    // Verify org attribution: caller must be an active member of the org
    let verifiedOrgId: number | undefined;
    const parsedOrgId = posterOrgId ? parseInt(String(posterOrgId), 10) : null;
    if (parsedOrgId && isFinite(parsedOrgId)) {
      const [orgMembership] = await db
        .select({ role: orgMembersTable.role })
        .from(orgMembersTable)
        .where(and(eq(orgMembersTable.orgId, parsedOrgId), eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
        .limit(1);
      if (!orgMembership) {
        res.status(403).json({ error: "Not a member of the specified org" }); return;
      }
      verifiedOrgId = parsedOrgId;
    }

    const [created] = await db.transaction(async (tx) => {
      const newBal = acct.balance - pay;
      await tx.update(bankAccountsTable)
        .set({ balance: newBal, updatedAt: new Date() })
        .where(eq(bankAccountsTable.id, acct.id));
      await tx.insert(bankTransactionsTable).values({
        userId,
        accountId: acct.id,
        kind: "escrow_hold",
        description: `ESCROW HOLD: service gig — ${String(title).trim().slice(0, 80)}`,
        amount: -pay,
        balanceAfter: newBal,
      });
      return tx.insert(serviceListingsTable).values({
        posterUserId: userId,
        posterName,
        posterOrgId: verifiedOrgId,
        category: String(category),
        title: String(title).trim().slice(0, 120),
        description: String(description || "").slice(0, 4000),
        payFiat: pay,
        payType: payType === "hourly" ? "hourly" : "flat",
        cityId: String(cityId || "minx_prime").slice(0, 32),
        location: location === "remote" ? "remote" : "city",
        deadline: dlDate ?? undefined,
        businessKey: tenant?.businessKey,
        status: "open",
        escrowFiat: pay,
      }).returning();
    });

    res.status(201).json({ listing: created });
  } catch (e: any) {
    console.error("[services] POST error", e);
    res.status(500).json({ error: e?.message || "Failed to create listing" });
  }
});

// POST /services/:id/claim — claim a gig (cannot be the poster)
router.post("/services/:id/claim", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    const claimerName = userName(req);

    const result = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(serviceListingsTable)
        .where(eq(serviceListingsTable.id, id)).limit(1);
      if (!row) return { status: 404, body: { error: "listing not found" } };
      if (row.status !== "open") return { status: 409, body: { error: `listing is ${row.status}` } };
      if (row.posterUserId === userId) return { status: 400, body: { error: "cannot claim your own listing" } };

      const [updated] = await tx.update(serviceListingsTable)
        .set({ status: "claimed", claimerUserId: userId, claimerName, claimedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(serviceListingsTable.id, id), eq(serviceListingsTable.status, "open")))
        .returning();
      if (!updated) return { status: 409, body: { error: "race: listing already claimed" } };
      return { status: 200, body: { ok: true, listing: updated } };
    });

    res.status(result.status).json(result.body);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to claim" });
  }
});

// POST /services/:id/complete — poster marks work delivered; escrow → claimer
router.post("/services/:id/complete", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseInt(String(req.params.id || ""), 10);

    const result = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(serviceListingsTable)
        .where(eq(serviceListingsTable.id, id)).limit(1);
      if (!row) return { status: 404, body: { error: "listing not found" } };
      if (row.status !== "claimed") return { status: 409, body: { error: `listing is ${row.status}, not claimed` } };
      if (row.posterUserId !== userId) return { status: 403, body: { error: "only the poster can mark complete" } };
      if (!row.claimerUserId) return { status: 400, body: { error: "no claimer" } };

      // Check if claimer is an incarcerated debtor. If so, route escrow to
      // debt reduction instead of bank credit — their forced labor already
      // benefited the poster; the poster's payFiat now works off the sentence.
      const [claimerLedger] = await tx
        .select()
        .from(playerLedgerTable)
        .where(eq(playerLedgerTable.userId, row.claimerUserId))
        .for("update")
        .limit(1);

      const isIncarneratedDebtor =
        !!claimerLedger &&
        claimerLedger.debt > 0 &&
        !!claimerLedger.jailUntil &&
        new Date(claimerLedger.jailUntil).getTime() > Date.now();

      if (isIncarneratedDebtor) {
        // Route escrow → debt reduction. The claimer gets no bank credit; the
        // escrow amount is applied directly against their outstanding debt.
        const payoff = Math.min(row.escrowFiat, claimerLedger!.debt);
        const newDebt = claimerLedger!.debt - payoff;
        await tx.update(playerLedgerTable).set({
          debt: newDebt,
          jailMinutesServed: claimerLedger!.jailMinutesServed + 1,
          lastCfWorkAt: new Date(),
          jailUntil: newDebt === 0 ? null : claimerLedger!.jailUntil,
        }).where(eq(playerLedgerTable.userId, row.claimerUserId));
        // CF audit row so the submission pipeline has the record.
        await tx.insert(cfSubmissionsTable).values({
          userId: row.claimerUserId,
          kind: "service_listing",
          body: `Service gig #${id}: ${row.title.slice(0, 80)}`,
          payload: {
            listingId: id,
            posterUserId: row.posterUserId,
            posterOrgId: row.posterOrgId ?? null,
            posterOrgName: row.posterOrgName ?? null,
            payFiat: row.escrowFiat,
          },
          payoff,
          benefitingOrgId: row.posterOrgId ? String(row.posterOrgId) : null,
          benefitingOrgName: row.posterOrgName ?? null,
        });
      } else {
        // Normal path: release escrow to claimer's bank checking account.
        const claimerAcct = await getCheckingAccount(row.claimerUserId);
        if (claimerAcct) {
          const newBal = claimerAcct.balance + row.escrowFiat;
          await tx.update(bankAccountsTable)
            .set({ balance: newBal, updatedAt: new Date() })
            .where(eq(bankAccountsTable.id, claimerAcct.id));
          await tx.insert(bankTransactionsTable).values({
            userId: row.claimerUserId,
            accountId: claimerAcct.id,
            kind: "escrow_release",
            description: `ESCROW RELEASE: service gig #${id} — ${row.title.slice(0, 60)}`,
            amount: row.escrowFiat,
            balanceAfter: newBal,
          });
        }
      }

      const [updated] = await tx.update(serviceListingsTable)
        .set({ status: "complete", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(serviceListingsTable.id, id))
        .returning();
      return {
        status: 200,
        body: {
          ok: true,
          listing: updated,
          debtReduction: isIncarneratedDebtor ? Math.min(row.escrowFiat, claimerLedger!.debt) : 0,
          routedToDebt: isIncarneratedDebtor,
        },
      };
    });

    res.status(result.status).json(result.body);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to complete" });
  }
});

// POST /services/:id/dispute — available to either party after 24h from claim
router.post("/services/:id/dispute", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseInt(String(req.params.id || ""), 10);

    const result = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(serviceListingsTable)
        .where(eq(serviceListingsTable.id, id)).limit(1);
      if (!row) return { status: 404, body: { error: "listing not found" } };
      if (row.status !== "claimed") return { status: 409, body: { error: `listing is ${row.status}` } };
      const isPoster = row.posterUserId === userId;
      const isClaimer = row.claimerUserId === userId;
      if (!isPoster && !isClaimer) return { status: 403, body: { error: "not a party to this gig" } };

      // After 24h from claim either side can dispute; poster can always dispute
      const now = Date.now();
      const claimedMs = row.claimedAt ? new Date(row.claimedAt).getTime() : now;
      const hoursElapsed = (now - claimedMs) / 3_600_000;
      if (!isPoster && hoursElapsed < 24) {
        return { status: 400, body: { error: "Claimer can dispute after 24h since claim" } };
      }

      // Return escrow to poster
      const posterAcct = await getCheckingAccount(row.posterUserId);
      if (posterAcct && row.escrowFiat > 0) {
        const newBal = posterAcct.balance + row.escrowFiat;
        await tx.update(bankAccountsTable)
          .set({ balance: newBal, updatedAt: new Date() })
          .where(eq(bankAccountsTable.id, posterAcct.id));
        await tx.insert(bankTransactionsTable).values({
          userId: row.posterUserId,
          accountId: posterAcct.id,
          kind: "escrow_return",
          description: `ESCROW RETURN (dispute): service gig #${id} — ${row.title.slice(0, 60)}`,
          amount: row.escrowFiat,
          balanceAfter: newBal,
        });
      }

      const [updated] = await tx.update(serviceListingsTable)
        .set({ status: "disputed", disputedAt: new Date(), escrowFiat: 0, updatedAt: new Date() })
        .where(eq(serviceListingsTable.id, id))
        .returning();
      return { status: 200, body: { ok: true, listing: updated } };
    });

    res.status(result.status).json(result.body);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to dispute" });
  }
});

// POST /services/:id/cancel — poster cancels open (or claimed) listing; escrow returned
router.post("/services/:id/cancel", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseInt(String(req.params.id || ""), 10);

    const result = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(serviceListingsTable)
        .where(eq(serviceListingsTable.id, id)).limit(1);
      if (!row) return { status: 404, body: { error: "listing not found" } };

      // Allow: poster themselves, OR an org manager if this listing was posted under an org
      if (row.posterUserId !== userId) {
        if (!row.posterOrgId) return { status: 403, body: { error: "only poster can cancel" } };
        const [membership] = await tx
          .select({ role: orgMembersTable.role })
          .from(orgMembersTable)
          .where(and(eq(orgMembersTable.orgId, row.posterOrgId), eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
          .limit(1);
        if (!membership || !hasRoleAccess(membership.role as OrgRole, "manager")) {
          return { status: 403, body: { error: "only the poster or an org manager can cancel" } };
        }
      }

      if (!["open", "claimed"].includes(row.status)) {
        return { status: 409, body: { error: `cannot cancel a ${row.status} listing` } };
      }

      // Return escrow — always to the original POSTER, not the canceller
      const acct = await getCheckingAccount(row.posterUserId);
      if (acct && row.escrowFiat > 0) {
        const newBal = acct.balance + row.escrowFiat;
        await tx.update(bankAccountsTable)
          .set({ balance: newBal, updatedAt: new Date() })
          .where(eq(bankAccountsTable.id, acct.id));
        await tx.insert(bankTransactionsTable).values({
          userId: row.posterUserId,
          accountId: acct.id,
          kind: "escrow_return",
          description: `ESCROW RETURN (cancel): service gig #${id} — ${row.title.slice(0, 60)}`,
          amount: row.escrowFiat,
          balanceAfter: newBal,
        });
      }

      const [updated] = await tx.update(serviceListingsTable)
        .set({ status: "cancelled", escrowFiat: 0, updatedAt: new Date() })
        .where(eq(serviceListingsTable.id, id))
        .returning();
      return { status: 200, body: { ok: true, listing: updated } };
    });

    res.status(result.status).json(result.body);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to cancel" });
  }
});

// POST /services/:id/rate — 1-5 stars after completion
router.post("/services/:id/rate", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    const stars = Math.min(5, Math.max(1, parseInt(String(req.body?.stars || "3"), 10) || 3));
    const note = String(req.body?.note || "").slice(0, 500);

    const [row] = await db.select().from(serviceListingsTable)
      .where(eq(serviceListingsTable.id, id)).limit(1);
    if (!row) { res.status(404).json({ error: "not found" }); return; }
    if (row.status !== "complete") { res.status(400).json({ error: "can only rate completed gigs" }); return; }

    const isPoster = row.posterUserId === userId;
    const isClaimer = row.claimerUserId === userId;
    if (!isPoster && !isClaimer) { res.status(403).json({ error: "not a party to this gig" }); return; }

    // Determine ratee
    const rateeUserId = isPoster ? row.claimerUserId! : row.posterUserId;

    // Check already rated
    const existing = await db.select().from(serviceRatingsTable)
      .where(and(eq(serviceRatingsTable.listingId, id), eq(serviceRatingsTable.raterUserId, userId)))
      .limit(1);
    if (existing.length > 0) { res.status(409).json({ error: "already rated" }); return; }

    await db.transaction(async (tx) => {
      await tx.insert(serviceRatingsTable).values({
        listingId: id, raterUserId: userId, rateeUserId, stars, note,
      });
      if (isPoster) {
        await tx.update(serviceListingsTable)
          .set({ posterRated: 1, updatedAt: new Date() })
          .where(eq(serviceListingsTable.id, id));
      } else {
        await tx.update(serviceListingsTable)
          .set({ claimerRated: 1, updatedAt: new Date() })
          .where(eq(serviceListingsTable.id, id));
      }
    });

    res.json({ ok: true, stars });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to rate" });
  }
});

export default router;
