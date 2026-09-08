import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import {
  db,
  usersTable,
  organizationsTable,
  orgMembersTable,
  bansTable,
  userFeaturesTable,
  featureTrialsTable,
  salarymanSavesTable,
  systemConfigTable,
  broadcastMessagesTable,
  notificationsTable,
  adminAuditLogTable,
  feedbackReportsTable,
  blockedEmailDomainsTable,
  flaggedUsersTable,
  loginAttemptsTable,
  phoneNumbersTable,
  worldBusinessesTable,
  cityBuildingsTable,
  bankAccountsTable,
  businessTransactionsTable,
  salarymanSeasonsTable,
  usageMetersTable,
  USAGE_KINDS,
  USAGE_LIMITS,
  type UsageKind,
  ORG_ROLE_HIERARCHY,
  type OrgRole,
} from "@workspace/db";
import { eq, and, desc, sql, ilike, or, count, gte, gt, inArray } from "drizzle-orm";
import twilio from "twilio";
import { isOwnerEmail, isPicassoOrgMemberEmail, isPicassoOrgOwner } from "../lib/plan";
import { invalidateBlockedDomainsCache, screenEmail, getBuiltinBlockedDomainCount } from "../lib/email-security";
import { captureLegacyRecoverySnapshots } from "../lib/legacy-recovery";
import { SERVER_CITY_ID, SERVER_REGION, MAX_PLAYERS, getOnlinePlayers } from "../worldServer";

// Estimated USD unit cost of each metered, money-costing action. These are
// deliberate estimates (Twilio voice/SMS + LLM/TTS spend) surfaced to Picasso
// executives so each user's draw on real infra cost is visible. Tune as the
// provider bills change — this is the single place that maps usage → dollars.
const COST_RATES_USD: Record<UsageKind, number> = {
  voice_minutes: 0.05,
  ai_messages: 0.01,
  sms_count: 0.01,
};

function usagePeriod(override?: string): string {
  if (override && /^\d{4}-\d{2}$/.test(override)) return override;
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getTwilioClientForAdmin() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured");
  }
  return twilio(accountSid, authToken);
}

function getAppHostForAdmin(req?: Request): string {
  if (process.env.APP_DOMAIN) return process.env.APP_DOMAIN;
  if (process.env.REPLIT_DEPLOYMENT_URL) return process.env.REPLIT_DEPLOYMENT_URL.replace(/^https?:\/\//, "");
  if (process.env.REPLIT_DOMAINS) return process.env.REPLIT_DOMAINS.split(",")[0].trim();
  if (process.env.REPLIT_DEV_DOMAIN) return process.env.REPLIT_DEV_DOMAIN;
  const rawHost = req?.headers?.host as string | undefined;
  return rawHost ? rawHost.split(",")[0].trim() : "";
}

function toE164Loose(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^\+\d{8,15}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

const router = Router();

function requireAuth(req: Request, res: Response): req is Request & { user: Express.User } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

async function requirePicassoAdmin(req: Request, res: Response): Promise<boolean> {
  if (!requireAuth(req, res)) return false;
  const user = req.user!;
  // Allow the hardcoded email allow-list (owners + testers) OR any active
  // owner-role member of the Picasso developer org.
  if (isOwnerEmail(user.email ?? undefined)) return true;
  if (await isPicassoOrgOwner(user.id)) return true;
  res.status(403).json({ error: "Picasso admin access required" });
  return false;
}

// Stricter than `requirePicassoAdmin`: gates on Picasso-org owner membership
// (hardcoded staff emails OR active org owner), excluding the broader tester
// allowlist baked into `isOwnerEmail`. Use for capabilities that touch the
// platform Twilio inventory (assigning numbers, rewriting webhook URLs) where
// testers should not have write access.
async function requirePicassoStaff(req: Request, res: Response): Promise<boolean> {
  if (!requireAuth(req, res)) return false;
  const user = req.user!;
  if (isPicassoOrgMemberEmail(user.email ?? undefined)) return true;
  if (await isPicassoOrgOwner(user.id)) return true;
  res.status(403).json({ error: "Picasso staff access required" });
  return false;
}

async function logAudit(adminId: string, action: string, targetType: string, targetId?: string, details?: string) {
  try {
    await db.insert(adminAuditLogTable).values({ adminId, action, targetType, targetId, details });
  } catch {}
}

// ── Executive cost & realm monitoring (Picasso executives only) ───────────────

// Per-user breakdown of metered, money-costing usage for a billing period,
// priced into USD estimates so executives can see what each user draws on real
// infra cost. Defaults to the current UTC month; ?period=YYYY-MM to backfill.
router.get("/admin/costs", async (req: Request, res: Response) => {
  // Executives-only: requirePicassoStaff gates on Picasso-org membership and
  // excludes the broader tester allowlist baked into isOwnerEmail.
  if (!(await requirePicassoStaff(req, res))) return;
  const period = usagePeriod(req.query.period as string | undefined);

  const rows = await db
    .select({
      userId: usageMetersTable.userId,
      kind: usageMetersTable.kind,
      count: usageMetersTable.count,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
    })
    .from(usageMetersTable)
    .leftJoin(usersTable, eq(usersTable.id, usageMetersTable.userId))
    .where(eq(usageMetersTable.periodYearMonth, period));

  type UserRow = {
    userId: string;
    email: string | null;
    name: string | null;
    usage: Record<string, number>;
    costUsd: number;
  };
  const byUser = new Map<string, UserRow>();
  const totalsByKind: Record<string, { count: number; costUsd: number }> = {};
  for (const k of USAGE_KINDS) totalsByKind[k] = { count: 0, costUsd: 0 };
  let grandTotalUsd = 0;

  for (const r of rows) {
    const kind = r.kind as UsageKind;
    const rate = COST_RATES_USD[kind] ?? 0;
    const lineCost = (r.count ?? 0) * rate;
    let u = byUser.get(r.userId);
    if (!u) {
      const name = [r.firstName, r.lastName].filter(Boolean).join(" ").trim();
      u = { userId: r.userId, email: r.email ?? null, name: name || null, usage: {}, costUsd: 0 };
      byUser.set(r.userId, u);
    }
    u.usage[kind] = (u.usage[kind] ?? 0) + (r.count ?? 0);
    u.costUsd += lineCost;
    if (totalsByKind[kind]) {
      totalsByKind[kind].count += r.count ?? 0;
      totalsByKind[kind].costUsd += lineCost;
    }
    grandTotalUsd += lineCost;
  }

  const users = Array.from(byUser.values())
    .map(u => ({ ...u, costUsd: Math.round(u.costUsd * 100) / 100 }))
    .sort((a, b) => b.costUsd - a.costUsd);

  return res.json({
    period,
    rates: COST_RATES_USD,
    limits: USAGE_LIMITS,
    kinds: USAGE_KINDS,
    users,
    totalsByKind,
    grandTotalUsd: Math.round(grandTotalUsd * 100) / 100,
    userCount: users.length,
  });
});

// Live status of the realm this deployment hosts. Each realm runs the SAME game
// on its own always-on server; executives watch population vs the per-realm cap
// across deployments (NA = Minx City, Asia = Huda City).
router.get("/admin/servers", async (req: Request, res: Response) => {
  // Executives-only (see /admin/costs note).
  if (!(await requirePicassoStaff(req, res))) return;
  let online = 0;
  try { online = getOnlinePlayers().length; } catch {}
  return res.json({
    realm: {
      cityId: SERVER_CITY_ID,
      region: SERVER_REGION,
      maxPlayers: MAX_PLAYERS,
      online,
      utilization: MAX_PLAYERS > 0 ? Math.round((online / MAX_PLAYERS) * 100) : 0,
    },
  });
});

router.get("/admin/users", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const search = (req.query.search as string) ?? "";
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
  const offset = (page - 1) * limit;

  let query = db.select().from(usersTable);
  if (search) {
    query = query.where(
      or(
        ilike(usersTable.email, `%${search}%`),
        ilike(usersTable.firstName, `%${search}%`),
        ilike(usersTable.lastName, `%${search}%`)
      )
    ) as typeof query;
  }
  const users = await query.orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(usersTable);

  return res.json({ users, total, page, limit });
});

router.get("/admin/users/:userId", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const userId = req.params.userId as string;

  const rows = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (rows.length === 0) return res.status(404).json({ error: "User not found" });

  const memberships = await db
    .select({
      orgId: orgMembersTable.orgId,
      role: orgMembersTable.role,
      status: orgMembersTable.status,
      orgName: organizationsTable.name,
    })
    .from(orgMembersTable)
    .leftJoin(organizationsTable, eq(orgMembersTable.orgId, organizationsTable.id))
    .where(eq(orgMembersTable.userId, userId));

  const bans = await db.select().from(bansTable).where(eq(bansTable.userId, userId)).orderBy(desc(bansTable.createdAt));

  const features = await db.select().from(userFeaturesTable).where(eq(userFeaturesTable.userId, userId));

  const saves = await db.select({
    id: salarymanSavesTable.id,
    charName: salarymanSavesTable.charName,
    charClass: salarymanSavesTable.charClass,
    level: salarymanSavesTable.level,
    salary: salarymanSavesTable.salary,
    lastZone: salarymanSavesTable.lastZone,
    playtime: salarymanSavesTable.playtime,
    lastSavedAt: salarymanSavesTable.lastSavedAt,
  }).from(salarymanSavesTable).where(eq(salarymanSavesTable.userId, userId));

  return res.json({ user: rows[0], memberships, bans, features, saves });
});

