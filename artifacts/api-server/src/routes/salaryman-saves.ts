import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { db, salarymanSavesTable, organizationsTable, orgMembersTable, worldBusinessesTable, usersTable, artAssetsTable, playerLedgerTable, playerCityVisasTable, playerGoldAccountsTable } from "@workspace/db";
import { CHARACTER_TEMPLATE_CATALOG } from "../lib/salaryman-art";
import { eq, ne, and, or, inArray, sql } from "drizzle-orm";
import { getUserTier } from "../lib/plan";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { getObjectAclPolicy } from "../lib/objectAcl";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getOpenAiTextModel } from "../lib/openai-models";
import { generateImage, isNanoBananaConfigured, isImageServiceOutage } from "../lib/nano-banana";
import { burnAiCharge, getPowerStatus, ACTIVE_SLOT, ASSISTANT_TARGET_ID } from "../lib/battery";
import { flushPendingAdminFiatGrant } from "../lib/seed-picasso";
import { getSpendableFiat } from "../lib/fiat-wallet";
import { defaultT1ForClass } from "../lib/skill-catalog";
import { captureLegacyRecoverySnapshots, restoreLegacyRecoveryForUser } from "../lib/legacy-recovery";

const router: IRouter = Router();

// ── Debt ledger sync ─────────────────────────────────────────────────────────
// On every save we read the three in-game financial obligations from the blob
// and push them into the player_ledger so the credit-score engine sees the full
// picture: taxDebt (pablo corp taxes owed), bountyAmount (wanted-level fines),
// and active loan principal+interest. All three are denominated in ƒ.
//
// We also maintain negativeBalanceDays — the "days underwater" counter that the
// schema and score engine expect to be incremented, but which had no write path
// before this. Rate-limited to once per real-hour (= one in-game day) so rapid
// auto-saves don't inflate the counter.
//
// This is fire-and-forget (caller `.catch()`es); a failure here NEVER breaks the
// save response.

const FIAT_PER_GOLD_SAVE = 1_000; // mirrors gameSystems.ts FIAT_PER_GOLD
const NEGATIVE_DAY_INTERVAL_MS = 3_600_000; // 1 real hour = 1 in-game day

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Compatibility projection for legacy save consumers; never trust save FIAT. */
export function applyAuthoritativeSalarySnapshot(data: Record<string, unknown>, walletBalance: number): number {
  const balance = Number.isSafeInteger(walletBalance) && walletBalance >= 0 ? walletBalance : 0;
  data.salary = balance;
  return balance;
}

