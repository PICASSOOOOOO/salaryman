import { Router } from "express";
import { eq, sql, desc, and, or, inArray, isNotNull } from "drizzle-orm";
import { db, worldBusinessesTable, businessTransactionsTable, businessSnapshotsTable, organizationsTable, orgMembersTable, cityBuildingsTable, botSubscriptionsTable, botMarketplaceTable, playerProfilesTable, usersTable, alphaApplicationsTable, normalizeOrgName } from "@workspace/db";
import { getServerStatus, getLiberationProgress, recordHeartbeat, getOnlinePlayers, SERVER_CITY_ID, SERVER_REGION, MAX_PLAYERS, getWorldPlayerCount } from "../worldServer";
import * as geoip from "geoip-lite";
import { OUTSIDE_WORLD_DISABLED_BODY, OUTSIDE_WORLD_ENABLED } from "../lib/outside-world";
import { isOwnerEmail } from "../lib/plan";
import { deriveConditionProfile, repairConditionScore } from "../lib/world-condition";

const router = Router();
const LIVE_CITY_IDS = new Set(["minx_city", "huda_city"]);

const OUTSIDE_WORLD_PATHS = [
  "/world/locate",
  "/world/population",
  "/world/online",
  "/world/heartbeat",
  "/world/liberation",
  "/world/buildings",
  "/world/building-types",
] as const;