router.post("/admin/users/:userId/adjust-balance", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const userId = req.params.userId as string;
  const { amount, reason } = req.body;
  if (typeof amount !== 'number') return res.status(400).json({ error: "Amount required" });

  const saves = await db.select().from(salarymanSavesTable).where(eq(salarymanSavesTable.userId, userId));
  if (saves.length === 0) return res.status(404).json({ error: "No save found for user" });

  const save = saves[0];
  const newSalary = save.salary + amount;
  await db.update(salarymanSavesTable).set({ salary: newSalary }).where(eq(salarymanSavesTable.id, save.id));
  await logAudit(req.user!.id, "adjust_balance", "user", userId, `${amount > 0 ? '+' : ''}${amount} FIAT. Reason: ${reason || 'No reason'}`);
  return res.json({ ok: true, newSalary });
});

router.post("/admin/users/:userId/grant-feature", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const userId = req.params.userId as string;
  const { featureKey } = req.body;
  if (!featureKey) return res.status(400).json({ error: "featureKey required" });

  const existing = await db.select().from(userFeaturesTable)
    .where(and(eq(userFeaturesTable.userId, userId), eq(userFeaturesTable.featureKey, featureKey)));
  if (existing.length > 0) return res.json({ ok: true, alreadyGranted: true });

  await db.insert(userFeaturesTable).values({ userId, featureKey, grantedBy: "admin" });
  await logAudit(req.user!.id, "grant_feature", "user", userId, `Granted: ${featureKey}`);
  return res.json({ ok: true });
});

router.post("/admin/users/:userId/revoke-feature", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const userId = req.params.userId as string;
  const { featureKey } = req.body;
  if (!featureKey) return res.status(400).json({ error: "featureKey required" });

  await db.delete(userFeaturesTable)
    .where(and(eq(userFeaturesTable.userId, userId), eq(userFeaturesTable.featureKey, featureKey)));
  await logAudit(req.user!.id, "revoke_feature", "user", userId, `Revoked: ${featureKey}`);
  return res.json({ ok: true });
});

// Grant ALL platform features to a user in one shot (the "free access" /
// comp button). Idempotent — already-granted keys are skipped.
router.post("/admin/users/:userId/grant-all-features", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const userId = req.params.userId as string;
  const ALL = ["live_listen", "screen_scan", "say_this", "phone_system", "claw_bot"] as const;
  const existing = await db.select({ k: userFeaturesTable.featureKey })
    .from(userFeaturesTable)
    .where(eq(userFeaturesTable.userId, userId));
  const have = new Set(existing.map(r => r.k));
  const toAdd = ALL.filter(k => !have.has(k));
  if (toAdd.length > 0) {
    await db.insert(userFeaturesTable).values(toAdd.map(k => ({ userId, featureKey: k, grantedBy: "admin" })));
  }
  await logAudit(req.user!.id, "grant_all_features", "user", userId, `Granted FREE ACCESS (${toAdd.length} new keys)`);
  return res.json({ ok: true, granted: toAdd, alreadyHad: ALL.filter(k => have.has(k)) });
});

router.post("/admin/users/:userId/revoke-all-features", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const userId = req.params.userId as string;
  await db.delete(userFeaturesTable).where(eq(userFeaturesTable.userId, userId));
  await logAudit(req.user!.id, "revoke_all_features", "user", userId, "Revoked all features");
  return res.json({ ok: true });
});

// Bulk-grant FREE ACCESS to every active member of an organization. Used
// from the BUSINESSES tab so an admin can comp an entire org (e.g. the
// Medicare Club) in one tap. Future members are NOT auto-granted — call
// again to true-up.
router.post("/admin/orgs/:orgId/grant-all-features", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const orgId = parseInt(req.params.orgId as string, 10);
  if (!Number.isFinite(orgId)) return res.status(400).json({ error: "Invalid orgId" });
  const ALL = ["live_listen", "screen_scan", "say_this", "phone_system", "claw_bot"] as const;

  const members = await db
    .select({ userId: orgMembersTable.userId })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.status, "active")));

  if (members.length === 0) {
    return res.json({ ok: true, members: 0, granted: 0 });
  }

  const memberIds = members.map(m => m.userId);
  const existing = await db
    .select({ userId: userFeaturesTable.userId, featureKey: userFeaturesTable.featureKey })
    .from(userFeaturesTable)
    .where(sql`${userFeaturesTable.userId} = ANY(${sql.raw(`ARRAY[${memberIds.map(id => `'${id.replace(/'/g, "''")}'`).join(",")}]`)})`);

  const have = new Set(existing.map(r => `${r.userId}::${r.featureKey}`));
  const toAdd: { userId: string; featureKey: string; grantedBy: string }[] = [];
  for (const userId of memberIds) {
    for (const k of ALL) {
      if (!have.has(`${userId}::${k}`)) {
        toAdd.push({ userId, featureKey: k, grantedBy: "admin" });
      }
    }
  }
  if (toAdd.length > 0) {
    await db.insert(userFeaturesTable).values(toAdd);
  }
  await logAudit(req.user!.id, "grant_all_features_org", "organization", String(orgId), `Comped ${members.length} members (${toAdd.length} new grants)`);
  return res.json({ ok: true, members: members.length, granted: toAdd.length });
});

router.post("/admin/users/:userId/reset", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const userId = req.params.userId as string;
  const { resetType } = req.body;

  if (resetType === 'save') {
    await db.transaction(async (tx) => {
      await captureLegacyRecoverySnapshots(tx, `user-save:${userId}:${randomUUID()}`, [userId]);
      await tx.delete(salarymanSavesTable).where(eq(salarymanSavesTable.userId, userId as string));
    });
    await logAudit(req.user!.id, "reset_save", "user", userId as string, "Deleted all Salaryman save data");
  } else if (resetType === 'features') {
    await db.delete(userFeaturesTable).where(eq(userFeaturesTable.userId, userId as string));
    await logAudit(req.user!.id, "reset_features", "user", userId as string, "Revoked all features");
  } else {
    return res.status(400).json({ error: "Invalid resetType. Use 'save' or 'features'" });
  }
  return res.json({ ok: true });
});

/**
 * BULK RESET — wipe game state for ALL non-admin users so everyone starts
 * the onboarding/intro fresh. Admin-only. Scoped by `target`:
 *   "saves"    — delete every Salaryman save row (default)
 *   "features" — revoke every per-user feature grant
 *   "all"      — both of the above
 * Owner accounts (OWNER_EMAILS) are preserved on every target so admins
 * don't lock themselves out of paid features mid-test.
 */
