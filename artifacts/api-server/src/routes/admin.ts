import { Router, type Request, type Response } from "express";
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
  ORG_ROLE_HIERARCHY,
  type OrgRole,
} from "@workspace/db";
import { eq, and, desc, sql, ilike, or, count, gte, gt } from "drizzle-orm";
import { isOwnerEmail } from "../lib/plan";
import { invalidateBlockedDomainsCache, screenEmail, getBuiltinBlockedDomainCount } from "../lib/email-security";

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
  if (!isOwnerEmail(user.email ?? undefined)) {
    res.status(403).json({ error: "Picasso admin access required" });
    return false;
  }
  return true;
}

async function logAudit(adminId: string, action: string, targetType: string, targetId?: string, details?: string) {
  try {
    await db.insert(adminAuditLogTable).values({ adminId, action, targetType, targetId, details });
  } catch {}
}

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

router.post("/admin/users/:userId/reset", async (req: Request, res: Response) => {
  if (!(await requirePicassoAdmin(req, res))) return;
  const userId = req.params.userId as string;
  const { resetType } = req.body;

  if (resetType === 'save') {
    await db.delete(salarymanSavesTable).where(eq(salarymanSavesTable.userId, userId as string));
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
  if (!["saves", "features", "all"].includes(target)) {
    return res.status(400).json({ error: "target must be 'saves' | 'features' | 'all'" });
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
      for (let i = 0; i < toDelete.length; i += BATCH) {
        const slice = toDelete.slice(i, i + BATCH);
        await db.delete(salarymanSavesTable).where(sql`${salarymanSavesTable.id} = ANY(${sql.raw(`ARRAY[${slice.join(",")}]`)})`);
      }
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

export default router;