router.use((req, res, next) => {
  if (OUTSIDE_WORLD_ENABLED) return next();
  const isExterior = OUTSIDE_WORLD_PATHS.some(
    (prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`),
  );
  if (isExterior) return res.status(410).json(OUTSIDE_WORLD_DISABLED_BODY);
  return next();
});

/**
 * Derive the active in-game character's player name for the current request.
 *
 * Resolution order:
 *  1. If the user has selected an active profile (users.active_profile_id),
 *     return that profile's playerName. This is the multi-character path.
 *  2. Otherwise, fall back to the legacy first+last / email-local-part
 *     derivation so accounts that never opened the profile picker still
 *     map onto their existing world data.
 *
 * Async (was sync). All callers are inside async route handlers; the
 * one previously-sync handler (POST /world/heartbeat) was promoted.
 */
async function derivePlayerName(req: Express.Request): Promise<string> {
  const u = req.user!;
  // FAIL-CLOSED: if the user has an activeProfileId, that profile *must*
  // resolve. Silently falling back to legacy derivation here would let DB
  // hiccups misroute reads/writes onto a different character with no signal.
  // Only fall back to legacy derivation when no active profile is set yet
  // (truly first-time user before they've ever opened the picker).
  const [me] = await db
    .select({ activeProfileId: usersTable.activeProfileId })
    .from(usersTable)
    .where(eq(usersTable.id, String(u.id)))
    .limit(1);
  if (me?.activeProfileId) {
    const [profile] = await db
      .select({ playerName: playerProfilesTable.playerName })
      .from(playerProfilesTable)
      .where(and(
        eq(playerProfilesTable.id, me.activeProfileId),
        eq(playerProfilesTable.userId, String(u.id)),
      ))
      .limit(1);
    if (!profile?.playerName) {
      throw new Error("Active profile is missing — open the profile picker to pick another character.");
    }
    return profile.playerName.slice(0, 32).toUpperCase();
  }
  // Legacy fallback: only reached when no active profile is set at all.
  const first = u.firstName ?? "";
  const last = u.lastName ?? "";
  const parts = [first, last].filter(s => s.length > 0);
  const name = parts.length > 0 ? parts.join(" ") : (u.email?.split("@")[0] ?? String(u.id));
  return name.slice(0, 32).toUpperCase();
}

router.get("/world/check-company", async (req, res) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "Login required" });
      return;
    }
    const rawName = req.query.name;
    if (!rawName || typeof rawName !== "string" || !rawName.trim()) {
      res.status(400).json({ error: "name query param required" });
      return;
    }
    const normalized = rawName.trim().toUpperCase();
    const existing = await db
      .select({ id: worldBusinessesTable.id })
      .from(worldBusinessesTable)
      .where(sql`UPPER(${worldBusinessesTable.companyName}) = ${normalized}`)
      .limit(1);
    res.json({ taken: existing.length > 0 });
  } catch (err: any) {
    console.error("[World] check-company error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/world/me/name — update the authenticated user's display name on
// their world business registry row. We mirror the same normalisation as
// /world/register (uppercase, 32-char cap) so downstream lookups by player_name
// stay consistent. Requires login; updates ALL of the caller's businesses
// (a user only ever has one player identity in this game).
router.patch("/world/me/name", async (req, res) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "Login required" });
      return;
    }
    const raw = typeof req.body?.playerName === "string" ? req.body.playerName : "";
    const cleaned = raw.trim();
    if (!cleaned) {
      res.status(400).json({ error: "playerName required" });
      return;
    }
    if (cleaned.length > 64) {
      res.status(400).json({ error: "playerName too long (max 64)" });
      return;
    }
    const normalized = cleaned.slice(0, 32).toUpperCase();
    const userId = String(req.user.id);
    const updated = await db
      .update(worldBusinessesTable)
      .set({ playerName: normalized })
      .where(eq(worldBusinessesTable.userId, userId))
      .returning({ id: worldBusinessesTable.id, playerName: worldBusinessesTable.playerName });
    if (updated.length === 0) {
      res.status(404).json({ error: "No world registry entry — finish onboarding first." });
      return;
    }
    res.json({ ok: true, playerName: normalized, updated: updated.length });
  } catch (err: any) {
    console.error("[World] update player-name error:", err?.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Realm capacity + onboarding location ─────────────────────────────────────
// Coarse, no-popup location estimate from the caller's IP. Used ONLY to suggest
// the nearest live city during onboarding — nothing is stored here. Local/dev
// IPs don't resolve; the client then falls back to the browser timezone.
router.get("/world/locate", (req, res) => {
  try {
    const fwd = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
    const ip = (fwd || req.socket.remoteAddress || "").replace(/^::ffff:/, "");
    const geo = ip ? geoip.lookup(ip) : null;
    res.json({ country: geo?.country ?? null, timezone: geo?.timezone ?? null, region: geo?.region ?? null });
  } catch {
    res.json({ country: null, timezone: null, region: null });
  }
});

// This realm's live population vs cap, for the onboarding capacity display.
router.get("/world/population", (_req, res) => {
  res.json({ cityId: SERVER_CITY_ID, region: SERVER_REGION, online: getWorldPlayerCount(), max: MAX_PLAYERS });
});

// Record the player's chosen home city + (optional, consented) coarse location.
// Stored on the registry row's `meta` bag so we don't churn the schema. Consent
// is explicit: when the player declines we keep NO location string.
// This deliberately returns only the city assignment. Location consent and the
// server-derived country remain write-only metadata and are never sent back to
// a browser merely to hydrate its active world.
router.get("/world/home-city", async (req, res) => {
  try {
    const userId = req.user?.id ? String(req.user.id) : null;
    if (!userId) { res.status(401).json({ error: "Not signed in" }); return; }
    const [row] = await db
      .select({ meta: worldBusinessesTable.meta })
      .from(worldBusinessesTable)
      .where(eq(worldBusinessesTable.userId, userId))
      .orderBy(sql`${worldBusinessesTable.createdAt} DESC`)
      .limit(1);
    const meta = row?.meta && typeof row.meta === "object" ? row.meta as Record<string, unknown> : null;
    const homeCityId = typeof meta?.homeCityId === "string" ? meta.homeCityId : null;
    res.json({ homeCityId });
  } catch (err: any) {
    console.error("[World] get home-city error:", err?.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/world/home-city", async (req, res) => {
  try {
    const userId = req.user?.id ? String(req.user.id) : null;
    if (!userId) { res.status(401).json({ error: "Not signed in" }); return; }
    const { homeCityId, locationConsent } = req.body ?? {};
    const cityId = typeof homeCityId === "string" ? homeCityId.trim().toLowerCase() : "";
    if (!/^[a-z_]{2,40}$/.test(cityId)) { res.status(400).json({ error: "valid homeCityId required" }); return; }
    if (!LIVE_CITY_IDS.has(cityId)) { res.status(400).json({ error: "home city is not operational" }); return; }
    const consent = Boolean(locationConsent);
    // Country-ONLY, and SERVER-derived from the caller's IP — never trust a
    // client-supplied location string, and never store anything finer than the
    // 2-letter country code. Declined consent stores nothing at all.
    let coarse: string | null = null;
    if (consent) {
      const fwd = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
      const ip = (fwd || req.socket.remoteAddress || "").replace(/^::ffff:/, "");
      const geo = ip ? geoip.lookup(ip) : null;
      coarse = geo?.country ?? null;
    }

    const [row] = await db
      .select({ id: worldBusinessesTable.id, meta: worldBusinessesTable.meta })
      .from(worldBusinessesTable)
      .where(eq(worldBusinessesTable.userId, userId))
      .orderBy(sql`${worldBusinessesTable.createdAt} DESC`)
      .limit(1);
    if (!row) { res.status(404).json({ error: "No registry entry — finish onboarding first." }); return; }

    const prevMeta = (row.meta && typeof row.meta === "object") ? row.meta as Record<string, unknown> : {};
    const nextMeta = { ...prevMeta, homeCityId: cityId, locationConsent: consent, coarseLocation: coarse };
    await db.update(worldBusinessesTable).set({ meta: nextMeta }).where(eq(worldBusinessesTable.id, row.id));
    res.json({ ok: true, homeCityId: cityId, locationConsent: consent });
  } catch (err: any) {
    console.error("[World] home-city error:", err?.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Reception-owned employment filing. Organization membership remains the
// authoritative "employed" signal; this filing records that a player without
// an active organization has formally reported unemployment to Shadow Tower.
router.post("/world/employment/unemployment", async (req, res) => {
  try {
    const userId = req.user?.id ? String(req.user.id) : null;
    if (!userId) { res.status(401).json({ error: "Not signed in" }); return; }

    const [activeMembership] = await db
      .select({ orgId: orgMembersTable.orgId })
      .from(orgMembersTable)
      .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
      .limit(1);
    if (activeMembership) {
      res.status(409).json({ error: "Active organization membership already establishes employment" });
      return;
    }

    const [row] = await db
      .select({ id: worldBusinessesTable.id, meta: worldBusinessesTable.meta })
      .from(worldBusinessesTable)
      .where(eq(worldBusinessesTable.userId, userId))
      .orderBy(sql`${worldBusinessesTable.createdAt} DESC`)
      .limit(1);
    if (!row) { res.status(404).json({ error: "Complete registration before filing" }); return; }

    const previous = row.meta && typeof row.meta === "object" ? row.meta as Record<string, unknown> : {};
    const filedAt = new Date().toISOString();
    await db
      .update(worldBusinessesTable)
      .set({ meta: { ...previous, employmentStatus: "unemployed", unemploymentFiledAt: filedAt } })
      .where(eq(worldBusinessesTable.id, row.id));
    res.json({ status: "unemployed", filedAt });
  } catch (err: any) {
    console.error("[World] unemployment filing error:", err?.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/world/register", async (req, res) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "Login required" });
      return;
    }
    const { playerName, businessType, companyName, industry, companySize, contactEmail, isPaid, payrollProvider, declaredMonthlyIncome, incomeVerified, faction, jobClass, pace, isEducation, homeCityId, locationConsent } = req.body;
    if (!playerName || !businessType) {
      res.status(400).json({ error: "playerName and businessType required" });
      return;
    }
    const validTypes = ["minx", "real", "unemployed"];
    const incomingType = businessType === "fictitious" ? "minx" : businessType;
    const finalBizType = validTypes.includes(incomingType) ? incomingType : "minx";

    if (finalBizType !== "unemployed" && (!companyName || !String(companyName).trim())) {
      res.status(400).json({ error: "companyName required for business registration" });
      return;
    }

    if (finalBizType === "minx" && companyName) {
      const normalized = String(companyName).trim().toUpperCase();
      if (normalized) {
        const existing = await db
          .select({ id: worldBusinessesTable.id })
          .from(worldBusinessesTable)
          .where(sql`UPPER(${worldBusinessesTable.companyName}) = ${normalized}`)
          .limit(1);
        if (existing.length > 0) {
          res.status(409).json({ error: "Company name already taken" });
          return;
        }
      }
    }

    const sessionId = req.cookies?.session_id ?? null;
    const userId = req.user?.id ? String(req.user.id) : null;
    // Real-business salary trust model: if the user wired a payroll provider
    // (Gusto/ADP/etc.), we trust the figure (`incomeVerified`). Otherwise
    // the figure stays UNVERIFIED on the registry AND we flip
    // `pendingOwnerVerification` so an org owner can later attest it via
    // /world/verify-business-salary. Until then, /world/declare-salary
    // continues to 403.
    const hasAutomatedPayroll = finalBizType === "real" && payrollProvider && payrollProvider !== "NONE";
    const safeDeclared = finalBizType === "real" && typeof declaredMonthlyIncome === "number"
      ? Math.max(0, Math.min(declaredMonthlyIncome, 10_000_000))
      : 0;
    const willBeVerified = Boolean(incomeVerified) && hasAutomatedPayroll;
    const needsOwnerAttestation = finalBizType === "real" && safeDeclared > 0 && !willBeVerified;
    // Loose-typed onboarding extras (faction, jobClass, pace) live in `meta`
    // so we don't churn the schema for cosmetic intake fields.
    const ALLOWED_FACTIONS = new Set(["suit", "nomad", "replicant"]);
    const ALLOWED_PACES = new Set(["full", "quick"]);
    const selectedCityId = typeof homeCityId === "string" ? homeCityId.trim().toLowerCase() : "minx_city";
    if (!LIVE_CITY_IDS.has(selectedCityId)) {
      res.status(400).json({ error: "home city is not operational" });
      return;
    }
    let coarseLocation: string | null = null;
    if (locationConsent) {
      const fwd = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
      const ip = (fwd || req.socket.remoteAddress || "").replace(/^::ffff:/, "");
      coarseLocation = ip ? geoip.lookup(ip)?.country ?? null : null;
    }
    const meta = {
      faction: typeof faction === "string" && ALLOWED_FACTIONS.has(faction) ? faction : null,
      jobClass: typeof jobClass === "string" ? jobClass.slice(0, 32) : null,
      pace: typeof pace === "string" && ALLOWED_PACES.has(pace) ? pace : null,
      homeCityId: selectedCityId,
      locationConsent: Boolean(locationConsent),
      coarseLocation,
    };
    // Unemployed arrivals still need a registry row: it is the server's
    // onboarding-complete signal and carries the selected home city. Employment
    // can be filed later from reception without pretending a company exists.
    const [row] = await db
      .insert(worldBusinessesTable)
      .values({
        playerName: String(playerName).slice(0, 32).toUpperCase(),
        userId,
        businessType: finalBizType,
        companyName: finalBizType === "unemployed" ? null : (companyName ? String(companyName).trim().toUpperCase().slice(0, 80) : null),
        industry: finalBizType === "unemployed" ? null : (industry ? String(industry).slice(0, 60) : null),
        companySize: finalBizType === "unemployed" ? null : (companySize ? String(companySize).slice(0, 30) : null),
        contactEmail: finalBizType === "unemployed" ? null : (contactEmail ? String(contactEmail).slice(0, 120) : null),
        payrollProvider: hasAutomatedPayroll ? String(payrollProvider).slice(0, 40) : null,
        declaredMonthlyIncome: safeDeclared,
        incomeVerified: willBeVerified,
        pendingOwnerVerification: needsOwnerAttestation,
        meta,
        isPaid: Boolean(isPaid),
        sessionId,
      })
      .returning();

    // Education orgs drive the dynamic "Classroom" vs "Conference" feature
    // label. Trust the explicit onboarding flag, falling back to an industry
    // sniff so the signal survives even if the client omits it.
    const wantsEducation =
      Boolean(isEducation) ||
      (typeof industry === "string" && /education|school/i.test(industry));

    let formalOrgId: number | null = null;
    if (finalBizType === "real" && userId && companyName) {
      const orgName = normalizeOrgName(String(companyName)).toUpperCase().slice(0, 80);
      try {
        const [existingOrg] = await db
          .select()
          .from(organizationsTable)
          .where(sql`lower(regexp_replace(btrim(${organizationsTable.name}), '\s+', ' ', 'g')) = lower(${orgName})`);

        if (!existingOrg) {
          const [newOrg] = await db
            .insert(organizationsTable)
            .values({
              name: orgName,
              industry: industry ? String(industry).trim().slice(0, 60) : null,
              size: companySize ? String(companySize).trim().slice(0, 30) : null,
              ownerUserId: userId,
              isEducation: wantsEducation,
            })
            .returning();

          await db.insert(orgMembersTable).values({
            orgId: newOrg.id,
            userId,
            role: "owner",
            featureBilling: "individual",
            status: "active",
            joinedAt: new Date(),
          });
          formalOrgId = newOrg.id;
        } else {
          formalOrgId = existingOrg.id;
          const [existingMembership] = await db
            .select()
            .from(orgMembersTable)
            .where(and(eq(orgMembersTable.orgId, existingOrg.id), eq(orgMembersTable.userId, userId)));
          if (!existingMembership) {
            await db.insert(orgMembersTable).values({
              orgId: existingOrg.id,
              userId,
              role: "specialist",
              featureBilling: "individual",
              status: "active",
              joinedAt: new Date(),
            });
          } else if (existingMembership.status === "removed") {
            await db
              .update(orgMembersTable)
              .set({ status: "active", joinedAt: new Date() })
              .where(and(eq(orgMembersTable.orgId, existingOrg.id), eq(orgMembersTable.userId, userId)));
          }
        }
      } catch (orgErr: unknown) {
        console.error("[World] formal org creation skipped:", (orgErr as Error).message);
      }
    }

    res.json({ ok: true, id: row.id, formalOrgId });
  } catch (err: any) {
    console.error("[World] register error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

const VALID_CATEGORIES = new Set(["gov_salary", "business_profit", "real_salary", "expense", "income", "general"]);

router.post("/world/transactions", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const { companyName, category, description, amount, balanceAfter } = req.body;
    if (!description || typeof amount !== "number") {
      res.status(400).json({ error: "description and amount required" });
      return;
    }
    if (Math.abs(amount) > 1_000_000) {
      res.status(400).json({ error: "Amount out of range" });
      return;
    }
    const safeCategory = VALID_CATEGORIES.has(String(category)) ? String(category) : "general";
    const playerName = await derivePlayerName(req);
    const [row] = await db
      .insert(businessTransactionsTable)
      .values({
        playerName: String(playerName).slice(0, 32).toUpperCase(),
        companyName: companyName ? String(companyName).slice(0, 80) : null,
        category: safeCategory.slice(0, 32),
        description: String(description).slice(0, 200),
        amount: Math.round(amount),
        balanceAfter: Math.round(balanceAfter ?? 0),
      })
      .returning({ id: businessTransactionsTable.id });
    res.json({ ok: true, id: row.id });
  } catch (err: any) {
    console.error("[World] transactions error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/world/declare-salary", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const { slotIndex, realSalaryAmount, proofObjectPath, charClass, companyName } = req.body;
    if (typeof realSalaryAmount !== "number" || realSalaryAmount <= 0 || realSalaryAmount > 1_000_000) {
      res.status(400).json({ error: "realSalaryAmount must be a positive number up to 1,000,000" });
      return;
    }
    const playerName = await derivePlayerName(req);
    const userId = String(req.user.id);
    const verified = await db
      .select({
        incomeVerified: worldBusinessesTable.incomeVerified,
        payrollProvider: worldBusinessesTable.payrollProvider,
        pendingOwnerVerification: worldBusinessesTable.pendingOwnerVerification,
        ownerVerifiedAt: worldBusinessesTable.ownerVerifiedAt,
      })
      .from(worldBusinessesTable)
      .where(eq(worldBusinessesTable.userId, userId))
      .orderBy(desc(worldBusinessesTable.createdAt))
      .limit(1);
    // Two ways to clear the salary gate:
    //   1. Automated payroll provider (Gusto/ADP) flipped incomeVerified=true.
    //   2. An org owner manually attested it via /world/verify-business-salary,
    //      which clears pendingOwnerVerification and stamps ownerVerifiedAt.
    const row = verified[0];
    const payrollOk = row?.incomeVerified === true && row?.payrollProvider && row.payrollProvider !== "NONE";
    const ownerAttested = row?.incomeVerified === true && row?.ownerVerifiedAt != null;
    if (!row || (!payrollOk && !ownerAttested)) {
      const reason = row?.pendingOwnerVerification
        ? "Salary pending org-owner attestation. Ask your org owner to verify it on the registry."
        : "Income verification required. Connect a payroll provider (Gusto, ADP) or have an org owner attest your salary.";
      res.status(403).json({ error: reason });
      return;
    }
    await db.insert(businessSnapshotsTable).values({
      playerName: String(playerName).slice(0, 32).toUpperCase(),
      userId,
      slotIndex: Number(slotIndex ?? 0),
      balance: 0,
      salary: 0,
      businessProfit: 0,
      governmentBaseSalary: 0,
      realSalaryAmount: Math.round(realSalaryAmount),
      incomeType: "real",
      data: { proofObjectPath: proofObjectPath ?? null, companyName: companyName ?? null, declaredAt: new Date().toISOString(), verificationStatus: "pending" },
      snapshotReason: "real_salary_declaration",
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[World] declare-salary error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /world/verify-business-salary
 * Org-owner attestation for a member's declared real-business salary. Caller
 * must be an `owner` of the same organization (matched by company name) as
 * the target user's business. On success, flips incomeVerified=true and
 * clears pendingOwnerVerification, stamping ownerVerifiedAt/By for audit.
 *
 * Body: { businessId: number, approve: boolean }
 *   - businessId pins the exact row being attested so a newer registration
 *     by the target can't get auto-approved by an attestation queued
 *     against an older row.
 *   - approve=false will leave income unverified but clear the pending flag
 *     (rejection — owner has reviewed and declined).
 */
router.post("/world/verify-business-salary", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const { businessId, approve } = req.body ?? {};
    if (typeof businessId !== "number" || !Number.isFinite(businessId) || businessId <= 0) {
      res.status(400).json({ error: "businessId (number) required" });
      return;
    }
    const callerId = String(req.user.id);
    // Pull the exact business row the owner is attesting against. Refuses
    // any row that's not still pending so re-runs after approve/reject are
    // explicit no-ops (no silent re-approvals of stale queue items).
    const [target] = await db
      .select()
      .from(worldBusinessesTable)
      .where(and(
        eq(worldBusinessesTable.id, businessId),
        eq(worldBusinessesTable.businessType, "real"),
        eq(worldBusinessesTable.pendingOwnerVerification, true),
      ))
      .limit(1);
    if (!target || !target.companyName) {
      res.status(404).json({ error: "No pending real-business registration found for that businessId." });
      return;
    }
    if (callerId === target.userId) {
      res.status(403).json({ error: "Self-attestation not allowed. Another org owner must verify your salary." });
      return;
    }
    // Caller must be an `owner` of the org matching the target's company name.
    const [org] = await db
      .select()
      .from(organizationsTable)
      .where(sql`lower(${organizationsTable.name}) = lower(${target.companyName})`)
      .limit(1);
    if (!org) {
      res.status(404).json({ error: "Organization not found for that business." });
      return;
    }
    const [membership] = await db
      .select()
      .from(orgMembersTable)
      .where(and(
        eq(orgMembersTable.orgId, org.id),
        eq(orgMembersTable.userId, callerId),
        eq(orgMembersTable.status, "active"),
      ))
      .limit(1);
    if (!membership || membership.role !== "owner") {
      res.status(403).json({ error: "Only an owner of this organization can verify salaries." });
      return;
    }
    const approved = Boolean(approve);
    // Re-check `pendingOwnerVerification = true` in the WHERE clause so two
    // owners racing on the same row can't both succeed — only the first
    // UPDATE flips the flag; the second matches zero rows.
    const updated = await db
      .update(worldBusinessesTable)
      .set({
        incomeVerified: approved,
        pendingOwnerVerification: false,
        ownerVerifiedAt: new Date(),
        ownerVerifiedBy: callerId,
      })
      .where(and(
        eq(worldBusinessesTable.id, target.id),
        eq(worldBusinessesTable.pendingOwnerVerification, true),
      ))
      .returning({ id: worldBusinessesTable.id });
    if (updated.length === 0) {
      res.status(409).json({ error: "Already attested by another owner." });
      return;
    }
    res.json({ ok: true, approved, businessId: target.id });
  } catch (err: any) {
    console.error("[World] verify-business-salary error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /world/pending-salary-verifications
 * Lists business salary declarations awaiting attestation that the calling
 * user, as an `owner` of one or more orgs, is responsible for. Used by the
 * Business hub UI so owners see a "needs your sign-off" queue.
 */
router.get("/world/pending-salary-verifications", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const callerId = String(req.user.id);
    const ownerships = await db
      .select({ orgId: orgMembersTable.orgId, orgName: organizationsTable.name })
      .from(orgMembersTable)
      .innerJoin(organizationsTable, eq(orgMembersTable.orgId, organizationsTable.id))
      .where(and(
        eq(orgMembersTable.userId, callerId),
        eq(orgMembersTable.role, "owner"),
        eq(orgMembersTable.status, "active"),
      ));
    if (ownerships.length === 0) {
      res.json({ pending: [] });
      return;
    }
    const ownedNames = ownerships.map(o => o.orgName.toLowerCase());
    const candidates = await db
      .select({
        id: worldBusinessesTable.id,
        userId: worldBusinessesTable.userId,
        playerName: worldBusinessesTable.playerName,
        companyName: worldBusinessesTable.companyName,
        declaredMonthlyIncome: worldBusinessesTable.declaredMonthlyIncome,
        contactEmail: worldBusinessesTable.contactEmail,
        createdAt: worldBusinessesTable.createdAt,
      })
      .from(worldBusinessesTable)
      .where(and(
        eq(worldBusinessesTable.pendingOwnerVerification, true),
        eq(worldBusinessesTable.businessType, "real"),
      ));
    const pending = candidates.filter(c =>
      c.companyName && ownedNames.includes(c.companyName.toLowerCase()) && c.userId !== callerId
    );
    res.json({ pending });
  } catch (err: any) {
    console.error("[World] pending-salary-verifications error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/world/snapshots", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const { slotIndex, balance, salary, businessProfit, governmentBaseSalary, realSalaryAmount, incomeType, snapshotReason } = req.body;
    if (typeof balance !== "number" || balance < 0) {
      res.status(400).json({ error: "balance required and must be non-negative" });
      return;
    }
    // Server-side plausibility caps — prevents forged balance inflation
    const MAX_BALANCE = 100_000_000; // 100M ƒ absolute ceiling
    const MAX_RATE = 1_000_000;      // 1M ƒ/min rate ceiling
    if (balance > MAX_BALANCE) {
      res.status(400).json({ error: "balance exceeds server ceiling" });
      return;
    }
    const safeIncomeType = ["unemployed","minx","real"].includes(String(incomeType)) ? String(incomeType) : "unemployed";
    const govBase = 0;
    const safeBizProfit = safeIncomeType === "minx" ? Math.min(Math.round(businessProfit ?? 0), MAX_RATE) : 0;
    const safeRealSal = safeIncomeType === "real" ? Math.min(Math.round(realSalaryAmount ?? 0), MAX_RATE) : 0;
    const playerName = await derivePlayerName(req);
    await db.insert(businessSnapshotsTable).values({
      playerName: String(playerName).slice(0, 32).toUpperCase(),
      userId: String(req.user.id),
      slotIndex: Number(slotIndex ?? 0),
      balance: Math.round(balance),
      salary: Math.round(Math.min(salary ?? balance, MAX_BALANCE)),
      businessProfit: safeBizProfit,
      governmentBaseSalary: govBase,
      realSalaryAmount: safeRealSal,
      incomeType: safeIncomeType,
      snapshotReason: String(snapshotReason ?? "auto").slice(0, 64),
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[World] snapshots error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/world/snapshots/latest", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const slotIndex = parseInt(String(req.query.slot ?? "0"), 10);
    const snapshots = await db
      .select()
      .from(businessSnapshotsTable)
      .where(and(
        eq(businessSnapshotsTable.userId, String(req.user.id)),
        eq(businessSnapshotsTable.slotIndex, slotIndex),
      ))
      .orderBy(desc(businessSnapshotsTable.createdAt))
      .limit(1);
    if (snapshots.length === 0) {
      res.json({ snapshot: null });
      return;
    }
    res.json({ snapshot: snapshots[0] });
  } catch (err: any) {
    console.error("[World] snapshots/latest error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /world/salary-proof
 * Returns the storage path for the authenticated user's latest real-salary proof document.
 * The client can then fetch /storage/objects/<path> to view the file.
 */
router.get("/world/salary-proof", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const slotIndex = parseInt(String(req.query.slot ?? "0"), 10);
    // Find the latest declaration snapshot for this user+slot
    const declarations = await db
      .select()
      .from(businessSnapshotsTable)
      .where(and(
        eq(businessSnapshotsTable.userId, String(req.user.id)),
        eq(businessSnapshotsTable.slotIndex, slotIndex),
        eq(businessSnapshotsTable.snapshotReason, "real_salary_declaration"),
      ))
      .orderBy(desc(businessSnapshotsTable.createdAt))
      .limit(1);
    if (declarations.length === 0 || !declarations[0].data) {
      res.json({ proofObjectPath: null, realSalaryAmount: null });
      return;
    }
    const data = declarations[0].data as Record<string, unknown>;
    const proofObjectPath = typeof data.proofObjectPath === "string" ? data.proofObjectPath : null;
    res.json({
      proofObjectPath,
      storagePath: proofObjectPath ? `/storage${proofObjectPath}` : null,
      realSalaryAmount: declarations[0].realSalaryAmount,
      declaredAt: data.declaredAt ?? null,
    });
  } catch (err: any) {
    console.error("[World] salary-proof error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /world/business-profit-rate
 * Server-authoritative computation of the player's Minx business profit rate (ƒ/min).
 * Aggregates all server-recorded business_profit category transactions for the player,
 * then divides by the elapsed minutes window to produce a ƒ/min rate.
 * The rate is capped at 500 ƒ/min.
 */
router.get("/world/business-profit-rate", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const playerName = await derivePlayerName(req);
    // Sum all business_profit transactions for this player
    const rows = await db
      .select({ total: sql<number>`SUM(${businessTransactionsTable.amount})`, count: sql<number>`COUNT(*)`, minDate: sql<string>`MIN(${businessTransactionsTable.createdAt})` })
      .from(businessTransactionsTable)
      .where(and(
        eq(businessTransactionsTable.playerName, playerName),
        eq(businessTransactionsTable.category, "business_profit"),
      ));
    const total = Number(rows[0]?.total ?? 0);
    const count = Number(rows[0]?.count ?? 0);
    if (count === 0) {
      res.json({ businessProfitRate: 0, transactionCount: 0, totalEarned: 0 });
      return;
    }
    // Rate = total earned / elapsed minutes since first transaction, capped at 500
    const firstDate = rows[0]?.minDate ? new Date(rows[0].minDate).getTime() : Date.now();
    const elapsedMinutes = Math.max(1, (Date.now() - firstDate) / 60_000);
    const rate = Math.min(Math.round(total / elapsedMinutes), 500);
    res.json({ businessProfitRate: rate, transactionCount: count, totalEarned: total });
  } catch (err: any) {
    console.error("[World] business-profit-rate error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/world/my-business", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const playerName = await derivePlayerName(req);
    const businesses = await db
      .select()
      .from(worldBusinessesTable)
      .where(eq(worldBusinessesTable.playerName, playerName))
      .orderBy(desc(worldBusinessesTable.createdAt));
    res.json({ businesses });
  } catch (err: any) {
    console.error("[World] my-business error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/world/my-office", async (req, res) => {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const userId = String(req.user.id);

    const buildings = await db
      .select()
      .from(cityBuildingsTable)
      .where(and(eq(cityBuildingsTable.ownerId, userId), eq(cityBuildingsTable.demolished, false)));

    const orgs = await db
      .select({ orgId: organizationsTable.id, orgName: organizationsTable.name, role: orgMembersTable.role })
      .from(orgMembersTable)
      .innerJoin(organizationsTable, eq(orgMembersTable.orgId, organizationsTable.id))
      .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")));

    const orgIds = orgs.map(o => o.orgId);
    const orgClause = orgIds.length > 0
      ? and(isNotNull(botSubscriptionsTable.orgId), inArray(botSubscriptionsTable.orgId, orgIds))
      : undefined;
    const subWhere = orgClause
      ? and(eq(botSubscriptionsTable.status, "active"), or(eq(botSubscriptionsTable.userId, userId), orgClause))
      : and(eq(botSubscriptionsTable.userId, userId), eq(botSubscriptionsTable.status, "active"));

    const subsRaw = await db
      .select({
        name: botMarketplaceTable.name,
        slug: botMarketplaceTable.slug,
        category: botMarketplaceTable.category,
        tagline: botMarketplaceTable.tagline,
        icon: botMarketplaceTable.icon,
        status: botSubscriptionsTable.status,
        orgId: botSubscriptionsTable.orgId,
      })
      .from(botSubscriptionsTable)
      .innerJoin(botMarketplaceTable, eq(botSubscriptionsTable.marketplaceItemId, botMarketplaceTable.id))
      .where(subWhere);

    // Dedupe by slug (org-owned bots can appear via both user-sub and org-sub).
    const seen = new Set<string>();
    const subs = subsRaw.filter(s => { if (seen.has(s.slug)) return false; seen.add(s.slug); return true; });

    const isAdmin = orgs.some(o => o.role === "owner" || o.role === "ceo" || o.role === "executive");

    res.json({
      buildings: buildings.map(b => ({ id: b.id, name: b.name, type: b.buildingType, label: b.label })),
      bots: subs,
      orgs,
      isAdmin,
      hasOffice: buildings.length > 0,
    });
  } catch (err: any) {
    console.error("[World] my-office error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/world/online", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const requesterId = String(req.user.id);
  const admin = isOwnerEmail(req.user.email);
  const [modRows, adminRows, memberships] = await Promise.all([
    db.select({ userId: alphaApplicationsTable.userId })
      .from(alphaApplicationsTable)
      .where(and(
        eq(alphaApplicationsTable.userId, requesterId),
        eq(alphaApplicationsTable.role, "alpha_tester"),
        eq(alphaApplicationsTable.status, "approved"),
      )),
    db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable),
    db.select({ orgId: orgMembersTable.orgId, role: orgMembersTable.role })
      .from(orgMembersTable)
      .where(and(eq(orgMembersTable.userId, requesterId), eq(orgMembersTable.status, "active"))),
  ]);
  const moderator = modRows.length > 0;
  const adminIds = new Set(adminRows.filter(u => isOwnerEmail(u.email)).map(u => String(u.id)));
  const executiveOrgIds = new Set(
    memberships
      .filter(m => ["owner", "ceo", "executive", "director"].includes(String(m.role).toLowerCase()))
      .map(m => m.orgId),
  );

  if (!admin && !moderator && executiveOrgIds.size === 0) {
    res.status(403).json({ error: "Moderator, administrator, or organization executive access required" });
    return;
  }

  const all = getOnlinePlayers();
  // The live world snapshot is intentionally broad for platform staff, but
  // moderators must never receive administrator locations or identity data.
  const visible = admin
    ? all
    : all.filter((player) => !adminIds.has(String(player.userId)));
  res.json({
    players: visible,
    count: visible.length,
    ts: Date.now(),
    scope: admin ? "platform" : moderator ? "moderator" : "organization",
    canSeeAdmins: admin,
  });
});

router.get("/world/server-status", (_req, res) => {
  res.json(getServerStatus());
});

router.post("/world/heartbeat", async (req, res): Promise<void> => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const name = await derivePlayerName(req);
  recordHeartbeat(String(user.id), name, user.profileImageUrl ?? null);
  res.json({ ok: true });
});

router.get("/world/liberation", (_req, res) => {
  res.json({ progress: getLiberationProgress() });
});

const BUILDING_TYPES: Record<string, { minW: number; minH: number; maxW: number; maxH: number; baseCost: number }> = {
  shack:     { minW: 40, minH: 30, maxW: 60,  maxH: 50,  baseCost: 200 },
  kiosk:     { minW: 30, minH: 25, maxW: 50,  maxH: 40,  baseCost: 150 },
  office:    { minW: 60, minH: 50, maxW: 120, maxH: 90,  baseCost: 500 },
  shop:      { minW: 50, minH: 40, maxW: 100, maxH: 70,  baseCost: 400 },
  warehouse: { minW: 80, minH: 60, maxW: 160, maxH: 100, baseCost: 800 },
  tower:     { minW: 60, minH: 80, maxW: 120, maxH: 160, baseCost: 2000 },
  compound:  { minW: 100, minH: 80, maxW: 200, maxH: 150, baseCost: 3000 },
};

const VALID_COLORS = ['#38bdf8','#a855f7','#10b981','#f59e0b','#ef4444','#ec4899','#3b82f6','#84cc16','#67e8f9','#fb923c','#f472b6','#a78bfa','#fbbf24','#6ee7b7'];

// Owner pricing (SPEC A): land is ƒ10,000 per pixel of footprint and
// construction is ƒ50,000 per pixel, so placing a building costs
// footprint_area × (LAND + CONSTRUCTION) FIAT. Building type only bounds the
// allowed size now — it no longer scales the price.
const LAND_FIAT_PER_PIXEL = 10_000;
const CONSTRUCTION_FIAT_PER_PIXEL = 50_000;

function calcBuildCost(type: string, w: number, h: number): number {
  const spec = BUILDING_TYPES[type];
  if (!spec) return 9999;
  const area = Math.max(0, Math.round(w) * Math.round(h));
  return area * (LAND_FIAT_PER_PIXEL + CONSTRUCTION_FIAT_PER_PIXEL);
}

router.get("/world/buildings", async (req, res) => {
  try {
    const serverId = (req.query.serverId as string) || "minx_prime";
    const rows = await db
      .select()
      .from(cityBuildingsTable)
      .where(and(eq(cityBuildingsTable.serverId, serverId), eq(cityBuildingsTable.demolished, false)));
    res.json({
      buildings: rows.map((building) => ({
        ...building,
        condition: deriveConditionProfile(building.conditionScore, building.conditionLastMaintainedAt),
      })),
    });
  } catch (err: any) {
    console.error("[World] buildings list error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/world/building-types", (_req, res) => {
  const types = Object.entries(BUILDING_TYPES).map(([id, spec]) => ({
    id,
    label: id.toUpperCase(),
    minW: spec.minW, minH: spec.minH,
    maxW: spec.maxW, maxH: spec.maxH,
    baseCost: spec.baseCost,
  }));
  res.json({ types, colors: VALID_COLORS });
});

router.post("/world/buildings", async (req, res) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const { name, buildingType, x, y, w, h, color, label, description, rentPrice, isPublic, serverId } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "Building name required" }); return;
    }
    const type = buildingType || "office";
    const spec = BUILDING_TYPES[type];
    if (!spec) {
      res.status(400).json({ error: `Invalid building type. Valid: ${Object.keys(BUILDING_TYPES).join(", ")}` }); return;
    }
    const bw = Math.max(spec.minW, Math.min(spec.maxW, Number(w) || spec.minW));
    const bh = Math.max(spec.minH, Math.min(spec.maxH, Number(h) || spec.minH));
    const bx = Number(x) || 0;
    const by = Number(y) || 0;
    const bColor = VALID_COLORS.includes(color) ? color : "#38bdf8";
    const cost = calcBuildCost(type, bw, bh);
    const ownerName = await derivePlayerName(req);
    const sid = serverId || "minx_prime";

    const existing = await db
      .select({ id: cityBuildingsTable.id })
      .from(cityBuildingsTable)
      .where(and(eq(cityBuildingsTable.serverId, sid), eq(cityBuildingsTable.demolished, false)));

    for (const eb of existing) {
      const rows = await db.select().from(cityBuildingsTable).where(eq(cityBuildingsTable.id, eb.id));
      if (rows.length === 0) continue;
      const e = rows[0];
      const overlap = bx < e.x + e.w && bx + bw > e.x && by < e.y + e.h && by + bh > e.y;
      if (overlap) {
        res.status(409).json({ error: "Location overlaps existing building" }); return;
      }
    }

    const [inserted] = await db.insert(cityBuildingsTable).values({
      ownerId: String(user.id),
      ownerName,
      name: name.trim().toUpperCase().slice(0, 80),
      buildingType: type,
      x: bx, y: by, w: bw, h: bh,
      color: bColor,
      label: (label || name).trim().toUpperCase().slice(0, 40),
      description: description?.trim().slice(0, 200) || null,
      rentPrice: Math.max(0, Number(rentPrice) || 0),
      buildCost: cost,
      isPublic: isPublic === true,
      serverId: sid,
    }).returning();

    res.json({ building: inserted, cost });
  } catch (err: any) {
    console.error("[World] build error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/world/buildings/:id", async (req, res) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const buildingId = Number(req.params.id as string);
    const rows = await db.select().from(cityBuildingsTable).where(eq(cityBuildingsTable.id, buildingId));
    if (rows.length === 0) { res.status(404).json({ error: "Building not found" }); return; }
    const building = rows[0];
    if (building.ownerId !== String(user.id)) {
      res.status(403).json({ error: "Not your building" }); return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const { name, color, label, description, rentPrice, isPublic } = req.body;
    if (name && typeof name === "string") updates.name = name.trim().toUpperCase().slice(0, 80);
    if (color && VALID_COLORS.includes(color)) updates.color = color;
    if (label && typeof label === "string") updates.label = label.trim().toUpperCase().slice(0, 40);
    if (typeof description === "string") updates.description = description.trim().slice(0, 200) || null;
    if (typeof rentPrice === "number") updates.rentPrice = Math.max(0, rentPrice);
    if (typeof isPublic === "boolean") updates.isPublic = isPublic;

    const [updated] = await db.update(cityBuildingsTable)
      .set(updates)
      .where(eq(cityBuildingsTable.id, buildingId))
      .returning();
    res.json({ building: updated });
  } catch (err: any) {
    console.error("[World] building update error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/world/buildings/:id/rent", async (req, res) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const buildingId = Number(req.params.id as string);
    const rows = await db.select().from(cityBuildingsTable).where(eq(cityBuildingsTable.id, buildingId));
    if (rows.length === 0) { res.status(404).json({ error: "Building not found" }); return; }
    const building = rows[0];
    if (building.ownerId === String(user.id)) {
      res.status(400).json({ error: "Cannot rent your own building" }); return;
    }
    if (building.tenantId && building.tenantId !== String(user.id)) {
      res.status(409).json({ error: "Already rented by someone else" }); return;
    }
    if (building.tenantId === String(user.id)) {
      const [updated] = await db.update(cityBuildingsTable)
        .set({ tenantId: null, tenantName: null, updatedAt: new Date() })
        .where(eq(cityBuildingsTable.id, buildingId))
        .returning();
      res.json({ building: updated, action: "vacated" });
      return;
    }
    const tenantName = await derivePlayerName(req);
    const [updated] = await db.update(cityBuildingsTable)
      .set({ tenantId: String(user.id), tenantName, updatedAt: new Date() })
      .where(eq(cityBuildingsTable.id, buildingId))
      .returning();
    res.json({ building: updated, action: "rented", rentPrice: building.rentPrice });
  } catch (err: any) {
    console.error("[World] rent error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/world/buildings/:id/repair", async (req, res) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const buildingId = Number(req.params.id as string);
    const service = await serviceBuildingCondition({
      buildingId,
      providerKind: req.body?.providerKind === "company" ? "company" : "player",
      providerId: typeof req.body?.providerId === "string" ? req.body.providerId : String(user.id),
      workUnits: req.body?.workUnits,
      actorUserId: String(user.id),
    });
    res.json(service);
  } catch (err: any) {
    console.error("[World] building repair error:", err.message);
    const status = err?.statusCode ?? 500;
    res.status(status).json({ error: err instanceof Error ? err.message : "Repair failed" });
  }
});

type BuildingServiceProvider = "player" | "company" | "npc";

export async function serviceBuildingCondition(input: {
  buildingId: number;
  providerKind: BuildingServiceProvider;
  providerId: string;
  workUnits?: number;
  actorUserId?: string;
}) {
  const [building] = await db
    .select()
    .from(cityBuildingsTable)
    .where(eq(cityBuildingsTable.id, input.buildingId));
  if (!building || building.demolished) {
    const error = new Error("Building not found");
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }

  if (input.providerKind === "npc") {
    if (input.actorUserId || !input.providerId.startsWith("npc:")) {
      const error = new Error("NPC service is server-only");
      (error as Error & { statusCode?: number }).statusCode = 403;
      throw error;
    }
  } else {
    if (!input.actorUserId || input.providerId !== input.actorUserId) {
      const error = new Error("Service provider identity did not resolve");
      (error as Error & { statusCode?: number }).statusCode = 403;
      throw error;
    }
    const canService =
      building.isPublic ||
      building.ownerId === input.actorUserId ||
      building.tenantId === input.actorUserId;
    if (!canService) {
      const error = new Error("You need a public, owned, or rented building to service it");
      (error as Error & { statusCode?: number }).statusCode = 403;
      throw error;
    }
  }

  const now = new Date();
  const workUnits = Math.max(1, Math.min(8, Math.floor(Number(input.workUnits) || 1)));
  const repaired = repairConditionScore(
    building.conditionScore,
    building.conditionLastMaintainedAt,
    workUnits,
    now.getTime(),
  );
  const [updated] = await db
    .update(cityBuildingsTable)
    .set({
      conditionScore: repaired.repairedScore,
      conditionLastMaintainedAt: now,
      conditionRepairCount: sql`${cityBuildingsTable.conditionRepairCount} + ${workUnits}`,
      updatedAt: now,
    })
    .where(eq(cityBuildingsTable.id, input.buildingId))
    .returning();
  return {
    building: updated
      ? {
          ...updated,
          condition: deriveConditionProfile(
            updated.conditionScore,
            updated.conditionLastMaintainedAt,
            now.getTime(),
          ),
        }
      : null,
    repair: {
      workUnits,
      providerKind: input.providerKind,
      providerId: input.providerId,
      condition: repaired.profile,
    },
  };
}

router.delete("/world/buildings/:id", async (req, res) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const buildingId = Number(req.params.id as string);
    const rows = await db.select().from(cityBuildingsTable).where(eq(cityBuildingsTable.id, buildingId));
    if (rows.length === 0) { res.status(404).json({ error: "Building not found" }); return; }
    const building = rows[0];
    if (building.ownerId !== String(user.id)) {
      res.status(403).json({ error: "Not your building" }); return;
    }
    const refund = Math.round(building.buildCost * 0.4);
    await db.update(cityBuildingsTable)
      .set({ demolished: true, updatedAt: new Date() })
      .where(eq(cityBuildingsTable.id, buildingId));
    res.json({ ok: true, refund });
  } catch (err: any) {
    console.error("[World] demolish error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