router.post("/admin/bulk-reset", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const target = String(req.body?.target ?? "saves");
  if (!["saves", "features", "all", "world"].includes(target)) {
    return res.status(400).json({ error: "target must be 'saves' | 'features' | 'all' | 'world'" });
  }

  // FULL FRESH START — wipe ALL game progress so the entire player base
  // (admins included) replays onboarding from the very start.
  // Logins (users, user_google_links), billing/subscriptions (user_tiers,
  // user_features, feature_trials, pledge_purchases, usage_meters, pablo_tax_*),
  // moderation (bans, flagged_users), the tester program, and all world
  // catalog/seed tables are intentionally preserved so nobody is locked out
  // and the world still exists to be re-onboarded into.
  // The founding Picasso org (and any developer org) is PRESERVED — owner
  // instruction: never delete Picasso. Every OTHER org is deleted, which
  // cascades to its org_members/invites/partnerships/feature_grants/door_locks/
  // chat_channels/tickets (+ticket_comments). The Picasso org keeps its members,
  // grants, and locks.
  // Every other table here keys players by a plain varchar user_id (no FK),
  // so order is unconstrained; run as one transaction for all-or-nothing.
  if (target === "world") {
    const FRESH_START_TABLES = [
      "salaryman_saves",
      "world_businesses",
      "business_transactions",
      "business_snapshots",
      "player_profiles",
      "player_inventory",
      "player_loadout",
      "player_ledger",
      "player_cosmetics",
      "player_crypto_balance",
      "crypto_purchases",
      "player_exploration",
      "user_discovered_subway_stations",
      "subway_trips",
      "salaryman_player_pass",
      "salaryman_player_missions",
      "bank_accounts",
      "bank_transactions",
      "addresses",
      "world_build_contributions",
      "world_build_plans",
      "colleagues",
      "pablo_memories",
      "pablo_commands",
      "user_memory",
    ] as const;
    const counts: Record<string, number> = {};
    await db.transaction(async (tx) => {
      await captureLegacyRecoverySnapshots(tx, `world:${randomUUID()}`);
      for (const t of FRESH_START_TABLES) {
        const r = await tx.execute(sql.raw(`DELETE FROM "${t}"`));
        counts[t] = (r as { rowCount?: number }).rowCount ?? 0;
      }
      // Delete every org EXCEPT the founding Picasso org / any developer org.
      // Cascades clean up the deleted orgs' members/grants/locks/chat/tickets.
      const orgRes = await tx.execute(sql.raw(
        `DELETE FROM "organizations" WHERE "is_developer" = false ` +
        `AND lower("name") NOT IN ('picasso','picassoo','picasso ai','picasso ai llc','picassoo.ai')`,
      ));
      counts["organizations"] = (orgRes as { rowCount?: number }).rowCount ?? 0;
      // Clear dangling profile pointers — player_profiles is wiped above, so any
      // surviving users.active_profile_id would make derivePlayerName() fail-closed.
      await tx.execute(sql.raw(`UPDATE "users" SET "active_profile_id" = NULL`));
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    await logAudit(
      req.user!.id,
      "bulk_reset",
      "system",
      "world",
      `FULL FRESH START — ${total} rows wiped across ${FRESH_START_TABLES.length} tables (all game progress + every org). Logins/billing/catalog preserved.`,
    );
    return res.json({ ok: true, target, total, counts });
  }

  // Resolve owner user IDs so we never wipe the admins doing the testing.
  const ownerEnv = (process.env.OWNER_EMAILS ?? "")
    .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  const ownerIds = new Set<string>();
  if (ownerEnv.length > 0) {
    const ownerRows = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable);
    for (const u of ownerRows) {
      if (u.email && ownerEnv.includes(u.email.toLowerCase())) ownerIds.add(u.id);
    }
  }

  let savesDeleted = 0;
  let featuresRevoked = 0;

  if (target === "saves" || target === "all") {
    const allSaves = await db.select({ id: salarymanSavesTable.id, userId: salarymanSavesTable.userId }).from(salarymanSavesTable);
    const toDelete = allSaves.filter(s => !ownerIds.has(s.userId)).map(s => s.id);
    if (toDelete.length > 0) {
      // Delete in batches — IN-list size limit safety.
      const BATCH = 500;
      await db.transaction(async (tx) => {
        const userIds = [...new Set(allSaves.filter((save) => toDelete.includes(save.id)).map((save) => save.userId))];
        await captureLegacyRecoverySnapshots(tx, `bulk-saves:${randomUUID()}`, userIds);
        for (let i = 0; i < toDelete.length; i += BATCH) {
          const slice = toDelete.slice(i, i + BATCH);
          await tx.delete(salarymanSavesTable)
            .where(sql`${salarymanSavesTable.id} = ANY(${sql.raw(`ARRAY[${slice.join(",")}]`)})`);
        }
      });
      savesDeleted = toDelete.length;
    }
  }

  if (target === "features" || target === "all") {
    const allFeatures = await db.select({ userId: userFeaturesTable.userId, featureKey: userFeaturesTable.featureKey }).from(userFeaturesTable);
    for (const f of allFeatures) {
      if (ownerIds.has(f.userId)) continue;
      await db.delete(userFeaturesTable)
        .where(and(eq(userFeaturesTable.userId, f.userId), eq(userFeaturesTable.featureKey, f.featureKey)));
      featuresRevoked++;
    }
  }

  await logAudit(
    req.user!.id,
    "bulk_reset",
    "system",
    target,
    `Saves deleted: ${savesDeleted}, features revoked: ${featuresRevoked}, owners preserved: ${ownerIds.size}`
  );
  return res.json({ ok: true, target, savesDeleted, featuresRevoked, ownersPreserved: ownerIds.size });
});

const PRODUCTION_RESET_CONFIRMATION = "RESET ALL PRODUCTION USER DATA";
const PRODUCTION_RESET_EXCLUDED_TABLES = new Set([
  "admin_audit_log",
  "business_audit_events",
  "legacy_recovery_events",
  "legacy_recovery_snapshots",
  "provider_health_transitions",
  "system_config",
  "trading_data_providers",
]);
const USER_OWNER_COLUMNS = [
  "user_id", "owner_id", "owner_user_id", "created_by", "created_by_user_id",
  "updated_by", "updated_by_user_id", "requested_by", "requester_id",
  "user_a_id", "user_b_id", "sender_id", "sender_user_id", "recipient_id",
  "banned_by", "assigned_to", "assigned_user_id", "uploaded_by",
  "uploaded_by_user_id", "purchased_by", "employee_id", "employer_id",
  "payer_id", "payee_id", "actor_user_id", "applicant_user_id",
  "reviewer_user_id", "invited_by_user_id", "submitted_by_user_id",
  "poster_user_id", "target_user_id", "accepted_by_user_id", "student_user_id",
  "checked_by_user_id", "graded_by_user_id", "host_user_id", "renter_user_id",
  "linked_user_id", "from_user_id", "to_user_id", "source_user_id",
];
const ORG_OWNER_COLUMNS = ["org_id", "organization_id"];

function isPublishedProduction(): boolean {
  return process.env.NODE_ENV === "production" && Boolean(process.env.REPLIT_DEPLOYMENT_URL);
}

function pgLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

type OwnedTable = { table_name: string; columns: string[] };

async function getOwnedTables(executor: typeof db): Promise<OwnedTable[]> {
  const candidateColumns = [...USER_OWNER_COLUMNS, ...ORG_OWNER_COLUMNS]
    .map(pgLiteral).join(",");
  const result = await executor.execute(sql.raw(`
    SELECT table_name, array_agg(column_name ORDER BY ordinal_position) AS columns
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name IN (${candidateColumns})
    GROUP BY table_name
    ORDER BY table_name
  `));
  return (result.rows as Array<{ table_name: string; columns: string[] | string }>)
    .map((row) => ({
      table_name: row.table_name,
      columns: Array.isArray(row.columns)
        ? row.columns
        : String(row.columns).replace(/[{}]/g, "").split(",").filter(Boolean),
    }))
    .filter((row) =>
      row.table_name !== "users" &&
      row.table_name !== "organizations" &&
      !PRODUCTION_RESET_EXCLUDED_TABLES.has(row.table_name)
    );
}

function ownedRowPredicate(table: OwnedTable, userIds: string[], orgIds: string[]): string {
  const userSet = userIds.length ? `(${userIds.map(pgLiteral).join(",")})` : "(NULL)";
  const orgSet = orgIds.length ? `(${orgIds.map(pgLiteral).join(",")})` : "(NULL)";
  const parts = table.columns.map((column) => {
    const quoted = `"${column.replaceAll('"', '""')}"`;
    return ORG_OWNER_COLUMNS.includes(column)
      ? `${quoted}::text IN ${orgSet}`
      : `${quoted}::text IN ${userSet}`;
  });
  return parts.length ? parts.join(" OR ") : "false";
}

router.get("/admin/production-user-reset/preview", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  if (!isPublishedProduction()) {
    return res.status(403).json({ error: "This reset is available only in the published production deployment" });
  }
  const userRows = await db.select({ id: usersTable.id }).from(usersTable);
  const orgResult = await db.execute(sql.raw(`SELECT id::text FROM "organizations"`));
  const sessionResult = await db.execute(sql.raw(`SELECT count(*)::int AS count FROM "sessions"`));
  const orgIds = orgResult.rows.map((row) => String(row.id));
  const ownedTables = await getOwnedTables(db);
  const populatedTables: Record<string, number> = {};
  for (const table of ownedTables) {
    const predicate = ownedRowPredicate(table, userRows.map((row) => row.id), orgIds);
    const countResult = await db.execute(sql.raw(
      `SELECT count(*)::int AS count FROM "${table.table_name.replaceAll('"', '""')}" WHERE ${predicate}`,
    ));
    const count = Number(countResult.rows[0]?.count ?? 0);
    if (count > 0) populatedTables[table.table_name] = count;
  }
  return res.json({
    production: true,
    confirmation: PRODUCTION_RESET_CONFIRMATION,
    users: userRows.length,
    organizations: orgIds.length,
    sessions: Number(sessionResult.rows[0]?.count ?? 0),
    directlyOwnedRows: Object.values(populatedTables).reduce((sum, count) => sum + count, 0),
    tables: populatedTables,
  });
});