async function syncDebtToLedger(userId: string, saveData: Record<string, unknown>): Promise<void> {
  // ── 1. Extract in-game obligations ────────────────────────────────────────
  const taxDebt     = Math.max(0, Math.round(num(saveData.taxDebt)));
  const bountyAmt   = Math.max(0, Math.round(num(saveData.bountyAmount)));
  const loanRaw     = saveData.loan as { amount?: unknown; interest?: unknown } | null | undefined;
  const loanTotal   = loanRaw
    ? Math.max(0, Math.round(num(loanRaw.amount) + num(loanRaw.interest)))
    : 0;
  const inGameDebt  = taxDebt + bountyAmt + loanTotal;

  // ── 2. Compute net worth from save blob (same formula as pablo-tax.ts) ────
  const salary       = Math.max(0, num(saveData.salary));
  const savings      = Math.max(0, num(saveData.savings));
  const goldBalance  = Math.max(0, num(saveData.goldBalance));
  const propDeeds    = Array.isArray(saveData.propertyDeeds)
    ? (saveData.propertyDeeds as Array<{ currentValue?: unknown; purchasePrice?: unknown }>)
        .reduce((s, d) => s + Math.max(0, num(d.currentValue ?? d.purchasePrice)), 0)
    : 0;
  // Net worth: liquid cash + gold value + property minus outstanding tax debt
  const netWorth = salary + savings + goldBalance * FIAT_PER_GOLD_SAVE + propDeeds - taxDebt;
  const isUnderwater = netWorth < 0;

  // ── 3. Load (or create) ledger row ────────────────────────────────────────
  const rows = await db.select().from(playerLedgerTable)
    .where(eq(playerLedgerTable.userId, userId)).limit(1);
  let led = rows[0];
  if (!led) {
    const [created] = await db.insert(playerLedgerTable).values({ userId }).returning();
    led = created;
  }

  // ── 4. Build the update ───────────────────────────────────────────────────
  const updates: Record<string, unknown> = {};

  // Sync current in-game obligations (decreases when player pays off in-game)
  updates.inGameDebt = inGameDebt;

  // totalDebtAccrued: monotonically growing lifetime counter.
  // We add any INCREASE in in-game debt to it so the history is permanent.
  const prevInGame  = num(led.inGameDebt);
  const debtDelta   = inGameDebt - prevInGame;
  if (debtDelta > 0) {
    // Use sql expression so concurrent updates don't race (CF/plan paths may
    // also be bumping totalDebtAccrued at the same instant).
    updates.totalDebtAccrued = sql`${playerLedgerTable.totalDebtAccrued} + ${debtDelta}`;
  }

  // negativeBalanceDays: increment at most once per in-game day (1 real hour)
  // so auto-saves every 30s don't artificially inflate the counter.
  if (isUnderwater) {
    const lastNegMs = led.lastNegativeAt ? new Date(led.lastNegativeAt).getTime() : 0;
    updates.lastNegativeAt = new Date();
    if (Date.now() - lastNegMs >= NEGATIVE_DAY_INTERVAL_MS) {
      updates.negativeBalanceDays = sql`${playerLedgerTable.negativeBalanceDays} + 1`;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.update(playerLedgerTable).set(updates as any).where(eq(playerLedgerTable.userId, userId));
}

const FREE_MAX_SLOTS = 2;
const PRO_MAX_SLOTS = 10;
const ENTERPRISE_MAX_SLOTS = 1;

// ── Story Mode (foundation) ──────────────────────────────────────────────────
// Story progression is a per-character (per save-slot) state stored inside the
// save's `data` JSON blob under `data.story`. Beginning the story is a deliberate,
// one-way, server-authorized commitment: the player must have completed their
// "first project" (registered a business OR taken a job) and it permanently
// relocates their home base + grants the MX-75 mobile office link. We keep the
// canonical begin-state on the server so the unlock can never be faked by a
// client flag (see onboarding-complete gating).
const STORY_HOME = { kind: "campsite" as const, x: 6620, y: 6520, label: "UNDERGROUND CAMP" };

// Extract a normalized (trimmed, upper-cased) dog companion name from a save
// blob, or null when there is no ACTIVE named dog. Inactive saves carry no
// `dogCompanion` key, so they never reserve a name.
export function normalizeDogName(data: Record<string, unknown> | undefined | null): string | null {
  const dc = data?.dogCompanion as Record<string, unknown> | undefined;
  if (!dc || dc.active !== true) return null;
  const n = typeof dc.name === "string" ? dc.name.trim().toUpperCase() : "";
  return n.length > 0 ? n : null;
}

// Same as normalizeDogName for the parallel cat companion. Cat names share the
// SAME rules as dogs but live in a SEPARATE namespace (unique among cats), so
// they never collide with dog names.
export function normalizeCatName(data: Record<string, unknown> | undefined | null): string | null {
  const cc = data?.catCompanion as Record<string, unknown> | undefined;
  if (!cc || cc.active !== true) return null;
  const n = typeof cc.name === "string" ? cc.name.trim().toUpperCase() : "";
  return n.length > 0 ? n : null;
}

export interface StoryState {
  active: boolean;
  startedAt: string;
  quarter: number;
  chapter: number;
  missionIndex: number;
  homeBase: { kind: string; x: number; y: number; label: string };
  mx75Granted: boolean;
  // Ids of completed story assignments (per-quarter, ordered). Persisted as part
  // of the per-character data.story blob; rides the story-merge below.
  assignmentsCompleted?: string[];
  // SCENE 1 mid-escape checkpoint (alley/battle milestones). Rides the story blob
  // so a reload during the breakout resumes; passes through the merge spread.
  scene1?: { alleyReached?: boolean; battleStarted?: boolean; battleDone?: boolean };
}

const INACTIVE_STORY: StoryState = {
  active: false,
  startedAt: "",
  quarter: 1,
  chapter: 1,
  missionIndex: 0,
  homeBase: { ...STORY_HOME },
  mx75Granted: false,
  assignmentsCompleted: [],
};

/**
 * One-way story merge applied on every PUT save. The story is a
 * server-authoritative commitment: once `active` it must NEVER revert, even if a
 * stale/concurrent client save arrives without the flag (lost-update
 * protection). We read the committed (prior) story and merge it back over the
 * incoming blob.
 *
 * - If the prior story is NOT active, the incoming story passes through as-is.
 * - If the prior story IS active and the incoming one is also active, forward
 *   progress passes through (the `...incomingStory` spread — including any
 *   `scene1` mid-escape checkpoint), while the immutable commitment fields
 *   (`active`/`startedAt`/`homeBase`/`mx75Granted`) are pinned from the prior
 *   copy so they can't be downgraded.
 * - If the prior story is active but the incoming one is missing/inactive (a
 *   downgrade attempt), the prior story is kept wholesale.
 */
export function mergeStoryOnSave(
  priorStory: StoryState | undefined,
  incomingStory: StoryState | undefined,
): StoryState | undefined {
  if (!priorStory?.active) return incomingStory;
  return incomingStory?.active
    ? {
        ...incomingStory,
        active: true,
        startedAt: priorStory.startedAt,
        homeBase: priorStory.homeBase,
        mx75Granted: true,
      }
    : priorStory;
}

/**
 * Server-authoritative eligibility: the player has finished their "first
 * project" if they have registered a business (world registry row, or a
 * persisted business in their save) OR they hold a job (employedAt in the save,
 * or an active org membership). Derived entirely from server-readable state —
 * never from a client-supplied flag.
 */
async function computeStoryEligibility(
  userId: string,
  charName: string,
  saveData: Record<string, unknown> | null,
): Promise<{ eligible: boolean; reason: string }> {
  if (saveData) {
    const employed = saveData.employedAt != null && saveData.employedAt !== "";
    const businesses = saveData.businesses;
    const hasBiz = Array.isArray(businesses) && businesses.length > 0;
    if (employed || hasBiz) return { eligible: true, reason: "save" };
  }
  const biz = await db
    .select({ id: worldBusinessesTable.id })
    .from(worldBusinessesTable)
    .where(
      and(
        or(eq(worldBusinessesTable.userId, userId), eq(worldBusinessesTable.playerName, charName)),
        inArray(worldBusinessesTable.businessType, ["real", "minx"]),
      ),
    )
    .limit(1);
  if (biz.length > 0) return { eligible: true, reason: "registry" };
  const membership = await db
    .select({ orgId: orgMembersTable.orgId })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
    .limit(1);
  if (membership.length > 0) return { eligible: true, reason: "org" };
  return {
    eligible: false,
    reason: "Complete your first project — get a job or register a business — before you can begin the story.",
  };
}

async function hasActiveEnterprise(userId: string): Promise<boolean> {
  const owned = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.ownerUserId, userId))
    .limit(1);
  if (owned.length > 0) return true;
  const membership = await db
    .select({ orgId: orgMembersTable.orgId })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
    .limit(1);
  if (membership.length > 0) return true;
  const realBiz = await db
    .select({ id: worldBusinessesTable.id })
    .from(worldBusinessesTable)
    .where(and(eq(worldBusinessesTable.userId, userId), eq(worldBusinessesTable.businessType, "real")))
    .limit(1);
  return realBiz.length > 0;
}