router.post("/admin/production-user-reset", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  if (!isPublishedProduction()) {
    return res.status(403).json({ error: "This reset is available only in the published production deployment" });
  }
  if (req.body?.confirmation !== PRODUCTION_RESET_CONFIRMATION) {
    return res.status(400).json({ error: `Type exactly: ${PRODUCTION_RESET_CONFIRMATION}` });
  }

  const userRows = await db.select({ id: usersTable.id }).from(usersTable);
  const orgResult = await db.execute(sql.raw(`SELECT id::text FROM "organizations"`));
  const userIds = userRows.map((row) => row.id);
  const orgIds = orgResult.rows.map((row) => String(row.id));
  const ownedTables = await getOwnedTables(db);
  const counts: Record<string, number> = {};

  await db.transaction(async (tx) => {
    // Delete direct ownership rows repeatedly. Each statement runs in a
    // subtransaction so FK-dependent parents can be retried after children.
    for (let pass = 0; pass < 4; pass++) {
      for (const table of ownedTables) {
        const predicate = ownedRowPredicate(table, userIds, orgIds);
        const tableName = `"${table.table_name.replaceAll('"', '""')}"`;
        const result = await tx.execute(sql.raw(`
          DO $reset$
          BEGIN
            DELETE FROM ${tableName} WHERE ${predicate};
          EXCEPTION WHEN foreign_key_violation THEN
            NULL;
          END
          $reset$;
        `));
        counts[table.table_name] = (result as { rowCount?: number }).rowCount ?? counts[table.table_name] ?? 0;
      }
    }
    await tx.execute(sql.raw(`DELETE FROM "sessions"`));
    await tx.execute(sql.raw(`DELETE FROM "bans"`));
    await tx.execute(sql.raw(`DELETE FROM "organizations"`));
    await tx.execute(sql.raw(`DELETE FROM "users"`));
  });

  return res.json({
    ok: true,
    production: true,
    usersDeleted: userIds.length,
    organizationsDeleted: orgIds.length,
    message: "All production accounts and directly owned application data were reset. Shared catalogs, system configuration, and audit infrastructure were preserved.",
  });
});

/**
 * EMAIL FEATURE GRANTS — pre-grant paid features by email so when the user
 * eventually signs up they have everything from first login. Implemented
 * via the existing `feature_trials` table with a 100-year expiration.
 * Listed grouped by email so admins can toggle individual features off.
 */
const ALL_FEATURE_KEYS = ["live_listen", "screen_scan", "say_this", "phone_system", "claw_bot"] as const;

router.get("/admin/email-grants", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const now = new Date();
  const rows = await db
    .select({
      id: featureTrialsTable.id,
      email: featureTrialsTable.email,
      featureKey: featureTrialsTable.featureKey,
      source: featureTrialsTable.source,
      expiresAt: featureTrialsTable.trialExpiresAt,
      createdAt: featureTrialsTable.createdAt,
    })
    .from(featureTrialsTable)
    .where(gt(featureTrialsTable.trialExpiresAt, now))
    .orderBy(desc(featureTrialsTable.createdAt));

  // Group by email
  const grouped: Record<string, { email: string; grants: typeof rows }> = {};
  for (const r of rows) {
    const key = r.email.toLowerCase();
    if (!grouped[key]) grouped[key] = { email: r.email, grants: [] };
    grouped[key].grants.push(r);
  }
  return res.json({ grants: Object.values(grouped), allFeatures: ALL_FEATURE_KEYS });
});

router.post("/admin/email-grants", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const featureKey = String(req.body?.featureKey ?? "").trim();
  if (!email || !email.includes("@")) return res.status(400).json({ error: "Valid email required" });
  if (!ALL_FEATURE_KEYS.includes(featureKey as any)) return res.status(400).json({ error: "Unknown featureKey" });

  // Skip if an active grant already exists.
  const existing = await db
    .select({ id: featureTrialsTable.id })
    .from(featureTrialsTable)
    .where(and(
      eq(featureTrialsTable.email, email),
      eq(featureTrialsTable.featureKey, featureKey),
      gt(featureTrialsTable.trialExpiresAt, new Date()),
    ));
  if (existing.length > 0) return res.json({ ok: true, alreadyGranted: true });

  const now = new Date();
  const expires = new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000);
  await db.insert(featureTrialsTable).values({
    email,
    featureKey,
    trialStartedAt: now,
    trialExpiresAt: expires,
    trialDays: 36500,
    source: `admin_grant_by_${req.user!.email ?? req.user!.id}`,
  });
  await logAudit(req.user!.id, "email_grant_add", "email", email, `Feature: ${featureKey}`);
  return res.json({ ok: true });
});

router.delete("/admin/email-grants/:id", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const [row] = await db.delete(featureTrialsTable).where(eq(featureTrialsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  await logAudit(req.user!.id, "email_grant_revoke", "email", row.email, `Feature: ${row.featureKey}`);
  return res.json({ ok: true });
});

router.get("/admin/orgs", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const search = (req.query.search as string) ?? "";
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
  const offset = (page - 1) * limit;

  const orgsRaw = search
    ? await db.select().from(organizationsTable).where(ilike(organizationsTable.name, `%${search}%`)).orderBy(desc(organizationsTable.createdAt)).limit(limit).offset(offset)
    : await db.select().from(organizationsTable).orderBy(desc(organizationsTable.createdAt)).limit(limit).offset(offset);

  const orgIds = orgsRaw.map(o => o.id);
  const memberCounts = orgIds.length > 0
    ? await db
        .select({ orgId: orgMembersTable.orgId, cnt: count() })
        .from(orgMembersTable)
        .where(and(eq(orgMembersTable.status, "active"), sql`${orgMembersTable.orgId} = ANY(${sql.raw(`ARRAY[${orgIds.join(",")}]`)})`))
        .groupBy(orgMembersTable.orgId)
    : [];

  const countMap = new Map(memberCounts.map(r => [r.orgId, Number(r.cnt)]));
  const orgs = orgsRaw.map(o => ({ ...o, memberCount: countMap.get(o.id) ?? 0 }));

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(organizationsTable);

  return res.json({ orgs, total, page, limit });
});

router.get("/admin/bans", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const activeOnly = req.query.active !== "false";

  let conditions = activeOnly ? eq(bansTable.active, true) : undefined;

  const bans = await db
    .select({
      id: bansTable.id,
      userId: bansTable.userId,
      reason: bansTable.reason,
      bannedBy: bansTable.bannedBy,
      type: bansTable.type,
      expiresAt: bansTable.expiresAt,
      active: bansTable.active,
      createdAt: bansTable.createdAt,
      userEmail: usersTable.email,
      userFirstName: usersTable.firstName,
      userLastName: usersTable.lastName,
    })
    .from(bansTable)
    .leftJoin(usersTable, eq(bansTable.userId, usersTable.id))
    .where(conditions)
    .orderBy(desc(bansTable.createdAt))
    .limit(100);

  return res.json({ bans });
});

router.post("/admin/bans", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const { userId, reason, type, expiresAt } = req.body;

  if (!userId || !reason) return res.status(400).json({ error: "userId and reason are required" });

  const userRows = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (userRows.length === 0) return res.status(404).json({ error: "User not found" });
  if (isOwnerEmail(userRows[0].email ?? undefined)) return res.status(403).json({ error: "Cannot ban platform owner" });

  const [ban] = await db.insert(bansTable).values({
    userId,
    reason,
    bannedBy: req.user!.id,
    type: type === "permanent" ? "permanent" : "temporary",
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  }).returning();

  await logAudit(req.user!.id, "ban_user", "user", userId, `${type}: ${reason}`);
  return res.json({ ban });
});

router.patch("/admin/bans/:banId", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const banId = parseInt(req.params.banId as string);
  const { active } = req.body;

  if (isNaN(banId)) return res.status(400).json({ error: "Invalid ban ID" });

  const [updated] = await db
    .update(bansTable)
    .set({ active: !!active })
    .where(eq(bansTable.id, banId))
    .returning();

  if (!updated) return res.status(404).json({ error: "Ban not found" });
  await logAudit(req.user!.id, active ? "reinstate_ban" : "lift_ban", "ban", String(banId));
  return res.json({ ban: updated });
});

router.get("/admin/stats", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;

  const [userCount] = await db.select({ value: count() }).from(usersTable);
  const [orgCount] = await db.select({ value: count() }).from(organizationsTable);
  const [activeBans] = await db.select({ value: count() }).from(bansTable).where(eq(bansTable.active, true));

  return res.json({
    totalUsers: userCount.value,
    totalOrgs: orgCount.value,
    activeBans: activeBans.value,
  });
});

router.get("/admin/analytics", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;

  const [totalUsers] = await db.select({ value: count() }).from(usersTable);
  const [totalOrgs] = await db.select({ value: count() }).from(organizationsTable);
  const [activeBans] = await db.select({ value: count() }).from(bansTable).where(eq(bansTable.active, true));
  const [totalSaves] = await db.select({ value: count() }).from(salarymanSavesTable);
  const [totalReports] = await db.select({ value: count() }).from(feedbackReportsTable);
  const [openReports] = await db.select({ value: count() }).from(feedbackReportsTable).where(eq(feedbackReportsTable.status, "open"));
  const [totalBroadcasts] = await db.select({ value: count() }).from(broadcastMessagesTable);

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86400000);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const monthAgo = new Date(now.getTime() - 30 * 86400000);

  const [usersToday] = await db.select({ value: count() }).from(usersTable).where(gte(usersTable.createdAt, dayAgo));
  const [usersWeek] = await db.select({ value: count() }).from(usersTable).where(gte(usersTable.createdAt, weekAgo));
  const [usersMonth] = await db.select({ value: count() }).from(usersTable).where(gte(usersTable.createdAt, monthAgo));

  const [orgsWeek] = await db.select({ value: count() }).from(organizationsTable).where(gte(organizationsTable.createdAt, weekAgo));

  const featureCounts = await db
    .select({ featureKey: userFeaturesTable.featureKey, cnt: count() })
    .from(userFeaturesTable)
    .groupBy(userFeaturesTable.featureKey);

  const topLevels = await db.select({
    charName: salarymanSavesTable.charName,
    level: salarymanSavesTable.level,
    salary: salarymanSavesTable.salary,
    userId: salarymanSavesTable.userId,
  }).from(salarymanSavesTable).orderBy(desc(salarymanSavesTable.level)).limit(10);

  return res.json({
    totalUsers: totalUsers.value,
    totalOrgs: totalOrgs.value,
    activeBans: activeBans.value,
    totalSaves: totalSaves.value,
    totalReports: totalReports.value,
    openReports: openReports.value,
    totalBroadcasts: totalBroadcasts.value,
    usersToday: usersToday.value,
    usersWeek: usersWeek.value,
    usersMonth: usersMonth.value,
    orgsWeek: orgsWeek.value,
    featureCounts: featureCounts.map(f => ({ key: f.featureKey, count: Number(f.cnt) })),
    topPlayers: topLevels,
  });
});

// Live game-world telemetry for Picasso admins — a real-time pulse of what's
// happening across SALARYMAN: player presence, economy, businesses, buildings,
// busiest zones, recent activity. Read-only aggregation over existing tables.
router.get("/admin/game-telemetry", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;

  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 86400000);

  const [onlineNow] = await db.select({ value: count() }).from(usersTable).where(gte(usersTable.lastActiveAt, fiveMinAgo));
  const [active24h] = await db.select({ value: count() }).from(usersTable).where(gte(usersTable.lastActiveAt, dayAgo));
  const [totalPlayers] = await db.select({ value: count() }).from(salarymanSavesTable);

  const bizByTypeRows = await db
    .select({ type: worldBusinessesTable.businessType, cnt: count() })
    .from(worldBusinessesTable)
    .groupBy(worldBusinessesTable.businessType);
  const [verifiedBiz] = await db.select({ value: count() }).from(worldBusinessesTable).where(eq(worldBusinessesTable.incomeVerified, true));

  const [totalBuildings] = await db.select({ value: count() }).from(cityBuildingsTable);
  const [occupiedBuildings] = await db.select({ value: count() }).from(cityBuildingsTable)
    .where(and(sql`${cityBuildingsTable.tenantName} is not null`, eq(cityBuildingsTable.demolished, false)));
  const [demolishedBuildings] = await db.select({ value: count() }).from(cityBuildingsTable).where(eq(cityBuildingsTable.demolished, true));

  const economyRows = await db
    .select({ currency: bankAccountsTable.currency, total: sql<string>`coalesce(sum(${bankAccountsTable.balance}),0)::bigint` })
    .from(bankAccountsTable)
    .groupBy(bankAccountsTable.currency);

  const topZoneRows = await db
    .select({ zone: salarymanSavesTable.lastZone, cnt: count() })
    .from(salarymanSavesTable)
    .groupBy(salarymanSavesTable.lastZone)
    .orderBy(sql`count(*) desc`)
    .limit(6);

  const recentlyActive = await db
    .select({ charName: salarymanSavesTable.charName, lastZone: salarymanSavesTable.lastZone, level: salarymanSavesTable.level, lastSavedAt: salarymanSavesTable.lastSavedAt })
    .from(salarymanSavesTable)
    .orderBy(desc(salarymanSavesTable.lastSavedAt))
    .limit(10);

  const recentTransactions = await db
    .select({ playerName: businessTransactionsTable.playerName, companyName: businessTransactionsTable.companyName, category: businessTransactionsTable.category, description: businessTransactionsTable.description, amount: businessTransactionsTable.amount, createdAt: businessTransactionsTable.createdAt })
    .from(businessTransactionsTable)
    .orderBy(desc(businessTransactionsTable.createdAt))
    .limit(12);

  const [activeSeason] = await db
    .select({ name: salarymanSeasonsTable.name, number: salarymanSeasonsTable.number, endsAt: salarymanSeasonsTable.endsAt })
    .from(salarymanSeasonsTable)
    .where(eq(salarymanSeasonsTable.isActive, true))
    .limit(1);

  return res.json({
    playersOnlineNow: onlineNow.value,
    playersActive24h: active24h.value,
    totalPlayers: totalPlayers.value,
    businessesByType: bizByTypeRows.map(r => ({ type: r.type, count: Number(r.cnt) })),
    verifiedBusinesses: verifiedBiz.value,
    buildings: { total: totalBuildings.value, occupied: occupiedBuildings.value, demolished: demolishedBuildings.value },
    economy: economyRows.map(r => ({ currency: r.currency, total: Number(r.total) })),
    activeSeason: activeSeason ?? null,
    topZones: topZoneRows.map(r => ({ zone: r.zone ?? "UNKNOWN", count: Number(r.cnt) })),
    recentlyActive,
    recentTransactions,
    generatedAt: now.toISOString(),
  });
});

router.get("/admin/system-config", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const rows = await db.select().from(systemConfigTable).orderBy(systemConfigTable.category, systemConfigTable.key);
  return res.json({ config: rows });
});

router.put("/admin/system-config", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const { key, value, category, description } = req.body;
  if (!key) return res.status(400).json({ error: "key required" });

  const existing = await db.select().from(systemConfigTable).where(eq(systemConfigTable.key, key));
  if (existing.length > 0) {
    await db.update(systemConfigTable).set({
      value: String(value ?? ""),
      ...(category && { category }),
      ...(description !== undefined && { description }),
      updatedBy: req.user!.email ?? req.user!.id,
      updatedAt: new Date(),
    }).where(eq(systemConfigTable.key, key));
  } else {
    await db.insert(systemConfigTable).values({
      key,
      value: String(value ?? ""),
      category: category || "general",
      description: description || "",
      updatedBy: req.user!.email ?? req.user!.id,
    });
  }
  await logAudit(req.user!.id, "update_config", "config", key, `Set to: ${value}`);
  return res.json({ ok: true });
});

router.delete("/admin/system-config/:key", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const paramKey = req.params.key as string;
  await db.delete(systemConfigTable).where(eq(systemConfigTable.key, paramKey));
  await logAudit(req.user!.id, "delete_config", "config", paramKey);
  return res.json({ ok: true });
});

router.get("/admin/broadcasts", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const rows = await db.select().from(broadcastMessagesTable).orderBy(desc(broadcastMessagesTable.createdAt)).limit(50);
  return res.json({ broadcasts: rows });
});