router.post("/salaryman/saves/ensure", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const recovery = await restoreLegacyRecoveryForUser(req.user.id, req.user.email);
    const [existing] = await db
      .select()
      .from(salarymanSavesTable)
      .where(eq(salarymanSavesTable.userId, req.user.id))
      .orderBy(salarymanSavesTable.slotIndex)
      .limit(1);
    if (existing) {
      res.json({ save: existing, created: false });
      return;
    }

    const [registry] = await db
      .select({
        playerName: worldBusinessesTable.playerName,
        meta: worldBusinessesTable.meta,
      })
      .from(worldBusinessesTable)
      .where(eq(worldBusinessesTable.userId, req.user.id))
      .orderBy(sql`${worldBusinessesTable.createdAt} DESC`)
      .limit(1);
    if (!registry) {
      res.status(409).json({ error: "Complete onboarding before entering a public floor" });
      return;
    }

    const meta = (registry.meta ?? {}) as Record<string, unknown>;
    const charClass = typeof meta.jobClass === "string" && meta.jobClass.trim()
      ? meta.jobClass.trim().slice(0, 32).toUpperCase()
      : "OPERATOR";
    await db.insert(salarymanSavesTable).values({
      userId: req.user.id,
      slotIndex: 0,
      charName: registry.playerName.slice(0, 64),
      charClass,
      lastZone: "SHADOW TOWER",
      data: recovery.properties.find((property) => property.slotIndex === 0)
        ? { propertyDeeds: recovery.properties.find((property) => property.slotIndex === 0)?.propertyDeeds }
        : {},
    }).onConflictDoNothing();

    const [save] = await db
      .select()
      .from(salarymanSavesTable)
      .where(and(
        eq(salarymanSavesTable.userId, req.user.id),
        eq(salarymanSavesTable.slotIndex, 0),
      ))
      .limit(1);
    if (!save) {
      res.status(500).json({ error: "Unable to create operator record" });
      return;
    }
    res.status(201).json({ save, created: true });
  } catch (err: any) {
    console.error("[saves] ensure error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/salaryman/saves", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    await restoreLegacyRecoveryForUser(req.user.id, req.user.email);
    const tier = await getUserTier(req.user.id, req.user.email);
    const enterprise = await hasActiveEnterprise(req.user.id);
    const maxSlots = enterprise ? ENTERPRISE_MAX_SLOTS : tier === "pro" ? PRO_MAX_SLOTS : FREE_MAX_SLOTS;
    const saves = await db
      .select()
      .from(salarymanSavesTable)
      .where(eq(salarymanSavesTable.userId, req.user.id));
    res.json({ saves, maxSlots, tier, enterprise });
  } catch (err: any) {
    console.error("[saves] list error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/salaryman/saves/:slot", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const slot = parseInt(req.params.slot, 10);
  const tier = await getUserTier(req.user.id, req.user.email);
  const enterprise = await hasActiveEnterprise(req.user.id);
  const maxSlots = enterprise ? ENTERPRISE_MAX_SLOTS : tier === "pro" ? PRO_MAX_SLOTS : FREE_MAX_SLOTS;
  if (isNaN(slot) || slot < 0 || slot >= maxSlots) {
    res.status(400).json({ error: enterprise ? "Enterprise accounts are limited to 1 save slot" : `Invalid slot (0-${maxSlots - 1})`, maxSlots, tier, enterprise });
    return;
  }
    const { charName, charClass, level, lastZone, playtime, data } = req.body;
  if (!charName || !charClass || !data) {
    res.status(400).json({ error: "charName, charClass, data required" });
    return;
  }
  try {
    const recovery = await restoreLegacyRecoveryForUser(req.user.id, req.user.email);
    let dogNameRejected = false;
    let catNameRejected = false;
    // One-way story guard: the story is a server-authoritative commitment. Once
    // it is active it must NEVER revert, even if a stale/concurrent client save
    // arrives without the story flag (lost-update protection). We read the
    // committed story and merge it back over the incoming blob, preserving the
    // immutable commitment fields while still letting forward progress through.
    const incoming = data as Record<string, unknown>;
    const [prior] = await db
      .select({ data: salarymanSavesTable.data })
      .from(salarymanSavesTable)
      .where(and(eq(salarymanSavesTable.userId, req.user.id), eq(salarymanSavesTable.slotIndex, slot)))
      .limit(1);
    const priorData = prior?.data as Record<string, unknown> | undefined;
    const protectedProperties = recovery.properties.find((property) => property.slotIndex === slot);
    if (protectedProperties && incoming.propertyDeeds === undefined) {
      incoming.propertyDeeds = protectedProperties.propertyDeeds;
    }
    const priorStory = (priorData?.story) as StoryState | undefined;
    if (priorStory?.active) {
      incoming.story = mergeStoryOnSave(priorStory, incoming.story as StoryState | undefined);
    }
    // Owned-property carry-over: real-estate ownership (`office`/`home`) is
    // written by the atomic /real-estate/acquire endpoint. The world client's
    // doSave rebuilds `data` from explicit gameplay fields and does NOT know
    // about these keys, so a routine save would otherwise CLOBBER ownership.
    // Preserve a prior owned property whenever the incoming blob omits it.
    if (priorData?.office !== undefined && incoming.office === undefined) {
      incoming.office = priorData.office;
    }
    if (priorData?.home !== undefined && incoming.home === undefined) {
      incoming.home = priorData.home;
    }
    // Owned businesses (data.businesses[]) are written by the atomic
    // /business-market acquire & buy endpoints. The client's doSave does not
    // know about them, so carry a prior holdings array over whenever the
    // incoming blob omits it — otherwise a routine save clobbers the portfolio.
    if (priorData?.businesses !== undefined && incoming.businesses === undefined) {
      incoming.businesses = priorData.businesses;
    }
    // First-arrival Tower state is issued by reception and must survive the
    // world client's narrower gameplay-save payload.
    if (priorData?.towerOnboarding !== undefined && incoming.towerOnboarding === undefined) {
      incoming.towerOnboarding = priorData.towerOnboarding;
    }
    // Skill unlocks (data.skills[]) are written server-side by /skills/unlock.
    // The client's doSave does not include this key, so carry it over to prevent
    // a routine save from clobbering server-granted unlocks.
    if (priorData?.skills !== undefined && incoming.skills === undefined) {
      incoming.skills = priorData.skills;
    }
    // REC stamina, sessions, inventory effects and idempotency markers are
    // server-owned. Browser saves must never mint or roll them back.
    if (priorData?.rec !== undefined) incoming.rec = priorData.rec;
    // Onboarding pre-unlock: first save for this slot (no prior data) gets a
    // free T1 skill based on the character class chosen during immigration.
    if (!priorData && !Array.isArray(incoming.skills)) {
      const t1Skill = defaultT1ForClass(String(charClass));
      incoming.skills = [t1Skill];
    }
    // First save: auto-grant a visa for the player's starting city so the
    // world-server visa gate doesn't block them on their very first connection.
    // Idempotent (ON CONFLICT DO NOTHING) — fire-and-forget, never blocks save.
    if (!priorData) {
      const startCityId = typeof incoming.cityId === "string" && incoming.cityId ? incoming.cityId : "minx_city";
      void db
        .insert(playerCityVisasTable)
        .values({ userId: req.user.id, cityId: startCityId, status: "visa" })
        .onConflictDoNothing()
        .catch((err: Error) => console.error("[SaveVisa] auto-grant failed:", err.message));
    }
    // FIAT is held only in bank_accounts. A save may carry a salary field for
    // old clients, but its value is always overwritten with this server wallet
    // snapshot; neither the top-level nor JSON blob can mint or restore FIAT.
    const wallet = await getSpendableFiat(req.user.id);
    applyAuthoritativeSalarySnapshot(incoming, wallet.balance);
    // GOLD is also server-owned. The migration seeded existing holdings once;
    // all later browser saves receive the ledger value and can never mint GOLD.
    await db.insert(playerGoldAccountsTable)
      .values({ userId: req.user.id, slotIndex: slot })
      .onConflictDoNothing();
    const [goldAccount] = await db.select({ balanceTenths: playerGoldAccountsTable.balanceTenths })
      .from(playerGoldAccountsTable)
      .where(and(eq(playerGoldAccountsTable.userId, req.user.id), eq(playerGoldAccountsTable.slotIndex, slot)))
      .limit(1);
    incoming.goldBalance = (goldAccount?.balanceTenths ?? 0) / 10;
    // Dog companion names are GLOBALLY unique — enforced at this authoritative
    // write path so a duplicate can NEVER persist even if a client bypasses the
    // /dog-name-available preflight (or two adoptions race past it). We only
    // validate on the adoption *transition* (the incoming active dog name
    // differs from the prior persisted one) so steady-state autosaves of an
    // already-owned dog never re-check. The conflict check + upsert run in ONE
    // transaction holding a name-keyed advisory lock, so two concurrent
    // adoptions of the same name can't both commit (TOCTOU). On conflict we
    // revert the dog to its prior state (dropping the duplicate). FIAT is not
    // adjusted here: companion charges are server-wallet actions, never save
    // blob mutations. Excludes the caller's own saves (consistent with the
    // preflight) so re-saving never self-collides. The stored name is
    // canonicalized (trim + upper) so future lookups always match.
    const salaryColumn = wallet.balance;
    const writeSave = (exec: Pick<typeof db, "insert">) =>
      exec
        .insert(salarymanSavesTable)
        .values({
          userId: req.user.id,
          slotIndex: slot,
          charName: String(charName).slice(0, 64).toUpperCase(),
          charClass: String(charClass).slice(0, 32).toLowerCase(),
          level: Number(level) || 1,
          salary: salaryColumn,
          lastZone: String(lastZone || "MINX CITY").slice(0, 64),
          playtime: Number(playtime) || 0,
          data: data as Record<string, unknown>,
          createdAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [salarymanSavesTable.userId, salarymanSavesTable.slotIndex],
          set: {
            charName: String(charName).slice(0, 64).toUpperCase(),
            charClass: String(charClass).slice(0, 32).toLowerCase(),
            level: Number(level) || 1,
            salary: salaryColumn,
            lastZone: String(lastZone || "MINX CITY").slice(0, 64),
            playtime: Number(playtime) || 0,
            data: data as Record<string, unknown>,
            lastSavedAt: new Date(),
          },
        })
        .returning();

    // The cat companion mirrors the dog exactly but in a SEPARATE namespace
    // (cat names unique among cats), so a dog and a cat may share a name.
    const incomingDogName = normalizeDogName(incoming);
    const priorDogName = normalizeDogName(priorData);
    const incomingCatName = normalizeCatName(incoming);
    const priorCatName = normalizeCatName(priorData);
    const dogTransition = !!incomingDogName && incomingDogName !== priorDogName;
    const catTransition = !!incomingCatName && incomingCatName !== priorCatName;
    let row;
    if (dogTransition || catTransition) {
      row = await db.transaction(async (tx) => {
        // The lock(s) are held until the tx commits, so a racing adoption of the
        // same name waits here and then sees the freshly-committed conflict. The
        // dog and cat locks are namespaced ('dog:'/'cat:') so they never falsely
        // contend across species.
        if (dogTransition) {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"dog:" + incomingDogName}))`);
          const [dup] = await tx
            .select({ userId: salarymanSavesTable.userId })
            .from(salarymanSavesTable)
            .where(
              and(
                ne(salarymanSavesTable.userId, req.user.id),
                sql`upper(trim(${salarymanSavesTable.data} -> 'dogCompanion' ->> 'name')) = ${incomingDogName}`,
              ),
            )
            .limit(1);
          if (dup) {
            if (priorData?.dogCompanion !== undefined) incoming.dogCompanion = priorData.dogCompanion;
            else delete incoming.dogCompanion;
            dogNameRejected = true;
          } else if (incoming.dogCompanion && typeof incoming.dogCompanion === "object") {
            (incoming.dogCompanion as Record<string, unknown>).name = incomingDogName;
          }
        }
        if (catTransition) {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"cat:" + incomingCatName}))`);
          const [dup] = await tx
            .select({ userId: salarymanSavesTable.userId })
            .from(salarymanSavesTable)
            .where(
              and(
                ne(salarymanSavesTable.userId, req.user.id),
                sql`upper(trim(${salarymanSavesTable.data} -> 'catCompanion' ->> 'name')) = ${incomingCatName}`,
              ),
            )
            .limit(1);
          if (dup) {
            if (priorData?.catCompanion !== undefined) incoming.catCompanion = priorData.catCompanion;
            else delete incoming.catCompanion;
            catNameRejected = true;
          } else if (incoming.catCompanion && typeof incoming.catCompanion === "object") {
            (incoming.catCompanion as Record<string, unknown>).name = incomingCatName;
          }
        }
        const [r] = await writeSave(tx);
        return r;
      });
    } else {
      const [r] = await writeSave(db);
      row = r;
    }
    // Flush any pending Picasso-admin fiat grant for this user. This covers
    // the "no save yet at approval time" case — the grant lands on the first
    // successful save write. Best-effort: never blocks or breaks the save.
    flushPendingAdminFiatGrant(req.user.id).catch((e) =>
      console.error("[saves] admin fiat flush error:", e instanceof Error ? e.message : e)
    );

    // Sync in-game financial obligations (taxDebt, bountyAmount, loans) and
    // maintain negativeBalanceDays so the credit-score engine sees everything.
    // Fire-and-forget — NEVER let this failure surface to the save response.
    syncDebtToLedger(req.user.id, incoming).catch((e) =>
      console.error("[saves] debt sync error:", e instanceof Error ? e.message : e)
    );

    res.json({ ok: true, save: row, dogNameRejected, catNameRejected });
  } catch (err: any) {
    console.error("[saves] upsert error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Story Mode: read current story state + eligibility for a save slot ──────
router.get("/salaryman/story/:slot", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const slot = parseInt(req.params.slot, 10);
  if (isNaN(slot) || slot < 0) {
    res.status(400).json({ error: "Invalid slot" });
    return;
  }
  try {
    const [save] = await db
      .select()
      .from(salarymanSavesTable)
      .where(and(eq(salarymanSavesTable.userId, req.user.id), eq(salarymanSavesTable.slotIndex, slot)))
      .limit(1);
    if (!save) {
      res.json({ story: { ...INACTIVE_STORY }, eligible: false, reason: "No save in this slot." });
      return;
    }
    const data = (save.data ?? {}) as Record<string, unknown>;
    const story = (data.story as StoryState | undefined) ?? { ...INACTIVE_STORY };
    const elig = await computeStoryEligibility(req.user.id, save.charName, data);
    res.json({ story, eligible: elig.eligible, reason: elig.reason });
  } catch (err: any) {
    console.error("[saves] story get error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Story Mode: begin the story (one-way, server-authorized commitment) ─────
router.post("/salaryman/story/:slot/begin", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const slot = parseInt(req.params.slot, 10);
  if (isNaN(slot) || slot < 0) {
    res.status(400).json({ error: "Invalid slot" });
    return;
  }
  try {
    const [save] = await db
      .select()
      .from(salarymanSavesTable)
      .where(and(eq(salarymanSavesTable.userId, req.user.id), eq(salarymanSavesTable.slotIndex, slot)))
      .limit(1);
    if (!save) {
      res.status(404).json({ error: "No save in this slot — play and save first." });
      return;
    }
    const data = (save.data ?? {}) as Record<string, unknown>;
    const existing = data.story as StoryState | undefined;
    // The story is a one-way door: once begun it never reverts.
    if (existing?.active) {
      res.json({ ok: true, story: existing, alreadyActive: true });
      return;
    }
    const elig = await computeStoryEligibility(req.user.id, save.charName, data);
    if (!elig.eligible) {
      res.status(403).json({ error: elig.reason, reason: elig.reason });
      return;
    }
    const story: StoryState = {
      active: true,
      startedAt: new Date().toISOString(),
      quarter: 1,
      chapter: 1,
      missionIndex: 0,
      homeBase: { ...STORY_HOME },
      mx75Granted: true,
      assignmentsCompleted: [],
    };
    data.story = story;
    await db
      .update(salarymanSavesTable)
      .set({ data, lastSavedAt: new Date() })
      .where(and(eq(salarymanSavesTable.userId, req.user.id), eq(salarymanSavesTable.slotIndex, slot)));
    res.json({ ok: true, story });
  } catch (err: any) {
    console.error("[saves] story begin error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/salaryman/saves/:slot", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const slot = parseInt(req.params.slot, 10);
  const tier = await getUserTier(req.user.id, req.user.email);
  const enterprise = await hasActiveEnterprise(req.user.id);
  const maxSlots = enterprise ? ENTERPRISE_MAX_SLOTS : tier === "pro" ? PRO_MAX_SLOTS : FREE_MAX_SLOTS;
  if (isNaN(slot) || slot < 0 || slot >= maxSlots) {
    res.status(400).json({ error: `Invalid slot (0-${maxSlots - 1})`, maxSlots, tier });
    return;
  }
  try {
    await db.transaction(async (tx) => {
      await captureLegacyRecoverySnapshots(tx, `manual-save-delete:${randomUUID()}`, [req.user.id]);
      await tx
        .delete(salarymanSavesTable)
        .where(
          and(
            eq(salarymanSavesTable.userId, req.user.id),
            eq(salarymanSavesTable.slotIndex, slot)
          )
        );
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[saves] delete error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Dog companion: global name uniqueness check ──────────────────────────────
// Dog names are globally unique across all players (mirrors the player-name 409
// pattern in routes/profiles.ts). The name lives inside each save's `data` JSON
// blob at data.dogCompanion.name; an inactive dog has no such key, so only live
// companions reserve a name. Case-insensitive, excludes the caller's own saves.
router.get("/salaryman/dog-name-available", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required", available: false });
    return;
  }
  const raw = typeof req.query.name === "string" ? req.query.name : "";
  const name = raw.trim().toUpperCase().slice(0, 16);
  if (!name) {
    res.status(400).json({ error: "name required", available: false });
    return;
  }
  try {
    const [taken] = await db
      .select({ userId: salarymanSavesTable.userId })
      .from(salarymanSavesTable)
      .where(
        and(
          ne(salarymanSavesTable.userId, req.user.id),
          sql`upper(trim(${salarymanSavesTable.data} -> 'dogCompanion' ->> 'name')) = ${name}`,
        ),
      )
      .limit(1);
    res.json({ available: taken === undefined, name });
  } catch (err: any) {
    console.error("[saves] dog-name check error:", err.message);
    res.status(500).json({ error: "Server error", available: false });
  }
});

// ── Cat companion: global name uniqueness check ──────────────────────────────
// Mirror of /salaryman/dog-name-available for the parallel cat companion. Cat
// names are unique among cats (separate namespace from dogs). The name lives at
// data.catCompanion.name; an inactive cat has no such key. Case-insensitive,
// excludes the caller's own saves.
router.get("/salaryman/cat-name-available", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required", available: false });
    return;
  }
  const raw = typeof req.query.name === "string" ? req.query.name : "";
  const name = raw.trim().toUpperCase().slice(0, 16);
  if (!name) {
    res.status(400).json({ error: "name required", available: false });
    return;
  }
  try {
    const [taken] = await db
      .select({ userId: salarymanSavesTable.userId })
      .from(salarymanSavesTable)
      .where(
        and(
          ne(salarymanSavesTable.userId, req.user.id),
          sql`upper(trim(${salarymanSavesTable.data} -> 'catCompanion' ->> 'name')) = ${name}`,
        ),
      )
      .limit(1);
    res.json({ available: taken === undefined, name });
  } catch (err: any) {
    console.error("[saves] cat-name check error:", err.message);
    res.status(500).json({ error: "Server error", available: false });
  }
});

// ── Photo → procedural pixel character (vision) ──────────────────────────────
// The player's avatar is a procedural paper-doll driven by an `Appearance` blob
// (stored in each save's data.appearance, the single client-side source of
// truth — see interview-helper/src/lib/character-identity.ts). This endpoint
// reads the user's uploaded profile photo, asks a vision model to map it onto
// the SAME constrained palettes the renderer understands, and returns a
// sanitized Appearance. The client applies it via the customizer and saves
// normally, so the server never owns the save blob. Palettes are mirrored from
// the client module; the client's sanitizeAppearance is the final authority.
const APP_SKIN_TONES = ['#f0d4b8','#e8c4a0','#d4a878','#c4956a','#b07848','#8a5a3a','#6a4028','#3e2616'];
const APP_HAIR_COLORS = ['#0a0a0a','#2a1808','#5a3a18','#7a3a18','#d4b070','#e8e4d8','#9a9a9a','#a83020','#c244aa','#2acccc','#56e8ff'];
const APP_OUTFIT_COLORS = ['#2e2e2e','#1e3055','#2a4a28','#7a6238','#7a3a18','#5a1a1a','#3a1a3a','#1a4a4a','#cfcabd','#38bdf8'];
const APP_HAIR_STYLES = ['short','long','mohawk','bun','bald','bowl'];
const APP_FACE_STYLES = ['plain','shades','scar','beard','visor','cyber'];
const APP_OUTFIT_STYLES = ['suit','hoodie','duster','jumpsuit','casual'];
const APP_GENDERS = ['m','f','nb'];

const APP_DEFAULT = {
  gender: 'nb',
  skinTone: '#d4a878',
  hairColor: '#0a0a0a',
  hairStyle: 'short',
  faceStyle: 'plain',
  outfitStyle: 'casual',
  outfitColor: '#2e2e2e',
};

function pickFrom(list: string[], val: unknown, fallback: string): string {
  return typeof val === 'string' && list.includes(val) ? val : fallback;
}

const APPEARANCE_VISION_PROMPT = `You are a character-creator that maps a real person's photo onto a retro pixel-art office avatar. Look at the photo and choose the CLOSEST option from each fixed list. Return ONLY a JSON object with these keys and no others:
- "gender": one of ${JSON.stringify(APP_GENDERS)} (m=masculine, f=feminine, nb=if unclear)
- "skinTone": the closest hex from ${JSON.stringify(APP_SKIN_TONES)} (lightest→darkest)
- "hairColor": the closest hex from ${JSON.stringify(APP_HAIR_COLORS)} (black, dark brown, brown, auburn, blonde, platinum, silver, red, magenta, cyan, electric blue)
- "hairStyle": one of ${JSON.stringify(APP_HAIR_STYLES)} (use "bald" if little/no visible hair)
- "faceStyle": one of ${JSON.stringify(APP_FACE_STYLES)} ("shades"=sunglasses, "beard"=facial hair, "scar"/"visor"/"cyber" only if clearly present, else "plain")
- "outfitStyle": one of ${JSON.stringify(APP_OUTFIT_STYLES)} (formal→"suit", casual→"casual", hooded→"hoodie")
- "outfitColor": the closest hex from ${JSON.stringify(APP_OUTFIT_COLORS)} to their clothing
Pick the single best match for each. Never invent values outside the lists.`;

// Derive the pixel paper-doll Appearance (skin/hair/outfit swatches) from a
// photo data URL via the vision model. Shared by the photo→character flow so
// the in-world sprite still resembles the player even though the headline is the
// painted portrait. Never throws — returns null on any failure so portrait
// generation isn't blocked by swatch mapping.
async function deriveAppearanceFromDataUrl(dataUrl: string): Promise<Record<string, string> | null> {
  try {
    const completion = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 2048,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: APPEARANCE_VISION_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Map this person to the pixel office avatar. Return only the JSON." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}"); } catch { parsed = {}; }
    return {
      gender: pickFrom(APP_GENDERS, parsed.gender, APP_DEFAULT.gender),
      skinTone: pickFrom(APP_SKIN_TONES, parsed.skinTone, APP_DEFAULT.skinTone),
      hairColor: pickFrom(APP_HAIR_COLORS, parsed.hairColor, APP_DEFAULT.hairColor),
      hairStyle: pickFrom(APP_HAIR_STYLES, parsed.hairStyle, APP_DEFAULT.hairStyle),
      faceStyle: pickFrom(APP_FACE_STYLES, parsed.faceStyle, APP_DEFAULT.faceStyle),
      outfitStyle: pickFrom(APP_OUTFIT_STYLES, parsed.outfitStyle, APP_DEFAULT.outfitStyle),
      outfitColor: pickFrom(APP_OUTFIT_COLORS, parsed.outfitColor, APP_DEFAULT.outfitColor),
    };
  } catch (err) {
    console.error("[character/portrait] swatch derive failed:", (err as Error)?.message ?? err);
    return null;
  }
}

// Painted character-portrait prompt. Image-to-image: the uploaded selfie is the
// IDENTITY reference; we restyle it into SALARYMAN's neon-noir house art so the
// generated avatar matches the rest of the game's painted (non-pixel) surfaces.
function buildPortraitPrompt(opts: { gender?: string; charClass?: string }): string {
  const cls = (opts.charClass ?? "").toLowerCase();
  const wardrobe =
    cls === "corporate" ? "a sharp dark corporate suit"
    : cls === "outlaw" ? "a worn leather duster"
    : cls === "replicant" ? "a sleek tech hoodie with subtle circuitry"
    : "smart-casual office attire";
  return [
    "Create a high-quality character portrait of the SAME person shown in the reference photo, reimagined as a citizen of SALARYMAN — a cinematic neon-noir corporate dystopia.",
    "Preserve their likeness: keep the same face shape, skin tone, hairstyle, hair color, apparent gender and any distinctive features.",
    "Head-and-shoulders, three-quarter view, looking confidently toward the viewer.",
    `They wear ${wardrobe}.`,
    "Painterly, semi-realistic AAA game splash-art style — NOT photorealistic, NOT cartoon, NOT pixel art.",
    "Dramatic teal and cyan rim lighting with warm magenta accents against a dark, moody slate background with soft bokeh city lights.",
    "Clean composition, sharp focus on the face. No text, no logos, no watermark, no border.",
  ].join(" ");
}

// POST /salaryman/character/portrait — generate a painted character portrait
// FROM an uploaded selfie (image-to-image). Body: { photo: dataUrl, gender?,
// charClass? }. Returns { portraitUrl: "/objects/...", appearance } where
// appearance is the derived pixel-swatch mapping for the in-world sprite.
// Auth-gated + budget-gated (Pablo Tax); onboarding handles a 402 gracefully.
router.post("/salaryman/character/portrait", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  if (!isNanoBananaConfigured()) {
    res.status(503).json({ error: "The character generator is offline right now. Build your look with the options below." });
    return;
  }

  try {
    const { photo, gender, charClass } = req.body as { photo?: unknown; gender?: unknown; charClass?: unknown };
    if (typeof photo !== "string" || !/^data:image\/(png|jpe?g|webp);base64,/.test(photo)) {
      res.status(400).json({ error: "Send a photo (PNG/JPEG/WebP) to generate your character." });
      return;
    }
    const commaIdx = photo.indexOf(",");
    const header = photo.slice(5, commaIdx); // e.g. "image/jpeg;base64"
    const contentType = header.split(";")[0] || "image/jpeg";
    const b64 = photo.slice(commaIdx + 1);
    const inputBuf = Buffer.from(b64, "base64");
    // Guard against oversized payloads (~8MB of raw image is plenty after the
    // client downscales). Express body limit is higher; this is the real cap.
    if (inputBuf.length < 1024 || inputBuf.length > 8 * 1024 * 1024) {
      res.status(400).json({ error: "That image is too large. Try a smaller photo." });
      return;
    }

    const userId = String(req.user.id);
    // Portrait painting runs on the player's Pablo/Mila assistant battery.
    const power = await getPowerStatus(userId, ACTIVE_SLOT, "assistant", ASSISTANT_TARGET_ID);
    if (!power.powered) {
      res.status(402).json({ error: "assistant_no_power", message: "Your assistant's battery is dead. Recharge or swap its cell at a charging station, or build your look manually below.", upgrade: "/upgrade" });
      return;
    }

    const svc = new ObjectStorageService();

    // 1) Host the selfie so the external image model can fetch it over HTTPS.
    //    This is sensitive biometric data — it's deleted in `finally` below as
    //    soon as generation finishes (success or failure).
    const selfiePath = await svc.uploadBuffer(inputBuf, contentType);

    try {
      const signedSelfieUrl = await svc.signDownloadURL(selfiePath, 900);

      // 2) In parallel: generate the painted portrait (image-to-image) AND derive
      //    the pixel-swatch appearance for the in-world sprite.
      const prompt = buildPortraitPrompt({
        gender: typeof gender === "string" ? gender : undefined,
        charClass: typeof charClass === "string" ? charClass : undefined,
      });
      const [gen, derived] = await Promise.all([
        generateImage({
          prompt,
          imageInput: [signedSelfieUrl],
          aspectRatio: "2:3",
          resolution: "1K",
          outputFormat: "jpg",
          timeoutMs: 110_000,
        }),
        deriveAppearanceFromDataUrl(photo),
      ]);

      if (gen.state !== "completed" || !gen.imageUrls[0]) {
        // Distinguish a STUDIO OUTAGE (credits depleted / upstream down) from a
        // bad-photo problem so the client can nudge to the manual builder
        // instead of blaming the user's selfie.
        if (gen.state === "failed" && isImageServiceOutage(gen.failMsg)) {
          res.status(503).json({
            error: "Pablo's portrait studio is closed for the moment — the camera's out of film. Build your look with the options below; you can repaint it later.",
            studioOutage: true,
          });
          return;
        }
        const reason = gen.state === "timeout"
          ? "Pablo's still painting — that took too long. Try again."
          : "Pablo couldn't paint that one. Try a clearer, well-lit photo.";
        res.status(502).json({ error: reason });
        return;
      }

      // 3) Re-host the result — the model's URL is temporary.
      let portraitPath: string;
      try {
        const imgRes = await fetch(gen.imageUrls[0], { signal: AbortSignal.timeout(30_000) });
        if (!imgRes.ok) throw new Error(`fetch result ${imgRes.status}`);
        const resType = imgRes.headers.get("content-type") || "image/jpeg";
        const portraitBuf = Buffer.from(await imgRes.arrayBuffer());
        portraitPath = await svc.uploadBuffer(portraitBuf, resType.startsWith("image/") ? resType : "image/jpeg");
      } catch (err) {
        console.error("[character/portrait] re-host failed:", (err as Error)?.message ?? err);
        res.status(502).json({ error: "Pablo painted you but dropped the canvas. Try again." });
        return;
      }

      // 4) Burn the generation cost from the assistant battery (fire-and-forget).
      void burnAiCharge({
        userId,
        targetType: "assistant",
        targetId: ASSISTANT_TARGET_ID,
        kind: "image",
        label: "salaryman character portrait",
        costBasisCents: 4,
        allowSeed: true,
      }).catch((e) => console.error("[battery/character-portrait]", e?.message || e));

      const appearance = derived ? { ...derived, portraitUrl: portraitPath } : { portraitUrl: portraitPath };
      res.json({ portraitUrl: portraitPath, appearance });
    } finally {
      // Always purge the sensitive source selfie once generation is done.
      void svc.deleteObject(selfiePath).catch(() => {});
    }
  } catch (err: any) {
    console.error("[character/portrait] error:", err?.message ?? err);
    // A thrown apipass 402/429/5xx (no credit / upstream down) is a STUDIO
    // OUTAGE, not the user's photo — surface a calm message + nudge to manual.
    if (isImageServiceOutage(err)) {
      res.status(503).json({
        error: "Pablo's portrait studio is closed for the moment — the camera's out of film. Build your look with the options below; you can repaint it later.",
        studioOutage: true,
      });
      return;
    }
    res.status(500).json({ error: "Couldn't generate your character right now. Try again." });
  }
});

// POST /salaryman/appearance/from-photo — derive an Appearance from the user's
// profile photo. Returns { appearance } for the client to apply + save.
router.post("/salaryman/appearance/from-photo", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const [u] = await db
      .select({ profileImageUrl: usersTable.profileImageUrl })
      .from(usersTable)
      .where(eq(usersTable.id, req.user.id))
      .limit(1);
    const photo = u?.profileImageUrl;
    if (!photo || !photo.startsWith("/objects/")) {
      res.status(400).json({ error: "Upload a profile photo first to generate your character." });
      return;
    }

    let dataUrl: string;
    try {
      const svc = new ObjectStorageService();
      const file = await svc.getObjectEntityFile(photo);
      // Defensive ownership guard. Avatar uploads in this project don't set an
      // ACL policy (object serving is path-protected, not ACL-gated), so the
      // default is allow-when-no-policy to match existing behavior. We only
      // refuse to process an object that carries an explicit policy owned by a
      // DIFFERENT user — never block the user's own (policy-less) avatar.
      const aclPolicy = await getObjectAclPolicy(file);
      if (aclPolicy && aclPolicy.visibility !== "public" && aclPolicy.owner && aclPolicy.owner !== req.user.id) {
        res.status(403).json({ error: "That photo isn't yours to use." });
        return;
      }
      const [buf] = await file.download();
      const [meta] = await file.getMetadata();
      const contentType = (meta.contentType as string) || "image/jpeg";
      dataUrl = `data:${contentType};base64,${buf.toString("base64")}`;
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Profile photo not found — re-upload it and try again." });
        return;
      }
      throw err;
    }

    const completion = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 2048,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: APPEARANCE_VISION_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Map this person to the pixel office avatar. Return only the JSON." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    } catch {
      parsed = {};
    }

    const appearance = {
      gender: pickFrom(APP_GENDERS, parsed.gender, APP_DEFAULT.gender),
      skinTone: pickFrom(APP_SKIN_TONES, parsed.skinTone, APP_DEFAULT.skinTone),
      hairColor: pickFrom(APP_HAIR_COLORS, parsed.hairColor, APP_DEFAULT.hairColor),
      hairStyle: pickFrom(APP_HAIR_STYLES, parsed.hairStyle, APP_DEFAULT.hairStyle),
      faceStyle: pickFrom(APP_FACE_STYLES, parsed.faceStyle, APP_DEFAULT.faceStyle),
      outfitStyle: pickFrom(APP_OUTFIT_STYLES, parsed.outfitStyle, APP_DEFAULT.outfitStyle),
      outfitColor: pickFrom(APP_OUTFIT_COLORS, parsed.outfitColor, APP_DEFAULT.outfitColor),
    };

    res.json({ appearance });
  } catch (err: any) {
    console.error("[appearance/from-photo] error:", err?.message ?? err);
    res.status(500).json({ error: "Couldn't generate your character right now. Try again." });
  }
});