router.post("/admin/broadcasts", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const { title, message, type, targetAudience, expiresAt } = req.body;
  if (!title || !message) return res.status(400).json({ error: "title and message required" });

  const [row] = await db.insert(broadcastMessagesTable).values({
    title,
    message,
    type: type || "info",
    targetAudience: targetAudience || "all",
    createdBy: req.user!.email ?? req.user!.id,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  }).returning();
  await logAudit(req.user!.id, "send_broadcast", "broadcast", String(row.id), title);

  try {
    const allUsers = await db.select({ id: usersTable.id }).from(usersTable);
    const notifValues = allUsers.map(u => ({
      userId: u.id,
      type: "broadcast" as const,
      title: `${title}`,
      body: String(message).slice(0, 500),
      link: null,
      read: false,
    }));
    if (notifValues.length > 0) {
      const BATCH = 500;
      for (let i = 0; i < notifValues.length; i += BATCH) {
        await db.insert(notificationsTable).values(notifValues.slice(i, i + BATCH));
      }
    }
  } catch (err) {
    console.error("[Broadcast] Failed to create notifications:", err);
  }

  return res.json({ broadcast: row });
});

router.patch("/admin/broadcasts/:id", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const id = parseInt(req.params.id as string);
  const { active } = req.body;
  const [row] = await db.update(broadcastMessagesTable).set({ active: !!active }).where(eq(broadcastMessagesTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json({ broadcast: row });
});

router.get("/admin/broadcasts/active", async (_req: Request, res: Response) => {
  const now = new Date();
  const rows = await db.select().from(broadcastMessagesTable)
    .where(eq(broadcastMessagesTable.active, true))
    .orderBy(desc(broadcastMessagesTable.createdAt))
    .limit(5);
  const active = rows.filter(r => {
    if (r.expiresAt && new Date(r.expiresAt) <= now) return false;
    if (r.targetAudience && r.targetAudience !== 'all') return false;
    return true;
  });
  return res.json({ broadcasts: active.map(b => ({ id: b.id, title: b.title, message: b.message, type: b.type, createdAt: b.createdAt })) });
});

router.get("/admin/reports", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const status = (req.query.status as string) || "open";
  const rows = await db.select().from(feedbackReportsTable)
    .where(eq(feedbackReportsTable.status, status))
    .orderBy(desc(feedbackReportsTable.createdAt))
    .limit(100);
  return res.json({ reports: rows });
});

router.patch("/admin/reports/:id", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const id = parseInt(req.params.id as string);
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: "status required" });

  const [row] = await db.update(feedbackReportsTable).set({ status, updatedAt: new Date() })
    .where(eq(feedbackReportsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  await logAudit(req.user!.id, "update_report", "report", String(id), `Status: ${status}`);
  return res.json({ report: row });
});

router.get("/admin/audit-log", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const rows = await db.select().from(adminAuditLogTable).orderBy(desc(adminAuditLogTable.createdAt)).limit(100);
  return res.json({ logs: rows });
});

router.get("/admin/email-security/stats", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const [blockedDomainCount] = await db.select({ count: count() }).from(blockedEmailDomainsTable).where(eq(blockedEmailDomainsTable.active, true));
  const [flaggedCount] = await db.select({ count: count() }).from(flaggedUsersTable).where(eq(flaggedUsersTable.resolved, false));
  const [blockedLoginsToday] = await db.select({ count: count() }).from(loginAttemptsTable)
    .where(and(eq(loginAttemptsTable.blocked, true), gte(loginAttemptsTable.createdAt, new Date(Date.now() - 86400000))));
  const [totalLoginsToday] = await db.select({ count: count() }).from(loginAttemptsTable)
    .where(gte(loginAttemptsTable.createdAt, new Date(Date.now() - 86400000)));
  return res.json({
    builtinDomains: getBuiltinBlockedDomainCount(),
    customBlockedDomains: blockedDomainCount?.count ?? 0,
    flaggedUsers: flaggedCount?.count ?? 0,
    blockedLoginsToday: blockedLoginsToday?.count ?? 0,
    totalLoginsToday: totalLoginsToday?.count ?? 0,
  });
});

router.get("/admin/email-security/blocked-domains", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const rows = await db.select().from(blockedEmailDomainsTable).orderBy(desc(blockedEmailDomainsTable.createdAt));
  return res.json({ domains: rows });
});

router.post("/admin/email-security/blocked-domains", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const { domain, reason } = req.body;
  if (!domain || typeof domain !== "string") return res.status(400).json({ error: "domain required" });
  const normalized = domain.toLowerCase().trim();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(normalized)) {
    return res.status(400).json({ error: "Invalid domain format" });
  }

  try {
    const [row] = await db.insert(blockedEmailDomainsTable).values({
      domain: normalized,
      reason: reason || "manual",
      addedBy: req.user!.id,
    }).returning();
    invalidateBlockedDomainsCache();
    await logAudit(req.user!.id, "add_blocked_domain", "email_security", normalized, `Reason: ${reason || "manual"}`);
    return res.json({ domain: row });
  } catch (err: any) {
    if (err.code === "23505") return res.status(409).json({ error: "Domain already blocked" });
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/admin/email-security/blocked-domains/:id", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const [row] = await db.delete(blockedEmailDomainsTable).where(eq(blockedEmailDomainsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  invalidateBlockedDomainsCache();
  await logAudit(req.user!.id, "remove_blocked_domain", "email_security", row.domain);
  return res.json({ ok: true });
});

router.get("/admin/email-security/flagged-users", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const showResolved = req.query.resolved === "true";
  const rows = await db.select({
    flag: flaggedUsersTable,
    user: {
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      profileImageUrl: usersTable.profileImageUrl,
    },
  }).from(flaggedUsersTable)
    .leftJoin(usersTable, eq(flaggedUsersTable.userId, usersTable.id))
    .where(eq(flaggedUsersTable.resolved, showResolved))
    .orderBy(desc(flaggedUsersTable.createdAt))
    .limit(100);
  return res.json({ flaggedUsers: rows });
});

router.patch("/admin/email-security/flagged-users/:id", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const { resolved } = req.body;
  const [row] = await db.update(flaggedUsersTable).set({
    resolved: !!resolved,
    resolvedBy: resolved ? req.user!.id : null,
    resolvedAt: resolved ? new Date() : null,
  }).where(eq(flaggedUsersTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  await logAudit(req.user!.id, resolved ? "resolve_flag" : "unresolve_flag", "email_security", String(id));
  return res.json({ flag: row });
});

router.get("/admin/email-security/login-attempts", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const blockedOnly = req.query.blocked === "true";
  let query = db.select().from(loginAttemptsTable).orderBy(desc(loginAttemptsTable.createdAt)).limit(100).$dynamic();
  if (blockedOnly) {
    query = query.where(eq(loginAttemptsTable.blocked, true));
  }
  const rows = await query;
  return res.json({ attempts: rows });
});

router.post("/admin/email-security/screen-test", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const { email } = req.body;
  if (!email || typeof email !== "string") return res.status(400).json({ error: "email required" });
  const result = await screenEmail(email);
  return res.json({ email, result });
});

// ---------------------------------------------------------------------------
// Phone-number assignment (Picasso admin only).
// Lets staff hand a Twilio number from the platform inventory to a specific
// user. The Twilio number's voice + SMS webhooks are pointed at this app's
// existing inbound handlers (carrying the assigned userId as a query param)
// so that incoming calls/SMS land on the right user. Releasing simply
// removes the DB row — the number stays on the Twilio account but is
// unrouted to any user.
// ---------------------------------------------------------------------------