// GET /salaryman/character/templates — the ready-made REALISTIC character
// gallery for the intake identity step. Returns the catalog metadata plus a
// best-effort current art status/url per template (read-only; the client's
// useArtAsset(artKey) drives the actual lazy baking + live polling + the
// graceful pixel fallback). Public + degrades to imageUrl:null so the gallery
// renders (and onboarding proceeds) even before any art has baked or when the
// render backend is unconfigured.
router.get("/salaryman/character/templates", async (_req, res) => {
  let rowByKey = new Map<string, { url: string | null; status: string }>();
  try {
    const keys = CHARACTER_TEMPLATE_CATALOG.map((t) => t.id);
    const rows = keys.length
      ? await db
          .select({ key: artAssetsTable.key, url: artAssetsTable.url, status: artAssetsTable.status })
          .from(artAssetsTable)
          .where(inArray(artAssetsTable.key, keys))
      : [];
    rowByKey = new Map(rows.map((r) => [r.key, { url: r.url, status: r.status }]));
  } catch (err: any) {
    // Best-effort: a read failure must not block the gallery — fall through with
    // an empty map so every template returns imageUrl:null / status:"none".
    console.error("[character/templates] art read failed:", err?.message ?? err);
  }

  const templates = CHARACTER_TEMPLATE_CATALOG.map((t) => {
    const row = rowByKey.get(t.id);
    const ready = row?.status === "ready" && !!row.url;
    return {
      id: t.id,
      artKey: t.id,
      label: t.label,
      archetype: t.archetype,
      faction: t.faction,
      imageUrl: ready ? row!.url : null,
      status: row?.status ?? "none",
      appearance: t.look,
    };
  });

  res.json({ templates });
});

export default router;