router.get("/admin/phone-numbers/inventory", async (req: Request, res: Response) => {
  if (!(await requirePicassoStaff(req, res))) return;
  try {
    const client = getTwilioClientForAdmin();
    const incoming = await client.incomingPhoneNumbers.list({ limit: 200 });

    const dbRows = await db
      .select({
        id: phoneNumbersTable.id,
        userId: phoneNumbersTable.userId,
        orgId: phoneNumbersTable.orgId,
        number: phoneNumbersTable.number,
        twilioSid: phoneNumbersTable.twilioSid,
        label: phoneNumbersTable.label,
        isActive: phoneNumbersTable.isActive,
        createdAt: phoneNumbersTable.createdAt,
      })
      .from(phoneNumbersTable);

    const userIds = Array.from(new Set(dbRows.map(r => r.userId)));
    const userRows = userIds.length
      ? await db
          .select({ id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName })
          .from(usersTable)
          .where(inArray(usersTable.id, userIds))
      : [];
    const userById = new Map(userRows.map(u => [u.id, u]));

    // Resolve org names for any phone-numbers row that has been claimed by
    // an org pool. We also surface the full org list so the picker UI can
    // assign an org without doing an extra round-trip.
    const orgIds = Array.from(new Set(dbRows.map(r => r.orgId).filter((x): x is number => typeof x === "number")));
    const orgRowsForPhones = orgIds.length
      ? await db
          .select({ id: organizationsTable.id, name: organizationsTable.name })
          .from(organizationsTable)
          .where(inArray(organizationsTable.id, orgIds))
      : [];
    const orgByIdForPhones = new Map(orgRowsForPhones.map(o => [o.id, o]));
    const allOrgs = await db
      .select({ id: organizationsTable.id, name: organizationsTable.name })
      .from(organizationsTable)
      .orderBy(organizationsTable.name);

    // Index DB rows by Twilio SID and by E.164 number for matching.
    const dbBySid = new Map(dbRows.filter(r => r.twilioSid).map(r => [r.twilioSid as string, r]));
    const dbByNumber = new Map(dbRows.map(r => [r.number, r]));

    const twilioNumbers = incoming.map(n => {
      const match = dbBySid.get(n.sid) ?? dbByNumber.get(n.phoneNumber) ?? null;
      const u = match ? userById.get(match.userId) ?? null : null;
      const org = match?.orgId ? orgByIdForPhones.get(match.orgId) ?? null : null;
      return {
        sid: n.sid,
        number: n.phoneNumber,
        friendlyName: n.friendlyName,
        voiceUrl: n.voiceUrl ?? "",
        smsUrl: n.smsUrl ?? "",
        capabilities: n.capabilities as Record<string, boolean> | null,
        assignedTo: u
          ? {
              phoneNumberId: match!.id,
              userId: u.id,
              email: u.email,
              firstName: u.firstName,
              lastName: u.lastName,
              label: match!.label,
              isActive: match!.isActive,
              assignedAt: match!.createdAt,
              orgId: match!.orgId ?? null,
              orgName: org?.name ?? null,
            }
          : null,
      };
    });

    // Surface DB rows whose number isn't visible on the Twilio account
    // (deleted upstream, or attached without owning the SID). They show up
    // as "orphaned" so admins can clean them up.
    const twilioNumberSet = new Set(incoming.map(n => n.phoneNumber));
    const orphanedAssignments = dbRows
      .filter(r => !twilioNumberSet.has(r.number))
      .map(r => {
        const u = userById.get(r.userId);
        const org = r.orgId ? orgByIdForPhones.get(r.orgId) ?? null : null;
        return {
          phoneNumberId: r.id,
          number: r.number,
          twilioSid: r.twilioSid,
          label: r.label,
          isActive: r.isActive,
          assignedAt: r.createdAt,
          user: u ? { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName } : null,
          orgId: r.orgId ?? null,
          orgName: org?.name ?? null,
        };
      });

    return res.json({ twilioNumbers, orphanedAssignments, organizations: allOrgs });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Admin Phone] inventory error:", msg);
    return res.status(500).json({ error: msg });
  }
});

router.post("/admin/phone-numbers/assign", async (req: Request, res: Response) => {
  if (!(await requirePicassoStaff(req, res))) return;
  try {
    const { userId, twilioSid, label, orgId } = req.body as {
      userId?: string;
      twilioSid?: string;
      label?: string;
      orgId?: number | null;
    };
    if (!userId || !twilioSid) {
      return res.status(400).json({ error: "userId and twilioSid required" });
    }

    const userRows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const user = userRows[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    // Validate optional org membership: if Picasso staff stamps a number into
    // an org pool, the assignee must be a member of that org so the org's
    // owner/admin can later reassign without breaking ownership invariants.
    let normalizedOrgId: number | null = null;
    if (typeof orgId === "number" && Number.isFinite(orgId)) {
      const orgRow = await db.select({ id: organizationsTable.id }).from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
      if (!orgRow[0]) return res.status(400).json({ error: "Org not found" });
      const membership = await db
        .select({ userId: orgMembersTable.userId })
        .from(orgMembersTable)
        .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
        .limit(1);
      if (!membership[0]) {
        return res.status(400).json({ error: "User is not an active member of that org" });
      }
      normalizedOrgId = orgId;
    }

    const client = getTwilioClientForAdmin();
    const number = await client.incomingPhoneNumbers(twilioSid).fetch();
    const e164 = toE164Loose(number.phoneNumber);
    if (!e164) return res.status(400).json({ error: "Twilio number is not in a recognizable format" });

    const host = getAppHostForAdmin(req);
    if (!host) {
      return res.status(503).json({ error: "Cannot resolve app host — set APP_DOMAIN or REPLIT_DEPLOYMENT_URL." });
    }
    const base = `https://${host}/api`;
    const voiceUrl = `${base}/twilio/inbound/webhook?userId=${encodeURIComponent(userId)}`;
    const statusCallback = `${base}/twilio/webhook/status`;
    const smsUrl = `${base}/twilio/webhook/sms?userId=${encodeURIComponent(userId)}`;

    // Point the Twilio number at our handlers (carrying the assigned user's
    // id as a query param so inbound webhooks know who to route to).
    await client.incomingPhoneNumbers(twilioSid).update({
      voiceUrl,
      voiceMethod: "POST",
      statusCallback,
      statusCallbackMethod: "POST",
      smsUrl,
      smsMethod: "POST",
      friendlyName: label
        ? `${label} — ${user.email ?? userId}`
        : `Salaryman: ${user.email ?? userId}`,
    });

    // Reassign-or-insert wrapped in a transaction so concurrent assigns
    // can't leave duplicate rows or stale ownership for the same number.
    // A given (userId, number) pair is one logical assignment — if the
    // user already has this number we just refresh sid/label/active.
    // If the number is currently held by a different user, that row is
    // removed first so inbound routing can't double-fire.
    const record = await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(phoneNumbersTable)
        .where(and(eq(phoneNumbersTable.userId, userId), eq(phoneNumbersTable.number, e164)))
        .limit(1);
      if (existing.length > 0) {
        const [updated] = await tx
          .update(phoneNumbersTable)
          .set({
            twilioSid,
            label: label ?? existing[0].label ?? "main",
            friendlyName: label ?? existing[0].friendlyName ?? "Assigned by admin",
            isActive: true,
            // Only overwrite orgId if the caller explicitly set one; passing
            // null leaves the existing pool membership intact.
            ...(normalizedOrgId !== null ? { orgId: normalizedOrgId } : {}),
          })
          .where(eq(phoneNumbersTable.id, existing[0].id))
          .returning();
        return updated;
      }
      await tx
        .delete(phoneNumbersTable)
        .where(eq(phoneNumbersTable.number, e164));
      const [inserted] = await tx
        .insert(phoneNumbersTable)
        .values({
          userId,
          orgId: normalizedOrgId,
          number: e164,
          friendlyName: label ?? "Assigned by admin",
          label: label ?? "main",
          twilioSid,
          routingMode: "voicemail",
          isActive: true,
        })
        .returning();
      return inserted;
    });

    await logAudit(
      String(req.user!.id),
      "phone_number.assign",
      "user",
      userId,
      JSON.stringify({ twilioSid, number: e164 }),
    );

    return res.json({ ok: true, phoneNumber: record });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Admin Phone] assign error:", msg);
    return res.status(500).json({ error: msg });
  }
});

router.delete("/admin/phone-numbers/:phoneNumberId", async (req: Request, res: Response) => {
  if (!(await requirePicassoStaff(req, res))) return;
  try {
    const id = Number(req.params.phoneNumberId);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

    const rows = await db.select().from(phoneNumbersTable).where(eq(phoneNumbersTable.id, id)).limit(1);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: "Phone number not found" });

    // Best-effort: clear webhooks so the unassigned number stops routing
    // calls anywhere. Failure here is non-fatal — the DB row is still gone.
    if (row.twilioSid) {
      try {
        const client = getTwilioClientForAdmin();
        await client.incomingPhoneNumbers(row.twilioSid).update({
          voiceUrl: "",
          smsUrl: "",
          statusCallback: "",
          friendlyName: `Salaryman (unassigned)`,
        });
      } catch (e: unknown) {
        console.warn("[Admin Phone] could not clear Twilio webhooks:", e instanceof Error ? e.message : "Unknown");
      }
    }

    await db.delete(phoneNumbersTable).where(eq(phoneNumbersTable.id, id));

    await logAudit(
      String(req.user!.id),
      "phone_number.unassign",
      "user",
      row.userId,
      JSON.stringify({ phoneNumberId: id, number: row.number }),
    );

    return res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Admin Phone] unassign error:", msg);
    return res.status(500).json({ error: msg });
  }
});

// PUT /admin/phone-numbers/:id/org — re-stamp an existing phone-numbers row
// into a different org pool (or clear it). Used by Picasso staff to seed an
// existing assignment into an org so its owner/admin can take over routing.
// Pass `{ orgId: null }` to detach a number from any org pool. The current
// assignee (userId) must remain a member of the target org so org admins
// don't immediately lose control to the prior owner.
router.put("/admin/phone-numbers/:phoneNumberId/org", async (req: Request, res: Response) => {
  if (!(await requirePicassoStaff(req, res))) return;
  try {
    const id = Number(req.params.phoneNumberId);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

    const { orgId } = req.body as { orgId?: number | null };
    const rows = await db.select().from(phoneNumbersTable).where(eq(phoneNumbersTable.id, id)).limit(1);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: "Phone number not found" });

    let normalizedOrgId: number | null = null;
    if (typeof orgId === "number" && Number.isFinite(orgId)) {
      const orgExists = await db.select({ id: organizationsTable.id }).from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
      if (!orgExists[0]) return res.status(400).json({ error: "Org not found" });
      const membership = await db
        .select({ userId: orgMembersTable.userId })
        .from(orgMembersTable)
        .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, row.userId), eq(orgMembersTable.status, "active")))
        .limit(1);
      if (!membership[0]) {
        return res.status(400).json({ error: "Current assignee is not an active member of that org" });
      }
      normalizedOrgId = orgId;
    } else if (orgId !== null) {
      return res.status(400).json({ error: "orgId must be a number or null" });
    }

    const [updated] = await db
      .update(phoneNumbersTable)
      .set({ orgId: normalizedOrgId })
      .where(eq(phoneNumbersTable.id, id))
      .returning();

    await logAudit(
      String(req.user!.id),
      "phone_number.set_org",
      "phone_number",
      String(id),
      JSON.stringify({ orgId: normalizedOrgId, number: row.number }),
    );

    return res.json({ ok: true, phoneNumber: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Admin Phone] set-org error:", msg);
    return res.status(500).json({ error: msg });
  }
});

// ── Platform connection status ────────────────────────────────────────────────
// Short server-side cache so dashboard polling and rapid re-checks don't
// hammer providers. Owner-only (requirePicassoAdmin gate).

let _connStatusCache: { data: Record<string, unknown>; expiresAt: number } | null = null;
const CONN_STATUS_CACHE_MS = 8_000;

async function runConnectionProbes(req: Request) {
  const { runAllProbes } = await import("../lib/connection-probes");
  const host = getAppHostForAdmin(req);
  const baseUrl = host ? `https://${host}` : "https://picassoo.app";
  return runAllProbes(baseUrl.replace(/\/$/, ""));
}

// Attach the continuous monitor's last-checked timestamp and the persisted
// transition history (newest first), with each row resolved back to its
// human-readable connection name from the current probe set.
async function withMonitorHistory(
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const {
    connHealthLastCheckedAt,
    getConnectionTransitionHistory,
    connectionSlug,
  } = await import("../lib/connection-health-monitor");
  const results = (data.results as { name: string }[]) || [];
  const nameBySlug = new Map(results.map((r) => [connectionSlug(r.name), r.name]));
  let history: unknown[] = [];
  try {
    const rows = await getConnectionTransitionHistory(30);
    history = rows.map((r) => ({
      name: nameBySlug.get(r.slug) ?? r.slug.replace(/^conn:/, ""),
      to: r.to,
      at: r.at,
      detail: r.detail,
    }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[admin/connections/history]", msg);
  }
  const lastCheckedAt = connHealthLastCheckedAt();
  return {
    ...data,
    monitor: {
      lastCheckedAt: lastCheckedAt > 0 ? new Date(lastCheckedAt).toISOString() : null,
      history,
    },
  };
}

router.get("/admin/connections/status", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;

  const now = Date.now();
  if (_connStatusCache && _connStatusCache.expiresAt > now) {
    return res.json(await withMonitorHistory({ ..._connStatusCache.data, cached: true }));
  }

  try {
    const probeResult = await runConnectionProbes(req);
    const data: Record<string, unknown> = { ...probeResult, cached: false };
    _connStatusCache = { data, expiresAt: now + CONN_STATUS_CACHE_MS };
    return res.json(await withMonitorHistory(data));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[admin/connections/status]", msg);
    return res.status(500).json({ error: msg });
  }
});

router.post("/admin/connections/status/refresh", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  _connStatusCache = null;
  try {
    const probeResult = await runConnectionProbes(req);
    const data: Record<string, unknown> = { ...probeResult, cached: false };
    _connStatusCache = { data, expiresAt: Date.now() + CONN_STATUS_CACHE_MS };
    return res.json(await withMonitorHistory(data));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[admin/connections/refresh]", msg);
    return res.status(500).json({ error: msg });
  }
});

// ── Verified-salary qualification portal (Picasso admin) ─────────────────────
// A manual verification path for the in-game verified-salary wage. A player who
// declared a real-world monthly salary but has no automated payroll hook can be
// approved here; approval flips world_businesses.incomeVerified=true so the
// accrual engine (lib/verified-salary.ts) starts paying monthlySalary/720 ƒ per
// real hour. Mirrors the org-owner attestation in /world/verify-business-salary
// but with platform-admin authority instead of org ownership.

// GET /api/admin/salary-qualifications — queue of real businesses with a
// declared salary that are not yet verified and not previously rejected.
router.get("/admin/salary-qualifications", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  try {
    const rows = await db
      .select({
        id: worldBusinessesTable.id,
        userId: worldBusinessesTable.userId,
        playerName: worldBusinessesTable.playerName,
        companyName: worldBusinessesTable.companyName,
        industry: worldBusinessesTable.industry,
        payrollProvider: worldBusinessesTable.payrollProvider,
        declaredMonthlyIncome: worldBusinessesTable.declaredMonthlyIncome,
        contactEmail: worldBusinessesTable.contactEmail,
        pendingOwnerVerification: worldBusinessesTable.pendingOwnerVerification,
        createdAt: worldBusinessesTable.createdAt,
      })
      .from(worldBusinessesTable)
      .where(and(
        eq(worldBusinessesTable.businessType, "real"),
        eq(worldBusinessesTable.incomeVerified, false),
        gt(worldBusinessesTable.declaredMonthlyIncome, 0),
        sql`coalesce(${worldBusinessesTable.meta}->>'qualificationStatus','') <> 'rejected'`,
      ))
      .orderBy(desc(worldBusinessesTable.createdAt));
    res.json({ qualifications: rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[admin/salary-qualifications]", msg);
    res.status(500).json({ error: msg });
  }
});

// POST /api/admin/salary-qualifications/:id/decide  { approve: boolean }
//   approve → incomeVerified=true, stamp ownerVerifiedAt/By(admin), clear pending
//   reject  → meta.qualificationStatus='rejected', clear pending (income stays unverified)
router.post("/admin/salary-qualifications/:id/decide", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  try {
    const businessId = Number(req.params.id);
    if (!Number.isFinite(businessId) || businessId <= 0) {
      res.status(400).json({ error: "Valid business id required" });
      return;
    }
    const approve = Boolean(req.body?.approve);
    const adminId = String(req.user!.id);
    const [target] = await db
      .select()
      .from(worldBusinessesTable)
      .where(and(
        eq(worldBusinessesTable.id, businessId),
        eq(worldBusinessesTable.businessType, "real"),
      ))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "No real business registration found for that id." });
      return;
    }
    if (approve) {
      // Re-check incomeVerified=false in the WHERE so a double-submit (or a
      // race with the org-owner attestation path) is an explicit no-op.
      const updated = await db
        .update(worldBusinessesTable)
        .set({
          incomeVerified: true,
          pendingOwnerVerification: false,
          ownerVerifiedAt: new Date(),
          ownerVerifiedBy: adminId,
        })
        .where(and(
          eq(worldBusinessesTable.id, target.id),
          eq(worldBusinessesTable.incomeVerified, false),
        ))
        .returning({ id: worldBusinessesTable.id });
      if (updated.length === 0) {
        res.status(409).json({ error: "Already verified." });
        return;
      }
      await logAudit(adminId, "salary_qualification_approve", "world_business", String(target.id), `monthly=${target.declaredMonthlyIncome}`);
      res.json({ ok: true, approved: true, businessId: target.id });
      return;
    }
    // Reject: stamp meta.qualificationStatus='rejected' (preserving other meta
    // keys) and clear the pending flag so it leaves the queue.
    await db
      .update(worldBusinessesTable)
      .set({
        pendingOwnerVerification: false,
        meta: sql`coalesce(${worldBusinessesTable.meta},'{}'::jsonb) || jsonb_build_object('qualificationStatus','rejected')`,
      })
      .where(eq(worldBusinessesTable.id, target.id));
    await logAudit(adminId, "salary_qualification_reject", "world_business", String(target.id));
    res.json({ ok: true, approved: false, businessId: target.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[admin/salary-qualifications/decide]", msg);
    res.status(500).json({ error: msg });
  }
});

export default router;
