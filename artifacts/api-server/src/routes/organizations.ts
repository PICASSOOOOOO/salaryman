import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import {
  db,
  organizationsTable,
  orgProtectedRecordsTable,
  orgMembersTable,
  orgFeatureGrantsTable,
  orgInvitesTable,
  orgPartnershipsTable,
  orgDoorLocksTable,
  ORG_DOOR_SPACE_TYPES,
  phoneNumbersTable,
  adminAuditLogTable,
  usersTable,
  notificationsTable,
  balanceSheetTxTable,
  botsTable,
  FEATURE_KEYS,
  type FeatureKey,
  type OrgMember,
  type OrgRole,
  ORG_ROLES,
  ORG_ROLE_HIERARCHY,
  ORG_MEMBER_TYPES,
  hasRoleAccess,
  isReservedOrgName,
  normalizeOrgName,
  orgPermissionsTable,
  ORG_PERMISSION_KEYS,
  ORG_PERMISSION_META,
  DEFAULT_PERMISSION_MIN_ROLE,
  isOrgPermissionKey,
  type OrgPermissionKey,
} from "@workspace/db";
import { eq, and, or, sql, inArray, desc } from "drizzle-orm";
import twilio from "twilio";
import { grantFeature, resolveFeatureKey } from "../lib/plan";
import { getStripe } from "./stripe";
import { getOrgPermissionPolicy, canDoInOrg } from "../lib/org-permissions";
import { removeAdminDiscordRole } from "../lib/seed-picasso";
import {
  decryptProtectedRecord,
  encryptProtectedRecord,
  maskProtectedRecord,
} from "../lib/org-protected-records-crypto";
import { hashAccessCode, isHashedAccessCode, verifyAccessCode } from "../lib/access-code";

const router = Router();

const MEDICARE_CLUB_CLAIMERS = new Set([
  "pamw.innerlighthealth@gmail.com",
  "alejandroduong@gmail.com",
]);

function canClaimProtectedOrgName(name: string, email: string | null | undefined): boolean {
  if (name.toLowerCase() !== "medicare club") return true;
  return MEDICARE_CLUB_CLAIMERS.has((email ?? "").trim().toLowerCase());
}

function requireAuth(req: Request, res: Response): req is Request & { user: Express.User } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

async function getUserOrg(userId: string) {
  const members = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")));
  if (members.length === 0) return null;
  const member = members[0];
  const orgs = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, member.orgId));
  if (orgs.length === 0) return null;
  return { org: orgs[0], member };
}

async function getCallerMembership(userId: string, orgId: number): Promise<OrgMember | null> {
  const rows = await db
    .select()
    .from(orgMembersTable)
    .where(
      and(
        eq(orgMembersTable.orgId, orgId),
        eq(orgMembersTable.userId, userId),
        eq(orgMembersTable.status, "active")
      )
    );
  return rows[0] ?? null;
}

// POST /api/orgs/switch — set the user's active organization context.
// This is a SOFT switch: character saves, ƒ wallet, ledger, and player data
// remain keyed by userId and are NOT touched. We only update the user's
// current_org_id preference so the UI shows the right org chrome.
router.post("/orgs/switch", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const { orgId } = req.body ?? {};
  try {
    if (orgId !== null && orgId !== undefined) {
      const targetOrgIdNum = Number(orgId);
      if (!Number.isFinite(targetOrgIdNum)) { res.status(400).json({ error: "Invalid orgId" }); return; }
      const [membership] = await db.select({ orgId: orgMembersTable.orgId })
        .from(orgMembersTable)
        .where(and(
          eq(orgMembersTable.userId, userId),
          eq(orgMembersTable.orgId, targetOrgIdNum),
          eq(orgMembersTable.status, "active"),
        )).limit(1);
      if (!membership) { res.status(403).json({ error: "Not a member of that organization" }); return; }
      await db.update(usersTable).set({ currentOrgId: String(targetOrgIdNum), updatedAt: new Date() })
        .where(eq(usersTable.id, userId));
      res.json({ ok: true, currentOrgId: String(targetOrgIdNum) });
      return;
    }
    // Clear active org (solo mode)
    await db.update(usersTable).set({ currentOrgId: null, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
    res.json({ ok: true, currentOrgId: null });
  } catch (e) {
    console.error("[Orgs] switch failed:", e);
    res.status(500).json({ error: "Failed to switch organization" });
  }
});

router.get("/orgs/me", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;

  const allMemberships = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")));

  if (allMemberships.length === 0) {
    res.json({ org: null, member: null, allOrgs: [] });
    return;
  }

  const primaryMember = allMemberships[0];
  const [primaryOrg] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, primaryMember.orgId));

  if (!primaryOrg) {
    res.json({ org: null, member: null, allOrgs: [] });
    return;
  }

  const featureGrants = await db
    .select()
    .from(orgFeatureGrantsTable)
    .where(eq(orgFeatureGrantsTable.orgId, primaryOrg.id));

  const isManager = hasRoleAccess(primaryMember.role as OrgRole, "manager");

  let members: OrgMember[] = [];
  if (isManager) {
    members = await db
      .select()
      .from(orgMembersTable)
      .where(eq(orgMembersTable.orgId, primaryOrg.id));
  }

  const allOrgIds = allMemberships.map((m) => m.orgId);
  const allOrgs = allOrgIds.length > 0
    ? await db.select().from(organizationsTable).where(inArray(organizationsTable.id, allOrgIds))
    : [];
  const orgMap = new Map(allOrgs.map((o) => [o.id, o]));

  const allOrgsWithMembership = allMemberships.map((m) => ({
    membership: m,
    organization: orgMap.get(m.orgId) ?? null,
  }));

  res.json({
    org: primaryOrg,
    member: primaryMember,
    members,
    featureGrants,
    allOrgs: allOrgsWithMembership,
  });
});

router.get("/orgs/me/all", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;

  const memberships = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")));

  if (memberships.length === 0) {
    res.json({ memberships: [] });
    return;
  }

  const orgIds = memberships.map((m) => m.orgId);
  const orgs = await db
    .select()
    .from(organizationsTable)
    .where(inArray(organizationsTable.id, orgIds));

  const orgMap = new Map(orgs.map((o) => [o.id, o]));

  const result = memberships.map((m) => ({
    membership: m,
    organization: orgMap.get(m.orgId) ?? null,
  }));

  res.json({ memberships: result });
});

router.get("/me/job-offers", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const userEmail = (req.user.email ?? "").toLowerCase();
  const userFirstName = (req.user.firstName ?? "").toLowerCase();

  const candidateConds = [eq(orgInvitesTable.inviteUsername, userId)];
  if (userEmail) candidateConds.push(eq(orgInvitesTable.inviteEmail, userEmail));
  if (userFirstName) candidateConds.push(eq(orgInvitesTable.inviteUsername, userFirstName));

  const now = new Date();
  const rows = await db
    .select({
      invite: orgInvitesTable,
      orgName: organizationsTable.name,
      orgIndustry: organizationsTable.industry,
      inviterFirstName: usersTable.firstName,
      inviterLastName: usersTable.lastName,
      inviterEmail: usersTable.email,
    })
    .from(orgInvitesTable)
    .innerJoin(organizationsTable, eq(organizationsTable.id, orgInvitesTable.orgId))
    .leftJoin(usersTable, eq(usersTable.id, orgInvitesTable.invitedByUserId))
    .where(and(eq(orgInvitesTable.status, "pending"), or(...candidateConds)));

  const offers = rows
    .filter((r) => r.invite.expiresAt > now)
    .map((r) => ({
      id: r.invite.id,
      token: r.invite.token,
      orgId: r.invite.orgId,
      orgName: r.orgName,
      orgIndustry: r.orgIndustry,
      offeredRole: r.invite.offeredRole,
      offeredTitle: r.invite.offeredTitle,
      offeredDepartment: r.invite.offeredDepartment,
      offeredMemberType: r.invite.offeredMemberType,
      offeredSalary: r.invite.offeredSalary,
      offerMessage: r.invite.offerMessage,
      createdAt: r.invite.createdAt,
      expiresAt: r.invite.expiresAt,
      invitedBy: r.inviterFirstName || r.inviterLastName
        ? `${r.inviterFirstName ?? ""} ${r.inviterLastName ?? ""}`.trim()
        : (r.inviterEmail ?? "A manager"),
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  res.json({ offers });
});

router.post("/me/job-offers/:id/decline", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const userEmail = (req.user.email ?? "").toLowerCase();
  const userFirstName = (req.user.firstName ?? "").toLowerCase();
  const inviteId = parseInt(req.params.id);
  if (isNaN(inviteId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [invite] = await db.select().from(orgInvitesTable).where(eq(orgInvitesTable.id, inviteId)).limit(1);
  if (!invite) { res.status(404).json({ error: "Offer not found" }); return; }
  if (invite.status !== "pending") { res.status(400).json({ error: "Offer already decided" }); return; }

  const matchesEmail = invite.inviteEmail && userEmail && invite.inviteEmail.toLowerCase() === userEmail;
  const matchesUsername = invite.inviteUsername
    && (invite.inviteUsername === userId || invite.inviteUsername.toLowerCase() === userFirstName);
  if (!matchesEmail && !matchesUsername) {
    res.status(403).json({ error: "This offer was sent to a different account" });
    return;
  }

  await db.update(orgInvitesTable)
    .set({ status: "declined", decidedAt: new Date() })
    .where(eq(orgInvitesTable.id, inviteId));

  try {
    const [org] = await db.select({ name: organizationsTable.name }).from(organizationsTable).where(eq(organizationsTable.id, invite.orgId)).limit(1);
    const userName = req.user.firstName ?? req.user.email?.split("@")[0] ?? "A candidate";
    if (invite.invitedByUserId) {
      await db.insert(notificationsTable).values({
        userId: invite.invitedByUserId,
        type: "org_invite_declined",
        title: `${userName} declined your offer`,
        body: `${userName} declined the job offer for ${org?.name ?? "the organization"}.`,
        link: `/business/company`,
      });
    }
  } catch (err) {
    console.error("[Job Offer Decline] notify failed:", err);
  }

  res.json({ ok: true });
});

router.get("/orgs/me/colleagues", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;

  const memberships = await db
    .select({
      orgId: orgMembersTable.orgId,
      role: orgMembersTable.role,
    })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")));

  if (memberships.length === 0) {
    res.json({ orgs: [] });
    return;
  }

  const orgIds = memberships.map(m => m.orgId);
  const orgs = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name })
    .from(organizationsTable)
    .where(inArray(organizationsTable.id, orgIds));
  const orgNameById = new Map(orgs.map(o => [o.id, o.name]));

  const callerRoleByOrg = new Map(memberships.map(m => [m.orgId, m.role as OrgRole]));

  const allRows = await db
    .select({
      orgId: orgMembersTable.orgId,
      userId: orgMembersTable.userId,
      role: orgMembersTable.role,
      department: orgMembersTable.department,
      title: orgMembersTable.title,
      memberType: orgMembersTable.memberType,
      lastSeenAt: orgMembersTable.lastSeenAt,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      username: usersTable.username,
      profileImageUrl: usersTable.profileImageUrl,
    })
    .from(orgMembersTable)
    .leftJoin(usersTable, eq(orgMembersTable.userId, usersTable.id))
    .where(and(inArray(orgMembersTable.orgId, orgIds), eq(orgMembersTable.status, "active")));

  const PRESENCE_WINDOW_MS = 90 * 1000;
  const now = Date.now();

  const grouped = orgIds.map(orgId => {
    const callerRole = callerRoleByOrg.get(orgId) ?? ("specialist" as OrgRole);
    const callerRank = ORG_ROLE_HIERARCHY[callerRole] ?? 0;
    const isCallerManager = hasRoleAccess(callerRole, "manager");
    const inOrg = allRows.filter(r => r.orgId === orgId);
    const visible = isCallerManager
      ? inOrg
      : inOrg.filter(m => {
          if (m.userId === userId) return true;
          const rank = ORG_ROLE_HIERARCHY[m.role as OrgRole] ?? 0;
          return rank <= callerRank;
        });
    return {
      orgId,
      orgName: orgNameById.get(orgId) ?? `Org #${orgId}`,
      callerRole,
      hiddenCount: inOrg.length - visible.length,
      members: visible.map(m => ({
        userId: m.userId,
        role: m.role,
        department: m.department,
        title: m.title,
        memberType: m.memberType,
        firstName: m.firstName,
        lastName: m.lastName,
        username: m.username,
        profileImageUrl: m.profileImageUrl,
        online: !!m.lastSeenAt && (now - new Date(m.lastSeenAt).getTime() < PRESENCE_WINDOW_MS),
        lastSeenAt: m.lastSeenAt,
        isSelf: m.userId === userId,
      })),
    };
  });

  res.json({ orgs: grouped });
});

router.get("/orgs/me/financials", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;

  const memberships = await db
    .select({
      orgId: orgMembersTable.orgId,
      salary: orgMembersTable.salary,
      role: orgMembersTable.role,
      title: orgMembersTable.title,
    })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")));

  let totalSalary = 0;
  const breakdown: { orgId: number; orgName: string; salary: number }[] = [];

  if (memberships.length > 0) {
    const orgIds = memberships.map((m) => m.orgId);
    const orgs = await db
      .select({ id: organizationsTable.id, name: organizationsTable.name })
      .from(organizationsTable)
      .where(inArray(organizationsTable.id, orgIds));
    const orgMap = new Map(orgs.map((o) => [o.id, o.name]));

    for (const m of memberships) {
      const sal = m.salary ? Number(m.salary) : 0;
      totalSalary += sal;
      breakdown.push({
        orgId: m.orgId,
        orgName: orgMap.get(m.orgId) ?? "Unknown",
        salary: sal,
      });
    }
  }

  const netWorthResult = await db
    .select({
      total: sql<string>`COALESCE(SUM(CASE WHEN ${balanceSheetTxTable.type} = 'credit' THEN ${balanceSheetTxTable.amount} ELSE -${balanceSheetTxTable.amount} END), 0)`,
    })
    .from(balanceSheetTxTable)
    .where(eq(balanceSheetTxTable.userId, userId));

  const netWorth = netWorthResult[0]?.total ? Number(netWorthResult[0].total) : 0;

  res.json({
    totalSalary,
    netWorth,
    companyCount: memberships.length,
    breakdown,
  });
});

router.get("/orgs/members/:userId/profile", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const callerId = req.user.id;
  const targetUserId = req.params.userId;

  const [targetUser] = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      profileImageUrl: usersTable.profileImageUrl,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, targetUserId));

  if (!targetUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const targetMemberships = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, targetUserId), eq(orgMembersTable.status, "active")));

  const callerMemberships = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, callerId), eq(orgMembersTable.status, "active")));

  const callerOrgIds = new Set(callerMemberships.map((m) => m.orgId));
  const callerAdminOrgIds = new Set(
    callerMemberships
      .filter((m) => hasRoleAccess(m.role as OrgRole, "manager"))
      .map((m) => m.orgId)
  );

  const sharedMemberships = targetMemberships.filter((m) => callerOrgIds.has(m.orgId));

  if (sharedMemberships.length === 0 && callerId !== targetUserId) {
    res.status(403).json({ error: "You do not share an organization with this user" });
    return;
  }

  const orgIds = (callerId === targetUserId ? targetMemberships : sharedMemberships).map((m) => m.orgId);
  const orgs = orgIds.length > 0
    ? await db.select().from(organizationsTable).where(inArray(organizationsTable.id, orgIds))
    : [];
  const orgMap = new Map(orgs.map((o) => [o.id, o]));

  const membershipsToReturn = callerId === targetUserId ? targetMemberships : sharedMemberships;
  const isSelf = callerId === targetUserId;

  const affiliations = membershipsToReturn.map((m) => {
    const isAdmin = callerAdminOrgIds.has(m.orgId) || isSelf;
    return {
      orgId: m.orgId,
      orgName: orgMap.get(m.orgId)?.name ?? "Unknown",
      role: m.role,
      title: m.title,
      department: m.department,
      salary: isAdmin ? m.salary : undefined,
      joinedAt: m.joinedAt,
    };
  });

  res.json({
    user: targetUser,
    affiliations,
  });
});

router.get("/orgs/search", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const q = (req.query.q as string || "").trim();
  if (q.length < 2) { res.json({ orgs: [] }); return; }

  const orgs = await db.select({ id: organizationsTable.id, name: organizationsTable.name, industry: organizationsTable.industry })
    .from(organizationsTable)
    .where(sql`lower(${organizationsTable.name}) LIKE lower(${'%' + q + '%'})`)
    .limit(10);
  res.json({ orgs });
});

router.get("/orgs/mine", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const memberships = await db.select({
    orgId: orgMembersTable.orgId,
    role: orgMembersTable.role,
    name: organizationsTable.name,
  })
    .from(orgMembersTable)
    .innerJoin(organizationsTable, eq(orgMembersTable.orgId, organizationsTable.id))
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")));

  res.json({ orgs: memberships.map(m => ({ id: m.orgId, name: m.name, role: m.role })) });
});

router.post("/orgs", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;

  const { name, industry, size } = (req.body ?? {}) as { name?: string; industry?: string; size?: string };
  const normalizedName = typeof name === "string" ? normalizeOrgName(name) : "";
  if (normalizedName.length < 2 || normalizedName.length > 120) {
    res.status(400).json({ error: "Organization name must be 2-120 visible characters" });
    return;
  }

  if (isReservedOrgName(normalizedName)) {
    res.status(400).json({ error: "That organization name is reserved and cannot be used" });
    return;
  }
  if (!canClaimProtectedOrgName(normalizedName, req.user.email)) {
    res.status(400).json({ error: "That organization name is reserved for its verified owners" });
    return;
  }

  const [existingOrg] = await db
    .select()
    .from(organizationsTable)
    .where(sql`lower(regexp_replace(btrim(${organizationsTable.name}), '\\s+', ' ', 'g')) = lower(${normalizedName})`);
  if (existingOrg) {
    res.status(400).json({ error: "An organization with that name already exists" });
    return;
  }

  try {
    const org = await db.transaction(async (tx) => {
      const [inserted] = await tx.insert(organizationsTable).values({
          name: normalizedName.toUpperCase(),
          industry: industry ? String(industry).trim() : null,
          size: size ? String(size).trim() : null,
          ownerUserId: userId,
        }).returning();
      await tx.insert(orgMembersTable).values({
        orgId: inserted.id, userId, role: "owner", featureBilling: "individual",
        status: "active", joinedAt: new Date(),
      });
      return inserted;
    });
    res.status(201).json({ org });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr?.code === "23505") {
      res.status(409).json({ error: "An organization with that name already exists" });
      return;
    }
    throw err;
  }

});

router.get("/orgs/:orgId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const orgId = parseInt(req.params.orgId);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org ID" }); return; }

  const caller = await getCallerMembership(userId, orgId);
  if (!caller) {
    res.status(403).json({ error: "Not authorized" }); return;
  }

  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, orgId));
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  const membersRaw = await db
    .select({
      orgId: orgMembersTable.orgId,
      userId: orgMembersTable.userId,
      role: orgMembersTable.role,
      department: orgMembersTable.department,
      featureBilling: orgMembersTable.featureBilling,
      status: orgMembersTable.status,
      title: orgMembersTable.title,
      salary: orgMembersTable.salary,
      joinedAt: orgMembersTable.joinedAt,
      createdAt: orgMembersTable.createdAt,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      profileImageUrl: usersTable.profileImageUrl,
    })
    .from(orgMembersTable)
    .leftJoin(usersTable, eq(orgMembersTable.userId, usersTable.id))
    .where(eq(orgMembersTable.orgId, orgId));

  const isCallerManager = hasRoleAccess(caller.role as OrgRole, "manager");
  const members = membersRaw.map(m => ({
    ...m,
    salary: isCallerManager ? m.salary : null,
    featureBilling: isCallerManager ? m.featureBilling : null,
  }));

  const featureGrants = await db.select().from(orgFeatureGrantsTable).where(eq(orgFeatureGrantsTable.orgId, orgId));

  res.json({ org, members, featureGrants, callerRole: caller.role });
});

router.put("/orgs/:orgId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const orgId = parseInt(req.params.orgId);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org ID" }); return; }

  const caller = await getCallerMembership(userId, orgId);
  if (!caller || !hasRoleAccess(caller.role as OrgRole, "manager")) {
    res.status(403).json({ error: "Not authorized" }); return;
  }

  const {
    name,
    industry,
    size,
    description,
    website,
    businessAddress,
    contactEmail,
    contactPhone,
    legalEntityName,
    entityType,
  } = (req.body ?? {}) as Record<string, unknown>;
  const updates: Partial<typeof organizationsTable.$inferInsert> = {};

  if (name !== undefined) {
    if (caller.role !== "owner") {
      res.status(403).json({ error: "Only the organization owner may change its legal display name" });
      return;
    }
    const normalizedName = typeof name === "string" ? normalizeOrgName(name) : "";
    if (normalizedName.length < 2 || normalizedName.length > 120) {
      res.status(400).json({ error: "Organization name must be 2-120 characters" });
      return;
    }
    if (isReservedOrgName(normalizedName)) {
      res.status(400).json({ error: "That organization name is reserved and cannot be used" });
      return;
    }
    const [existingOrg] = await db
      .select()
      .from(organizationsTable)
      .where(sql`lower(regexp_replace(btrim(${organizationsTable.name}), '\\s+', ' ', 'g')) = lower(${normalizedName}) AND ${organizationsTable.id} != ${orgId}`);
    if (existingOrg) {
      res.status(400).json({ error: "An organization with that name already exists" });
      return;
    }
    updates.name = normalizedName.toUpperCase();
  }

  const optionalText = (
    field: unknown,
    maxLength: number,
    label: string,
  ): string | null | undefined => {
    if (field === undefined) return undefined;
    if (typeof field !== "string") throw new Error(`${label} must be text`);
    const value = field.trim();
    if (value.length > maxLength) throw new Error(`${label} is too long`);
    return value || null;
  };

  try {
    updates.industry = optionalText(industry, 80, "Industry");
    updates.size = optionalText(size, 40, "Company size");
    updates.description = optionalText(description, 4000, "Description");
    updates.businessAddress = optionalText(businessAddress, 1000, "Business address");
    updates.contactPhone = optionalText(contactPhone, 50, "Contact phone");
    updates.legalEntityName = optionalText(legalEntityName, 160, "Legal entity name");
    updates.entityType = optionalText(entityType, 80, "Entity type");

    const normalizedEmail = optionalText(contactEmail, 254, "Contact email");
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      res.status(400).json({ error: "Contact email is invalid" });
      return;
    }
    updates.contactEmail = normalizedEmail?.toLowerCase() ?? normalizedEmail;

    const normalizedWebsite = optionalText(website, 500, "Website");
    if (normalizedWebsite) {
      let parsed: URL;
      try { parsed = new URL(normalizedWebsite); }
      catch {
        res.status(400).json({ error: "Website must be a valid http or https URL" });
        return;
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        res.status(400).json({ error: "Website must be a valid http or https URL" });
        return;
      }
    }
    updates.website = normalizedWebsite;
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid organization details" });
    return;
  }

  for (const key of Object.keys(updates) as Array<keyof typeof updates>) {
    if (updates[key] === undefined) delete updates[key];
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  let updated: typeof organizationsTable.$inferSelect;
  try {
    const [row] = await db
      .update(organizationsTable)
      .set(updates)
      .where(eq(organizationsTable.id, orgId))
      .returning();
    updated = row;
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr?.code === "23505") {
      res.status(409).json({ error: "An organization with that name already exists" });
      return;
    }
    throw err;
  }

  res.json({ org: updated });
});

async function requireProtectedRecordsAccess(userId: string, orgId: number): Promise<boolean> {
  const caller = await getCallerMembership(userId, orgId);
  return !!caller && hasRoleAccess(caller.role as OrgRole, "manager");
}

router.get("/orgs/:orgId/protected-records", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const orgId = Number(req.params.orgId);
  if (!Number.isInteger(orgId) || orgId <= 0) { res.status(400).json({ error: "Invalid org ID" }); return; }
  if (!await requireProtectedRecordsAccess(req.user.id, orgId)) {
    res.status(403).json({ error: "Manager access required" });
    return;
  }

  const records = await db
    .select({
      id: orgProtectedRecordsTable.id,
      label: orgProtectedRecordsTable.label,
      maskedValue: orgProtectedRecordsTable.maskedValue,
      createdAt: orgProtectedRecordsTable.createdAt,
      updatedAt: orgProtectedRecordsTable.updatedAt,
    })
    .from(orgProtectedRecordsTable)
    .where(eq(orgProtectedRecordsTable.orgId, orgId))
    .orderBy(desc(orgProtectedRecordsTable.updatedAt));
  res.setHeader("Cache-Control", "no-store");
  res.json({ records });
});

router.post("/orgs/:orgId/protected-records", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const orgId = Number(req.params.orgId);
  if (!Number.isInteger(orgId) || orgId <= 0) { res.status(400).json({ error: "Invalid org ID" }); return; }
  if (!await requireProtectedRecordsAccess(req.user.id, orgId)) {
    res.status(403).json({ error: "Manager access required" });
    return;
  }

  const label = typeof req.body?.label === "string" ? req.body.label.trim() : "";
  const value = typeof req.body?.value === "string" ? req.body.value.trim() : "";
  if (!label || label.length > 120) { res.status(400).json({ error: "Label must be 1-120 characters" }); return; }
  if (!value || value.length > 4000) { res.status(400).json({ error: "Value must be 1-4000 characters" }); return; }

  const [record] = await db.insert(orgProtectedRecordsTable).values({
    orgId,
    label,
    encryptedValue: encryptProtectedRecord(value, orgId),
    maskedValue: maskProtectedRecord(value),
    createdByUserId: req.user.id,
    updatedByUserId: req.user.id,
  }).returning({
    id: orgProtectedRecordsTable.id,
    label: orgProtectedRecordsTable.label,
    maskedValue: orgProtectedRecordsTable.maskedValue,
    createdAt: orgProtectedRecordsTable.createdAt,
    updatedAt: orgProtectedRecordsTable.updatedAt,
  });
  res.status(201).json({ record });
});

router.put("/orgs/:orgId/protected-records/:recordId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const orgId = Number(req.params.orgId);
  const recordId = Number(req.params.recordId);
  if (!Number.isInteger(orgId) || !Number.isInteger(recordId)) { res.status(400).json({ error: "Invalid record ID" }); return; }
  if (!await requireProtectedRecordsAccess(req.user.id, orgId)) {
    res.status(403).json({ error: "Manager access required" });
    return;
  }

  const updates: Partial<typeof orgProtectedRecordsTable.$inferInsert> = {
    updatedByUserId: req.user.id,
    updatedAt: new Date(),
  };
  if (req.body?.label !== undefined) {
    const label = typeof req.body.label === "string" ? req.body.label.trim() : "";
    if (!label || label.length > 120) { res.status(400).json({ error: "Label must be 1-120 characters" }); return; }
    updates.label = label;
  }
  if (req.body?.value !== undefined && req.body.value !== "") {
    const value = typeof req.body.value === "string" ? req.body.value.trim() : "";
    if (!value || value.length > 4000) { res.status(400).json({ error: "Value must be 1-4000 characters" }); return; }
    updates.encryptedValue = encryptProtectedRecord(value, orgId);
    updates.maskedValue = maskProtectedRecord(value);
  }
  if (updates.label === undefined && updates.encryptedValue === undefined) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [record] = await db.update(orgProtectedRecordsTable)
    .set(updates)
    .where(and(eq(orgProtectedRecordsTable.id, recordId), eq(orgProtectedRecordsTable.orgId, orgId)))
    .returning({
      id: orgProtectedRecordsTable.id,
      label: orgProtectedRecordsTable.label,
      maskedValue: orgProtectedRecordsTable.maskedValue,
      createdAt: orgProtectedRecordsTable.createdAt,
      updatedAt: orgProtectedRecordsTable.updatedAt,
    });
  if (!record) { res.status(404).json({ error: "Protected record not found" }); return; }
  res.json({ record });
});

router.post("/orgs/:orgId/protected-records/:recordId/reveal", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const orgId = Number(req.params.orgId);
  const recordId = Number(req.params.recordId);
  if (!Number.isInteger(orgId) || !Number.isInteger(recordId)) { res.status(400).json({ error: "Invalid record ID" }); return; }
  if (!await requireProtectedRecordsAccess(req.user.id, orgId)) {
    res.status(403).json({ error: "Manager access required" });
    return;
  }

  const [record] = await db.select({
    id: orgProtectedRecordsTable.id,
    encryptedValue: orgProtectedRecordsTable.encryptedValue,
  }).from(orgProtectedRecordsTable)
    .where(and(eq(orgProtectedRecordsTable.id, recordId), eq(orgProtectedRecordsTable.orgId, orgId)))
    .limit(1);
  if (!record) { res.status(404).json({ error: "Protected record not found" }); return; }

  try {
    const value = decryptProtectedRecord(record.encryptedValue, orgId);
    res.setHeader("Cache-Control", "no-store");
    res.json({ id: record.id, value });
  } catch {
    res.status(500).json({ error: "Protected record could not be decrypted" });
  }
});

router.delete("/orgs/:orgId/protected-records/:recordId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const orgId = Number(req.params.orgId);
  const recordId = Number(req.params.recordId);
  if (!Number.isInteger(orgId) || !Number.isInteger(recordId)) { res.status(400).json({ error: "Invalid record ID" }); return; }
  if (!await requireProtectedRecordsAccess(req.user.id, orgId)) {
    res.status(403).json({ error: "Manager access required" });
    return;
  }

  const [deleted] = await db.delete(orgProtectedRecordsTable)
    .where(and(eq(orgProtectedRecordsTable.id, recordId), eq(orgProtectedRecordsTable.orgId, orgId)))
    .returning({ id: orgProtectedRecordsTable.id });
  if (!deleted) { res.status(404).json({ error: "Protected record not found" }); return; }
  res.json({ ok: true });
});

router.post("/orgs/:orgId/invite", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const orgId = parseInt(req.params.orgId);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org ID" }); return; }

  const caller = await getCallerMembership(userId, orgId);
  const inviteMinRole = (await getOrgPermissionPolicy(orgId))["members.manage"];
  if (!caller || !hasRoleAccess(caller.role as OrgRole, inviteMinRole)) {
    res.status(403).json({ error: "Not authorized" }); return;
  }

  const {
    email,
    username,
    offeredRole,
    offeredTitle,
    offeredDepartment,
    offeredMemberType,
    offeredSalary,
    offerMessage,
  } = (req.body ?? {}) as {
    email?: string;
    username?: string;
    offeredRole?: string;
    offeredTitle?: string;
    offeredDepartment?: string;
    offeredMemberType?: string;
    offeredSalary?: number | string;
    offerMessage?: string;
  };
  if (!email && !username) {
    res.status(400).json({ error: "email or username required" });
    return;
  }

  const validRoles = new Set(["specialist", "manager", "director", "executive"]);
  const validMemberTypes = new Set(["individual", "company"]);
  const cleanRole = offeredRole && validRoles.has(offeredRole) ? offeredRole : null;
  const cleanMemberType = offeredMemberType && validMemberTypes.has(offeredMemberType) ? offeredMemberType : null;
  const cleanSalary = offeredSalary !== undefined && offeredSalary !== null && offeredSalary !== ""
    ? Math.max(0, Math.floor(Number(offeredSalary))) || null
    : null;

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [invite] = await db
    .insert(orgInvitesTable)
    .values({
      orgId,
      invitedByUserId: userId,
      inviteEmail: email ? String(email).toLowerCase().trim() : null,
      inviteUsername: username ? String(username).trim() : null,
      token,
      status: "pending",
      expiresAt,
      offeredRole: cleanRole,
      offeredTitle: offeredTitle ? String(offeredTitle).slice(0, 200).trim() : null,
      offeredDepartment: offeredDepartment ? String(offeredDepartment).slice(0, 120).trim() : null,
      offeredMemberType: cleanMemberType,
      offeredSalary: cleanSalary,
      offerMessage: offerMessage ? String(offerMessage).slice(0, 2000) : null,
    })
    .returning();

  const baseUrl = process.env.APP_BASE_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`;
  const inviteUrl = `${baseUrl}/world?org_invite=${token}`;

  try {
    const [org] = await db.select({ name: organizationsTable.name }).from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
    const orgName = org?.name ?? "an organization";

    const lookupEmail = email ? String(email).toLowerCase().trim() : null;
    const lookupUsername = username ? String(username).trim() : null;
    let invitedUser: { id: string } | undefined;
    if (lookupEmail) {
      [invitedUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, lookupEmail)).limit(1);
    }
    if (!invitedUser && lookupUsername) {
      [invitedUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, lookupUsername)).limit(1);
    }

    if (invitedUser) {
      await db.insert(notificationsTable).values({
        userId: invitedUser.id,
        type: "org_invite",
        title: `You've been invited to join ${orgName}`,
        body: `A manager at ${orgName} has invited you to join their organization. Click to accept the invitation.`,
        link: `/world?org_invite=${token}`,
      });
    }
  } catch (err) {
    console.error("[Org Invite] Failed to create notification:", err);
  }

  res.json({ invite, inviteUrl });
});

router.post("/orgs/invite/accept", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const user = req.user;

  const { token } = (req.body ?? {}) as { token?: string };
  if (!token) { res.status(400).json({ error: "Token required" }); return; }

  const now = new Date();
  const invites = await db
    .select()
    .from(orgInvitesTable)
    .where(eq(orgInvitesTable.token, String(token)));

  if (invites.length === 0) { res.status(404).json({ error: "Invite not found" }); return; }
  const invite = invites[0];

  if (invite.status !== "pending") {
    res.status(400).json({ error: "Invite already used or expired" });
    return;
  }
  if (invite.expiresAt < now) {
    res.status(400).json({ error: "Invite has expired" });
    return;
  }

  if (invite.inviteEmail || invite.inviteUsername) {
    const userEmail = (user.email ?? "").toLowerCase();
    const userFirstName = (user.firstName ?? "").toLowerCase();
    const emailMatch = invite.inviteEmail
      ? userEmail === invite.inviteEmail.toLowerCase()
      : false;
    const usernameMatch = invite.inviteUsername
      ? userFirstName === invite.inviteUsername.toLowerCase() || userId === invite.inviteUsername
      : false;
    if (!emailMatch && !usernameMatch) {
      res.status(403).json({ error: "This invite was sent to a different account" });
      return;
    }
  }

  const [invitedOrg] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, invite.orgId));
  const developerSpawn = invitedOrg?.isDeveloper ? "Shadow Tower" : undefined;

  const existingMember = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, invite.orgId), eq(orgMembersTable.userId, userId)));

  const offeredOverrides = {
    ...(invite.offeredRole ? { role: invite.offeredRole } : {}),
    ...(invite.offeredTitle ? { title: invite.offeredTitle } : {}),
    ...(invite.offeredDepartment ? { department: invite.offeredDepartment } : {}),
    ...(invite.offeredMemberType ? { featureBilling: invite.offeredMemberType } : {}),
    ...(invite.offeredSalary != null ? { salary: String(invite.offeredSalary) } : {}),
  };

  if (existingMember.length > 0) {
    await db
      .update(orgMembersTable)
      .set({ status: "active", joinedAt: new Date(), ...offeredOverrides, ...(developerSpawn ? { spawnLocation: developerSpawn } : {}) })
      .where(and(eq(orgMembersTable.orgId, invite.orgId), eq(orgMembersTable.userId, userId)));
  } else {
    await db.insert(orgMembersTable).values({
      orgId: invite.orgId,
      userId,
      role: invite.offeredRole ?? "specialist",
      featureBilling: invite.offeredMemberType ?? "individual",
      status: "active",
      invitedByUserId: invite.invitedByUserId,
      inviteEmail: invite.inviteEmail,
      joinedAt: new Date(),
      ...(invite.offeredTitle ? { title: invite.offeredTitle } : {}),
      ...(invite.offeredDepartment ? { department: invite.offeredDepartment } : {}),
      ...(invite.offeredSalary != null ? { salary: String(invite.offeredSalary) } : {}),
      ...(developerSpawn ? { spawnLocation: developerSpawn } : {}),
    });
  }

  await db
    .update(orgInvitesTable)
    .set({ status: "accepted", decidedAt: new Date() })
    .where(eq(orgInvitesTable.id, invite.id));

  const grants = await db
    .select()
    .from(orgFeatureGrantsTable)
    .where(eq(orgFeatureGrantsTable.orgId, invite.orgId));

  const [member] = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, invite.orgId), eq(orgMembersTable.userId, userId)));

  if (member?.featureBilling === "company" && grants.length > 0) {
    for (const grant of grants) {
      await grantFeature(userId, grant.featureKey as FeatureKey, `org:${invite.orgId}`, grant.stripeSubscriptionId ?? undefined);
    }
  }

  try {
    const orgName = invitedOrg?.name ?? "the organization";
    const userName = user.firstName ?? user.email?.split('@')[0] ?? "A user";
    if (invite.invitedByUserId) {
      await db.insert(notificationsTable).values({
        userId: invite.invitedByUserId,
        type: "org_invite_accepted",
        title: `${userName} accepted your invite`,
        body: `${userName} has joined ${orgName} as a specialist.`,
        link: `/business/company`,
      });
    }
  } catch (err) {
    console.error("[Org Invite Accept] Failed to create notification:", err);
  }

  res.json({ ok: true, orgId: invite.orgId });
});

router.get("/orgs/:orgId/members", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const orgId = parseInt(req.params.orgId);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org ID" }); return; }

  const caller = await getCallerMembership(userId, orgId);
  if (!caller) { res.status(403).json({ error: "Not authorized" }); return; }

  const isCallerManager = hasRoleAccess(caller.role as OrgRole, "manager");

  const membersRaw = await db
    .select({
      orgId: orgMembersTable.orgId,
      userId: orgMembersTable.userId,
      role: orgMembersTable.role,
      department: orgMembersTable.department,
      featureBilling: orgMembersTable.featureBilling,
      status: orgMembersTable.status,
      title: orgMembersTable.title,
      salary: orgMembersTable.salary,
      memberType: orgMembersTable.memberType,
      inviteEmail: orgMembersTable.inviteEmail,
      joinedAt: orgMembersTable.joinedAt,
      createdAt: orgMembersTable.createdAt,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      profileImageUrl: usersTable.profileImageUrl,
    })
    .from(orgMembersTable)
    .leftJoin(usersTable, eq(orgMembersTable.userId, usersTable.id))
    .where(eq(orgMembersTable.orgId, orgId));

  const callerRank = ORG_ROLE_HIERARCHY[caller.role as OrgRole] ?? 0;

  const visibleRaw = isCallerManager
    ? membersRaw
    : membersRaw.filter(m => {
        if (m.userId === userId) return true;
        const rank = ORG_ROLE_HIERARCHY[m.role as OrgRole] ?? 0;
        return rank <= callerRank;
      });

  const hiddenCount = membersRaw.length - visibleRaw.length;

  const members = visibleRaw.map(m => ({
    userId: m.userId,
    orgId: m.orgId,
    role: m.role,
    department: m.department,
    status: m.status,
    title: m.title,
    memberType: m.memberType,
    joinedAt: m.joinedAt,
    createdAt: m.createdAt,
    firstName: m.firstName,
    lastName: m.lastName,
    profileImageUrl: m.profileImageUrl,
    salary: isCallerManager ? m.salary : null,
    featureBilling: isCallerManager ? m.featureBilling : null,
    email: isCallerManager ? (m.email || m.inviteEmail) : null,
    inviteEmail: isCallerManager ? m.inviteEmail : null,
  }));

  const pendingInvites = isCallerManager
    ? await db
        .select()
        .from(orgInvitesTable)
        .where(and(eq(orgInvitesTable.orgId, orgId), eq(orgInvitesTable.status, "pending")))
    : [];

  res.json({ members, pendingInvites, callerRole: caller.role, hiddenCount });
});

router.post("/orgs/:orgId/members", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const callerId = req.user.id;
  const orgId = parseInt(req.params.orgId);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org ID" }); return; }

  const caller = await getCallerMembership(callerId, orgId);
  const addMinRole = (await getOrgPermissionPolicy(orgId))["members.manage"];
  if (!caller || !hasRoleAccess(caller.role as OrgRole, addMinRole)) {
    res.status(403).json({ error: "Not authorized — insufficient role to manage members" }); return;
  }

  const { email, role, department, title, salary, memberType } = (req.body ?? {}) as {
    email?: string;
    role?: string;
    department?: string;
    title?: string;
    salary?: string;
    memberType?: string;
  };

  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "Valid email address required" }); return;
  }

  const cleanEmail = email.toLowerCase().trim();
  const requestedRole = (role && ORG_ROLES.includes(role as OrgRole) && role !== "owner") ? role as OrgRole : "specialist" as OrgRole;
  if (!hasRoleAccess(caller.role as OrgRole, requestedRole)) {
    res.status(403).json({ error: "Cannot assign a role at or above your own rank" }); return;
  }
  const assignRole = requestedRole;
  const assignType = (memberType && (ORG_MEMBER_TYPES as readonly string[]).includes(memberType)) ? memberType : "employee";

  let salaryVal: string | null = null;
  if (salary) {
    const n = Number(salary);
    if (isNaN(n) || n < 0 || n > 9999999999.99) {
      res.status(400).json({ error: "Salary must be a valid positive number" }); return;
    }
    salaryVal = String(n);
  }

  const existingUser = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, cleanEmail))
    .limit(1);

  const targetUserId = existingUser[0]?.id ?? `pending_${randomBytes(8).toString("hex")}`;

  const existingMember = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, targetUserId)));

  if (existingMember.length > 0) {
    res.status(409).json({ error: "This person is already a member of this organization" }); return;
  }

  const emailMember = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.inviteEmail, cleanEmail)));

  if (emailMember.length > 0) {
    res.status(409).json({ error: "A member with this email already exists in this organization" }); return;
  }

  const isRegistered = !!existingUser[0];

  const [member] = await db.insert(orgMembersTable).values({
    orgId,
    userId: targetUserId,
    role: assignRole,
    department: department ? String(department).trim() : null,
    title: title ? String(title).trim() : null,
    salary: salaryVal,
    memberType: assignType,
    inviteEmail: cleanEmail,
    invitedByUserId: callerId,
    status: isRegistered ? "active" : "invited",
    joinedAt: isRegistered ? new Date() : null,
  }).returning();

  if (isRegistered) {
    try {
      const [org] = await db.select({ name: organizationsTable.name }).from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
      const orgName = org?.name ?? "an organization";
      await db.insert(notificationsTable).values({
        userId: targetUserId,
        type: "org_member_added",
        title: `You've been added to ${orgName}`,
        body: `A manager at ${orgName} added you as ${assignType === "contractor" ? "a contractor" : "an employee"} (${assignRole}).`,
        link: `/bots/office`,
      });
    } catch (err) {
      console.error("[Org] Failed to send add notification:", err);
    }
  }

  res.json({ member, isRegistered });
});

router.put("/orgs/:orgId/members/:memberId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const callerId = req.user.id;
  const orgId = parseInt(req.params.orgId);
  const memberId = req.params.memberId;
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org ID" }); return; }

  const caller = await getCallerMembership(callerId, orgId);
  const editMinRole = (await getOrgPermissionPolicy(orgId))["members.manage"];
  if (!caller || !hasRoleAccess(caller.role as OrgRole, editMinRole)) {
    res.status(403).json({ error: "Not authorized" }); return;
  }

  const targetRows = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, memberId)));

  if (targetRows.length === 0) { res.status(404).json({ error: "Member not found" }); return; }
  const target = targetRows[0];

  if (target.role === "owner") {
    res.status(403).json({ error: "Cannot modify the owner record" });
    return;
  }
  if (!hasRoleAccess(caller.role as OrgRole, target.role as OrgRole) && callerId !== memberId) {
    res.status(403).json({ error: "Cannot modify members at or above your rank" });
    return;
  }

  const { role, department, spawnLocation, featureBilling, title, salary, memberType } = (req.body ?? {}) as {
    role?: string;
    department?: string | null;
    spawnLocation?: string | null;
    featureBilling?: string;
    title?: string | null;
    salary?: string | null;
    memberType?: string;
  };

  const updates: {
    role?: string;
    department?: string | null;
    spawnLocation?: string | null;
    featureBilling?: string;
    title?: string | null;
    salary?: string | null;
    memberType?: string;
  } = {};

  const assignableRoles: string[] = ORG_ROLES.filter(r => r !== "owner");
  if (role && assignableRoles.includes(role)) {
    if (!hasRoleAccess(caller.role as OrgRole, role as OrgRole)) {
      res.status(403).json({ error: "Cannot assign a role at or above your own rank" }); return;
    }
    updates.role = role;
  }
  if (department !== undefined) updates.department = department ? String(department).trim() : null;
  if (spawnLocation !== undefined) updates.spawnLocation = spawnLocation ? String(spawnLocation).trim() : null;
  if (featureBilling && ["company", "individual"].includes(featureBilling)) updates.featureBilling = featureBilling;
  if (title !== undefined) updates.title = title ? String(title).trim() : null;
  if (memberType && (ORG_MEMBER_TYPES as readonly string[]).includes(memberType)) updates.memberType = memberType;
  if (salary !== undefined) {
    if (salary !== null) {
      const salaryNum = Number(salary);
      if (isNaN(salaryNum) || salaryNum < 0 || salaryNum > 9999999999.99) {
        res.status(400).json({ error: "Salary must be a valid positive number" });
        return;
      }
      updates.salary = String(salaryNum);
    } else {
      updates.salary = null;
    }
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  await db
    .update(orgMembersTable)
    .set(updates)
    .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, memberId)));

  if (updates.featureBilling === "company") {
    const grants = await db.select().from(orgFeatureGrantsTable).where(eq(orgFeatureGrantsTable.orgId, orgId));
    for (const grant of grants) {
      await grantFeature(memberId, grant.featureKey as FeatureKey, `org:${orgId}`, grant.stripeSubscriptionId ?? undefined);
    }
  }

  const [updated] = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, memberId)));

  if (memberId !== callerId) {
    try {
      const [org] = await db.select({ name: organizationsTable.name }).from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
      const orgName = org?.name ?? "your organization";
      const changes: string[] = [];
      if (updates.role) changes.push(`role changed to ${updates.role}`);
      if (updates.title !== undefined) changes.push(`title updated to "${updates.title}"`);
      if (updates.salary !== undefined) changes.push(`salary updated`);
      if (updates.department !== undefined) changes.push(`department changed`);
      if (changes.length > 0) {
        await db.insert(notificationsTable).values({
          userId: memberId,
          type: "org_member_update",
          title: `Your position at ${orgName} has been updated`,
          body: changes.join(", ").replace(/^./, c => c.toUpperCase()) + ".",
          link: `/business/company`,
        });
      }
    } catch (err) {
      console.error("[Org] Failed to create member update notification:", err);
    }
  }

  res.json({ member: updated });
});

router.delete("/orgs/:orgId/members/:memberId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const callerId = req.user.id;
  const orgId = parseInt(req.params.orgId);
  const memberId = req.params.memberId;
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org ID" }); return; }

  const caller = await getCallerMembership(callerId, orgId);
  if (!caller) { res.status(403).json({ error: "Not authorized" }); return; }

  const isSelf = callerId === memberId;

  const removeMinRole = (await getOrgPermissionPolicy(orgId))["members.manage"];
  if (!isSelf && !hasRoleAccess(caller.role as OrgRole, removeMinRole)) {
    res.status(403).json({ error: "Not authorized" }); return;
  }

  const targetRows = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, memberId)));

  if (targetRows.length === 0) { res.status(404).json({ error: "Member not found" }); return; }
  const target = targetRows[0];

  if (target.role === "owner" && !isSelf) {
    res.status(400).json({ error: "Cannot remove org owner" });
    return;
  }

  if (!hasRoleAccess(caller.role as OrgRole, target.role as OrgRole) && !isSelf) {
    res.status(403).json({ error: "Cannot remove members at or above your rank" });
    return;
  }

  await db
    .update(orgMembersTable)
    .set({ status: "removed" })
    .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, memberId)));

  // If this was a PICASSO org owner losing their role, remove the Discord
  // admin role (best-effort, silent when unconfigured).
  if (target.role === "owner" || target.role === "ceo") {
    const [removedOrg] = await db
      .select({ isDeveloper: organizationsTable.isDeveloper, name: organizationsTable.name })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId))
      .limit(1);
    if (removedOrg?.isDeveloper && removedOrg.name?.toLowerCase() === "picasso") {
      removeAdminDiscordRole(memberId).catch((e) =>
        console.error("[Org] Admin Discord role removal error:", e instanceof Error ? e.message : e)
      );
    }
  }

  if (!isSelf) {
    try {
      const [org] = await db.select({ name: organizationsTable.name }).from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
      const orgName = org?.name ?? "the organization";
      await db.insert(notificationsTable).values({
        userId: memberId,
        type: "org_member_removed",
        title: `You have been removed from ${orgName}`,
        body: `Your membership at ${orgName} has been terminated.`,
        link: `/business`,
      });
    } catch (err) {
      console.error("[Org] Failed to create removal notification:", err);
    }
  }

  res.json({ ok: true });
});

// DELETE an entire organization (disband). Owner-only. Deleting the org row
// cascades to org_members/invites/partnerships/feature_grants/door_locks/
// org chat_channels/tickets via FK onDelete:"cascade". Run in a transaction so
// the org and its phone numbers are released all-or-nothing.
router.delete("/orgs/:orgId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const callerId = req.user.id;
  const orgId = parseInt(req.params.orgId);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org ID" }); return; }

  const caller = await getCallerMembership(callerId, orgId);
  if (!caller) { res.status(403).json({ error: "Not authorized" }); return; }
  if (caller.role !== "owner") {
    res.status(403).json({ error: "Only the org owner can delete this organization" });
    return;
  }

  const [org] = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name, isDeveloper: organizationsTable.isDeveloper })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }
  if (org.isDeveloper || isReservedOrgName(org.name)) {
    res.status(403).json({ error: "Reserved organizations cannot be deleted" });
    return;
  }

  // Required safety: caller must echo the exact org name to confirm.
  const confirmName = typeof req.body?.confirmName === "string" ? req.body.confirmName.trim() : "";
  if (confirmName !== org.name) {
    res.status(400).json({ error: "Confirmation name does not match" });
    return;
  }

  // Notify all other active members before the cascade removes them.
  const otherMembers = await db
    .select({ userId: orgMembersTable.userId })
    .from(orgMembersTable)
    .where(and(
      eq(orgMembersTable.orgId, orgId),
      eq(orgMembersTable.status, "active"),
    ));

  await db.transaction(async (tx) => {
    // Release any phone numbers tied to the org so they aren't orphaned to a
    // dead org id (no FK cascade on phone_numbers.org_id).
    await tx.update(phoneNumbersTable).set({ orgId: null }).where(eq(phoneNumbersTable.orgId, orgId));
    // Clear any user's active-org pointer aimed at this org so the UI doesn't
    // try to load a dead org (users.current_org_id is a plain varchar, no FK).
    await tx.update(usersTable).set({ currentOrgId: null }).where(eq(usersTable.currentOrgId, String(orgId)));
    await tx.delete(organizationsTable).where(eq(organizationsTable.id, orgId));
  });

  try {
    const recipients = otherMembers.map(m => m.userId).filter(id => id !== callerId);
    if (recipients.length > 0) {
      await db.insert(notificationsTable).values(recipients.map(userId => ({
        userId,
        type: "org_disbanded",
        title: `${org.name} has been disbanded`,
        body: `The owner has permanently deleted ${org.name}. Your membership has ended.`,
        link: `/business`,
      })));
    }
  } catch (err) {
    console.error("[Org] Failed to create disband notifications:", err);
  }

  res.json({ ok: true });
});

router.post("/orgs/:orgId/features", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const callerId = req.user.id;
  const orgId = parseInt(req.params.orgId);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org ID" }); return; }

  const caller = await getCallerMembership(callerId, orgId);
  if (!caller || !hasRoleAccess(caller.role as OrgRole, "manager")) {
    res.status(403).json({ error: "Not authorized" }); return;
  }

  const { featureKey: rawFeatureKey, stripeSubscriptionId } = (req.body ?? {}) as { featureKey?: string; stripeSubscriptionId?: string };
  const featureKey = rawFeatureKey ? (resolveFeatureKey(rawFeatureKey) ?? rawFeatureKey) : undefined;
  if (!featureKey || !FEATURE_KEYS.includes(featureKey as FeatureKey)) {
    res.status(400).json({ error: "Valid featureKey required" });
    return;
  }

  await db
    .insert(orgFeatureGrantsTable)
    .values({ orgId, featureKey, stripeSubscriptionId: stripeSubscriptionId ?? null })
    .onConflictDoUpdate({
      target: [orgFeatureGrantsTable.orgId, orgFeatureGrantsTable.featureKey],
      set: { stripeSubscriptionId: stripeSubscriptionId ?? null, grantedAt: new Date() },
    });

  const members = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.status, "active"), eq(orgMembersTable.featureBilling, "company")));

  for (const m of members) {
    await grantFeature(m.userId, featureKey as FeatureKey, `org:${orgId}`, stripeSubscriptionId ?? undefined);
  }

  res.json({ ok: true });
});

router.post("/orgs/:orgId/stripe-customer", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const callerId = req.user.id;
  const orgId = parseInt(req.params.orgId);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org ID" }); return; }

  const caller = await getCallerMembership(callerId, orgId);
  if (!caller || caller.role !== "owner") {
    res.status(403).json({ error: "Only org owner can manage billing" }); return;
  }

  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, orgId));
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  if (org.stripeCustomerId) {
    res.json({ stripeCustomerId: org.stripeCustomerId });
    return;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: org.name,
    metadata: {
      orgId: String(orgId),
      ownerUserId: org.ownerUserId,
      product_line: "SALARYMAN",
    },
  });

  await db
    .update(organizationsTable)
    .set({ stripeCustomerId: customer.id })
    .where(eq(organizationsTable.id, orgId));

  res.json({ stripeCustomerId: customer.id });
});

router.post("/orgs/:orgId/stripe-checkout", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const callerId = req.user.id;
  const orgId = parseInt(req.params.orgId);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org ID" }); return; }

  const caller = await getCallerMembership(callerId, orgId);
  if (!caller || caller.role !== "owner") {
    res.status(403).json({ error: "Only org owner can initiate company billing" }); return;
  }

  const { feature: rawFeature } = (req.body ?? {}) as { feature?: string };
  const feature = rawFeature ? resolveFeatureKey(rawFeature) : undefined;
  if (!feature) {
    res.status(400).json({ error: "Valid feature required" });
    return;
  }

  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, orgId));
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  const stripe = getStripe();
  const baseUrl = process.env.APP_BASE_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`;

  let stripeCustomerId = org.stripeCustomerId;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      name: org.name,
      metadata: { orgId: String(orgId), ownerUserId: org.ownerUserId, product_line: "SALARYMAN" },
    });
    stripeCustomerId = customer.id;
    await db.update(organizationsTable).set({ stripeCustomerId }).where(eq(organizationsTable.id, orgId));
  }

  const FEATURE_PRICE_ENV: Record<FeatureKey, string> = {
    live_listen: "STRIPE_PRICE_LIVE_LISTEN",
    screen_scan: "STRIPE_PRICE_SCREEN_SCAN",
    say_this: "STRIPE_PRICE_SAY_THIS",
    phone_system: "STRIPE_PRICE_PHONE_SYSTEM",
    claw_bot: "STRIPE_PRICE_CLAW_BOT",
  };
  const priceId = process.env[FEATURE_PRICE_ENV[feature as FeatureKey] ?? ""];
  if (!priceId) {
    res.status(500).json({ error: `Pricing for ${feature} not configured` });
    return;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/world?org_billing_success=1&feature=${feature}`,
    cancel_url: `${baseUrl}/world?org_billing_cancel=1`,
    client_reference_id: callerId,
    metadata: {
      userId: callerId,
      feature,
      orgId: String(orgId),
      grantedBy: `org:${orgId}`,
      brand: "Picassoo.AI",
      product_line: "SALARYMAN",
    },
    subscription_data: {
      metadata: { feature, orgId: String(orgId), grantedBy: `org:${orgId}` },
    },
  });

  res.json({ url: session.url });
});

router.put("/orgs/:orgId/adult-content", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const callerId = req.user.id;
  const orgId = parseInt(req.params.orgId);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org ID" }); return; }

  const caller = await getCallerMembership(callerId, orgId);
  if (!caller || !hasRoleAccess(caller.role as OrgRole, "executive")) {
    res.status(403).json({ error: "EXECUTIVE rank or higher required" }); return;
  }

  const { enabled } = (req.body ?? {}) as { enabled?: boolean };
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled (boolean) required" }); return;
  }

  const [updated] = await db
    .update(organizationsTable)
    .set({ adultContentEnabled: enabled })
    .where(eq(organizationsTable.id, orgId))
    .returning();

  res.json({ org: updated });
});

router.get("/orgs/:orgId/roles", async (req, res) => {
  if (!requireAuth(req, res)) return;
  res.json({ roles: ORG_ROLES });
});

router.get("/orgs/:orgId/partnerships", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const orgId = parseInt(req.params.orgId);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org ID" }); return; }

  const caller = await getCallerMembership(userId, orgId);
  if (!caller) { res.status(403).json({ error: "Not a member of this org" }); return; }

  const partnerships = await db.select().from(orgPartnershipsTable)
    .where(or(eq(orgPartnershipsTable.orgAId, orgId), eq(orgPartnershipsTable.orgBId, orgId)));

  const partnerOrgIds = partnerships.map(p => p.orgAId === orgId ? p.orgBId : p.orgAId).filter(Boolean);
  let partnerOrgs: Array<{ id: number; name: string }> = [];
  if (partnerOrgIds.length > 0) {
    partnerOrgs = await db.select({ id: organizationsTable.id, name: organizationsTable.name })
      .from(organizationsTable).where(inArray(organizationsTable.id, partnerOrgIds));
  }

  res.json({
    partnerships: partnerships.map(p => ({
      ...p,
      partnerOrg: partnerOrgs.find(o => o.id === (p.orgAId === orgId ? p.orgBId : p.orgAId)),
    })),
  });
});

router.post("/orgs/:orgId/partnerships/request", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const orgId = parseInt(req.params.orgId);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org ID" }); return; }

  const caller = await getCallerMembership(userId, orgId);
  if (!caller || !hasRoleAccess(caller.role as OrgRole, "manager")) {
    res.status(403).json({ error: "Manager access required" }); return;
  }

  const { partnerOrgName, type, label, sharedOffice, rentalAgreement } = (req.body ?? {}) as {
    partnerOrgName?: string; type?: string; label?: string; sharedOffice?: string; rentalAgreement?: string;
  };
  if (!partnerOrgName?.trim()) { res.status(400).json({ error: "Partner org name required" }); return; }

  const [partnerOrg] = await db.select().from(organizationsTable)
    .where(sql`lower(${organizationsTable.name}) = lower(${partnerOrgName.trim()})`);
  if (!partnerOrg) { res.status(404).json({ error: "Organization not found" }); return; }
  if (partnerOrg.id === orgId) { res.status(400).json({ error: "Cannot partner with yourself" }); return; }

  const existing = await db.select().from(orgPartnershipsTable).where(
    or(
      and(eq(orgPartnershipsTable.orgAId, orgId), eq(orgPartnershipsTable.orgBId, partnerOrg.id)),
      and(eq(orgPartnershipsTable.orgAId, partnerOrg.id), eq(orgPartnershipsTable.orgBId, orgId)),
    )
  );
  if (existing.length > 0) {
    res.status(400).json({ error: "Partnership already exists or pending" }); return;
  }

  const [partnership] = await db.insert(orgPartnershipsTable).values({
    orgAId: orgId,
    orgBId: partnerOrg.id,
    type: type || "partnership",
    label: label || null,
    sharedOffice: sharedOffice || null,
    rentalAgreement: rentalAgreement || null,
    status: "pending",
    requestedByUserId: userId,
  }).returning();

  try {
    const [org] = await db.select({ name: organizationsTable.name }).from(organizationsTable).where(eq(organizationsTable.id, orgId));
    const ownerMembers = await db.select().from(orgMembersTable).where(
      and(eq(orgMembersTable.orgId, partnerOrg.id), eq(orgMembersTable.role, "owner"), eq(orgMembersTable.status, "active"))
    );
    for (const m of ownerMembers) {
      await db.insert(notificationsTable).values({
        userId: m.userId,
        type: "org_partnership_request",
        title: `Partnership request from ${org?.name ?? "an organization"}`,
        body: `${org?.name} wants to connect organizations${sharedOffice ? ` (shared office: ${sharedOffice})` : ""}. Review and approve this partnership.`,
        link: `/business`,
      });
    }
  } catch (err) {
    console.error("[Org Partnership] Failed to notify:", err);
  }

  res.json({ partnership });
});

router.patch("/orgs/:orgId/partnerships/:partnershipId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const orgId = parseInt(req.params.orgId);
  const partnershipId = parseInt(req.params.partnershipId);
  if (isNaN(orgId) || isNaN(partnershipId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const caller = await getCallerMembership(userId, orgId);
  if (!caller || !hasRoleAccess(caller.role as OrgRole, "manager")) {
    res.status(403).json({ error: "Manager access required" }); return;
  }

  const { status, sharedOffice, rentalAgreement } = (req.body ?? {}) as {
    status?: string; sharedOffice?: string; rentalAgreement?: string;
  };

  const [partnership] = await db.select().from(orgPartnershipsTable).where(eq(orgPartnershipsTable.id, partnershipId));
  if (!partnership) { res.status(404).json({ error: "Partnership not found" }); return; }
  if (partnership.orgAId !== orgId && partnership.orgBId !== orgId) {
    res.status(403).json({ error: "Not your partnership" }); return;
  }

  const updates: Record<string, unknown> = {};
  if (status === "active" || status === "declined" || status === "dissolved") {
    if (status === "active" && partnership.status !== "pending") {
      res.status(400).json({ error: "Only pending partnerships can be accepted" }); return;
    }
    if (status === "active" && partnership.orgAId === orgId) {
      res.status(403).json({ error: "Cannot accept your own outbound partnership request" }); return;
    }
    if (status === "declined" && partnership.status !== "pending") {
      res.status(400).json({ error: "Only pending partnerships can be declined" }); return;
    }
    if (status === "dissolved" && partnership.status !== "active") {
      res.status(400).json({ error: "Only active partnerships can be dissolved" }); return;
    }
    updates.status = status;
    if (status === "active") updates.approvedByUserId = userId;
  }
  if (sharedOffice !== undefined) updates.sharedOffice = sharedOffice;
  if (rentalAgreement !== undefined) updates.rentalAgreement = rentalAgreement;

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }

  const [updated] = await db.update(orgPartnershipsTable).set(updates)
    .where(eq(orgPartnershipsTable.id, partnershipId)).returning();

  if (status === "active") {
    try {
      const [org] = await db.select({ name: organizationsTable.name }).from(organizationsTable).where(eq(organizationsTable.id, orgId));
      const otherOrgId = partnership.orgAId === orgId ? partnership.orgBId : partnership.orgAId;
      const ownerMembers = await db.select().from(orgMembersTable).where(
        and(eq(orgMembersTable.orgId, otherOrgId), eq(orgMembersTable.status, "active"))
      );
      for (const m of ownerMembers) {
        await db.insert(notificationsTable).values({
          userId: m.userId,
          type: "org_partnership_accepted",
          title: `Partnership accepted by ${org?.name}`,
          body: `Your partnership request has been accepted. You can now share resources.`,
          link: `/business`,
        });
      }
    } catch {}
  }

  res.json({ partnership: updated });
});

// Activate every marketplace bot for a Picasso owner/ceo (idempotent).
router.post("/orgs/picasso/activate-all-bots", async (req: Request, res: Response) => {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const userId = req.user.id;
  const [picasso] = await db.select().from(organizationsTable)
    .where(sql`lower(${organizationsTable.name}) = 'picasso'`);
  if (!picasso) {
    res.status(404).json({ error: "Picasso org not found" });
    return;
  }
  const [member] = await db.select().from(orgMembersTable).where(and(
    eq(orgMembersTable.orgId, picasso.id),
    eq(orgMembersTable.userId, userId),
    eq(orgMembersTable.status, "active"),
  ));
  if (!member || (member.role !== "owner" && member.role !== "ceo")) {
    res.status(403).json({ error: "Only active Picasso owner/ceo can activate all bots" });
    return;
  }
  const { activateAllBotsForUser } = await import("../lib/seed-picasso-bots");
  const result = await activateAllBotsForUser(userId);
  res.json({ ok: true, ...result });
});

const PRESENCE_WINDOW_MS = 90 * 1000;

router.post("/orgs/:orgId/heartbeat", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const orgId = parseInt(req.params.orgId);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org ID" }); return; }
  const caller = await getCallerMembership(userId, orgId);
  if (!caller || caller.status !== "active") {
    res.status(403).json({ error: "Not an active member" }); return;
  }
  const now = new Date();
  await db.update(orgMembersTable)
    .set({ lastSeenAt: now })
    .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, userId)));
  res.json({ ok: true, at: now.toISOString() });
});

router.get("/orgs/:orgId/presence", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const orgId = parseInt(req.params.orgId);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org ID" }); return; }
  const caller = await getCallerMembership(userId, orgId);
  if (!caller) { res.status(403).json({ error: "Not authorized" }); return; }

  const now = Date.now();
  const memberRows = await db
    .select({
      userId: orgMembersTable.userId,
      lastSeenAt: orgMembersTable.lastSeenAt,
      status: orgMembersTable.status,
    })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.status, "active")));

  const members = memberRows.map(m => ({
    userId: m.userId,
    lastSeenAt: m.lastSeenAt,
    online: !!m.lastSeenAt && (now - new Date(m.lastSeenAt).getTime() < PRESENCE_WINDOW_MS),
  }));

  const botRows = await db
    .select({
      id: botsTable.id,
      name: botsTable.name,
      status: botsTable.status,
    })
    .from(botsTable)
    .where(eq(botsTable.orgId, orgId));

  const bots = botRows.map(b => ({
    id: b.id,
    name: b.name,
    status: b.status,
    online: b.status === "active",
    available: b.status === "active",
  }));

  void now;

  res.json({
    members,
    bots,
    onlineMemberCount: members.filter(m => m.online).length,
    onlineBotCount: bots.filter(b => b.online).length,
    availableBotCount: bots.filter(b => b.available).length,
  });
});

// ---------------------------------------------------------------------------
// Org Phone-Number Pool — org owners/admins (>= director) can reassign any
// phone number that Picasso staff has stamped into their org's pool to any
// active org member. Read access is open to all active members so the
// roster page can show who currently holds each number.
//
// Routing layer is unchanged: phone_numbers.user_id is still the source of
// truth for inbound webhooks. We rewrite Twilio's voiceUrl/smsUrl to point
// at the new userId so calls land in the right inbox immediately.
// ---------------------------------------------------------------------------

function getTwilioClientForOrg() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error("Twilio is not configured on this server (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN missing)");
  }
  return twilio(sid, token);
}

function getTrustedAppHost(): string | null {
  // Only trust env-configured hosts. We deliberately do NOT fall back to
  // req.get("host") because Twilio webhook URLs become a privileged target —
  // a host-header poisoning attack on this endpoint could otherwise redirect
  // inbound calls/SMS to an attacker-controlled domain.
  const fromEnv = process.env.APP_DOMAIN || process.env.REPLIT_DEPLOYMENT_URL || process.env.REPLIT_DEV_DOMAIN;
  if (fromEnv) return fromEnv.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return null;
}

async function logOrgPhoneAudit(actorUserId: string, action: string, phoneNumberId: number, details: Record<string, unknown>) {
  try {
    await db.insert(adminAuditLogTable).values({
      adminId: actorUserId,
      action,
      targetType: "phone_number",
      targetId: String(phoneNumberId),
      details: JSON.stringify(details),
    });
  } catch (e) {
    // Never let audit-log failures block the user-facing operation, but
    // surface them in server logs for ops to investigate.
    console.warn("[Org Phone Audit] insert failed:", e instanceof Error ? e.message : "Unknown");
  }
}

// `director` is the lowest org role with admin authority over the org's
// resources (matches the "owners or admins" framing the user asked for).
const PHONE_POOL_MIN_ROLE: OrgRole = "director";

async function loadOrgPhonePoolMembership(req: Request, res: Response): Promise<{ userId: string; orgId: number; member: OrgMember } | null> {
  if (!requireAuth(req, res)) return null;
  const orgId = Number(req.params.orgId);
  if (!Number.isFinite(orgId)) {
    res.status(400).json({ error: "Invalid orgId" });
    return null;
  }
  const userId = String(req.user!.id);
  const member = await getCallerMembership(userId, orgId);
  if (!member) {
    res.status(403).json({ error: "Not a member of this org" });
    return null;
  }
  return { userId, orgId, member };
}

// GET /api/orgs/:orgId/phone-numbers — list the org's phone-number pool plus
// the active member roster (used to populate the reassign dropdown).
router.get("/orgs/:orgId/phone-numbers", async (req: Request, res: Response) => {
  const ctx = await loadOrgPhonePoolMembership(req, res);
  if (!ctx) return;
  const { orgId, member } = ctx;
  try {
    const pool = await db
      .select({
        id: phoneNumbersTable.id,
        userId: phoneNumbersTable.userId,
        number: phoneNumbersTable.number,
        label: phoneNumbersTable.label,
        friendlyName: phoneNumbersTable.friendlyName,
        twilioSid: phoneNumbersTable.twilioSid,
        isActive: phoneNumbersTable.isActive,
        createdAt: phoneNumbersTable.createdAt,
      })
      .from(phoneNumbersTable)
      .where(eq(phoneNumbersTable.orgId, orgId))
      .orderBy(phoneNumbersTable.createdAt);

    const holderIds = Array.from(new Set(pool.map(p => p.userId)));
    const holders = holderIds.length
      ? await db
          .select({ id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName })
          .from(usersTable)
          .where(inArray(usersTable.id, holderIds))
      : [];
    const holderById = new Map(holders.map(u => [u.id, u]));

    // Roster of active members the caller may reassign to.
    const memberRows = await db
      .select({
        userId: orgMembersTable.userId,
        role: orgMembersTable.role,
        title: orgMembersTable.title,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
      })
      .from(orgMembersTable)
      .leftJoin(usersTable, eq(usersTable.id, orgMembersTable.userId))
      .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.status, "active")));

    const phoneNumbers = pool.map(p => {
      const u = holderById.get(p.userId) ?? null;
      return {
        id: p.id,
        number: p.number,
        label: p.label,
        friendlyName: p.friendlyName,
        twilioSid: p.twilioSid,
        isActive: p.isActive,
        assignedAt: p.createdAt,
        assignedTo: u
          ? { userId: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName }
          : { userId: p.userId, email: null, firstName: null, lastName: null },
      };
    });

    return res.json({
      phoneNumbers,
      members: memberRows,
      callerRole: member.role,
      canManage: hasRoleAccess(member.role as OrgRole, PHONE_POOL_MIN_ROLE),
      minManageRole: PHONE_POOL_MIN_ROLE,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Org Phone] list error:", msg);
    return res.status(500).json({ error: msg });
  }
});

// POST /api/orgs/:orgId/phone-numbers/:phoneNumberId/assign — reassign an
// org pool number to another active org member. Rewrites Twilio webhooks so
// inbound calls land in the new owner's inbox immediately.
router.post("/orgs/:orgId/phone-numbers/:phoneNumberId/assign", async (req: Request, res: Response) => {
  const ctx = await loadOrgPhonePoolMembership(req, res);
  if (!ctx) return;
  const { orgId, member } = ctx;
  if (!hasRoleAccess(member.role as OrgRole, PHONE_POOL_MIN_ROLE)) {
    return res.status(403).json({ error: `Need ${PHONE_POOL_MIN_ROLE} role or higher to manage phone numbers` });
  }
  const phoneNumberId = Number(req.params.phoneNumberId);
  if (!Number.isFinite(phoneNumberId)) return res.status(400).json({ error: "Invalid phoneNumberId" });

  const { userId: targetUserId, label } = req.body as { userId?: string; label?: string };
  if (!targetUserId) return res.status(400).json({ error: "userId required" });

  try {
    const phoneRows = await db
      .select()
      .from(phoneNumbersTable)
      .where(and(eq(phoneNumbersTable.id, phoneNumberId), eq(phoneNumbersTable.orgId, orgId)))
      .limit(1);
    const phone = phoneRows[0];
    if (!phone) return res.status(404).json({ error: "Phone number not in this org's pool" });

    const targetMembership = await db
      .select({ userId: orgMembersTable.userId })
      .from(orgMembersTable)
      .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, targetUserId), eq(orgMembersTable.status, "active")))
      .limit(1);
    if (!targetMembership[0]) {
      return res.status(400).json({ error: "Target user is not an active member of this org" });
    }

    const targetUserRow = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, targetUserId))
      .limit(1);
    const targetUser = targetUserRow[0];
    if (!targetUser) return res.status(404).json({ error: "Target user account not found" });

    // Rewrite Twilio webhooks so the next inbound call routes to the new
    // owner. Fail-closed: if the Twilio call errors, abort BEFORE touching
    // the DB so the on-disk owner can never disagree with what Twilio is
    // actually posting webhooks to. Misconfigured app host is also fatal —
    // we will not fall back to the request Host header (security note in
    // getTrustedAppHost above).
    if (phone.twilioSid) {
      const host = getTrustedAppHost();
      if (!host) {
        return res.status(503).json({ error: "App host not configured (set APP_DOMAIN). Refusing to update routing without a trusted host." });
      }
      try {
        const base = `https://${host}/api`;
        const client = getTwilioClientForOrg();
        await client.incomingPhoneNumbers(phone.twilioSid).update({
          voiceUrl: `${base}/twilio/inbound/webhook?userId=${encodeURIComponent(targetUserId)}`,
          voiceMethod: "POST",
          statusCallback: `${base}/twilio/webhook/status`,
          statusCallbackMethod: "POST",
          smsUrl: `${base}/twilio/webhook/sms?userId=${encodeURIComponent(targetUserId)}`,
          smsMethod: "POST",
          friendlyName: label
            ? `${label} — ${targetUser.email ?? targetUserId}`
            : `Salaryman: ${targetUser.email ?? targetUserId}`,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Unknown Twilio error";
        console.error("[Org Phone] Twilio webhook update failed; aborting reassign:", msg);
        return res.status(502).json({ error: `Twilio update failed; assignment aborted to keep routing consistent: ${msg}` });
      }
    }

    // Move ownership inside a transaction. We re-read the row FOR UPDATE so
    // concurrent admins can't race two webhook rewrites against the same
    // number — the loser's transaction will see the post-winner state and
    // be safely overwritten by its own commit.
    const previousUserId = phone.userId;
    const updated = await db.transaction(async (tx) => {
      const locked = await tx
        .select()
        .from(phoneNumbersTable)
        .where(and(eq(phoneNumbersTable.id, phoneNumberId), eq(phoneNumbersTable.orgId, orgId)))
        .for("update")
        .limit(1);
      if (!locked[0]) {
        throw new Error("Phone number row vanished during reassignment");
      }
      await tx
        .delete(phoneNumbersTable)
        .where(and(
          eq(phoneNumbersTable.number, locked[0].number),
          eq(phoneNumbersTable.userId, targetUserId),
          // Don't nuke the row we're about to update.
          sql`${phoneNumbersTable.id} <> ${phoneNumberId}`,
        ));
      const [row] = await tx
        .update(phoneNumbersTable)
        .set({
          userId: targetUserId,
          label: label ?? locked[0].label,
          friendlyName: label ?? locked[0].friendlyName,
          isActive: true,
        })
        .where(eq(phoneNumbersTable.id, phoneNumberId))
        .returning();
      return row;
    });

    await logOrgPhoneAudit(String(req.user!.id), "org_phone.assign", phoneNumberId, {
      orgId,
      number: phone.number,
      twilioSid: phone.twilioSid,
      previousUserId,
      newUserId: targetUserId,
      label: label ?? null,
    });

    return res.json({ ok: true, phoneNumber: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Org Phone] assign error:", msg);
    return res.status(500).json({ error: msg });
  }
});

// POST /api/orgs/:orgId/phone-numbers/:phoneNumberId/release — return a pool
// number to the org owner without touching the org_id stamp. Useful when an
// employee leaves and the admin needs to park the number quickly.
router.post("/orgs/:orgId/phone-numbers/:phoneNumberId/release", async (req: Request, res: Response) => {
  const ctx = await loadOrgPhonePoolMembership(req, res);
  if (!ctx) return;
  const { orgId, member } = ctx;
  if (!hasRoleAccess(member.role as OrgRole, PHONE_POOL_MIN_ROLE)) {
    return res.status(403).json({ error: `Need ${PHONE_POOL_MIN_ROLE} role or higher to manage phone numbers` });
  }
  const phoneNumberId = Number(req.params.phoneNumberId);
  if (!Number.isFinite(phoneNumberId)) return res.status(400).json({ error: "Invalid phoneNumberId" });

  try {
    const phoneRows = await db
      .select()
      .from(phoneNumbersTable)
      .where(and(eq(phoneNumbersTable.id, phoneNumberId), eq(phoneNumbersTable.orgId, orgId)))
      .limit(1);
    const phone = phoneRows[0];
    if (!phone) return res.status(404).json({ error: "Phone number not in this org's pool" });

    const orgRow = await db.select().from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
    const ownerUserId = orgRow[0]?.ownerUserId;
    if (!ownerUserId) return res.status(500).json({ error: "Org owner not found" });

    if (phone.userId === ownerUserId) {
      return res.json({ ok: true, phoneNumber: phone, note: "Already held by org owner" });
    }

    const ownerRow = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, ownerUserId)).limit(1);
    const owner = ownerRow[0];

    // Fail-closed Twilio rewrite (same reasoning as /assign above).
    if (phone.twilioSid) {
      const host = getTrustedAppHost();
      if (!host) {
        return res.status(503).json({ error: "App host not configured (set APP_DOMAIN). Refusing to update routing without a trusted host." });
      }
      try {
        const base = `https://${host}/api`;
        const client = getTwilioClientForOrg();
        await client.incomingPhoneNumbers(phone.twilioSid).update({
          voiceUrl: `${base}/twilio/inbound/webhook?userId=${encodeURIComponent(ownerUserId)}`,
          voiceMethod: "POST",
          statusCallback: `${base}/twilio/webhook/status`,
          statusCallbackMethod: "POST",
          smsUrl: `${base}/twilio/webhook/sms?userId=${encodeURIComponent(ownerUserId)}`,
          smsMethod: "POST",
          friendlyName: `Salaryman pool: ${owner?.email ?? ownerUserId}`,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Unknown Twilio error";
        console.error("[Org Phone] Twilio webhook release failed; aborting:", msg);
        return res.status(502).json({ error: `Twilio update failed; release aborted to keep routing consistent: ${msg}` });
      }
    }

    const previousUserId = phone.userId;
    const updated = await db.transaction(async (tx) => {
      const locked = await tx
        .select()
        .from(phoneNumbersTable)
        .where(and(eq(phoneNumbersTable.id, phoneNumberId), eq(phoneNumbersTable.orgId, orgId)))
        .for("update")
        .limit(1);
      if (!locked[0]) {
        throw new Error("Phone number row vanished during release");
      }
      await tx
        .delete(phoneNumbersTable)
        .where(and(
          eq(phoneNumbersTable.number, locked[0].number),
          eq(phoneNumbersTable.userId, ownerUserId),
          sql`${phoneNumbersTable.id} <> ${phoneNumberId}`,
        ));
      const [row] = await tx
        .update(phoneNumbersTable)
        .set({ userId: ownerUserId, isActive: true })
        .where(eq(phoneNumbersTable.id, phoneNumberId))
        .returning();
      return row;
    });

    await logOrgPhoneAudit(String(req.user!.id), "org_phone.release", phoneNumberId, {
      orgId,
      number: phone.number,
      twilioSid: phone.twilioSid,
      previousUserId,
      newUserId: ownerUserId,
    });

    return res.json({ ok: true, phoneNumber: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Org Phone] release error:", msg);
    return res.status(500).json({ error: msg });
  }
});

// ── Org door locks ───────────────────────────────────────────────────────────
// Server-authoritative passcode + access-level gating for org-controlled spaces
// (offices, buildings, makeshift tents/vans). Access is ALWAYS decided here from
// live org membership + role rank — never a client flag. Member whose role meets
// the door's minRole enters freely; everyone else must supply the passcode.

const MIN_DOOR_PASSCODE_LEN = 6;

// GET /api/orgs/doors/locked — lightweight public hint of which door keys are
// locked (no passcodes). The client uses this only to know WHICH doors to send
// an enter check for; the actual allow/deny always runs server-side in /enter.
router.get("/orgs/doors/locked", async (_req, res) => {
  try {
    const rows = await db
      .select({
        doorKey: orgDoorLocksTable.doorKey,
        label: orgDoorLocksTable.label,
        spaceType: orgDoorLocksTable.spaceType,
        minRole: orgDoorLocksTable.minRole,
        orgId: orgDoorLocksTable.orgId,
      })
      .from(orgDoorLocksTable);
    // `doors` is the canonical key (matches GET /orgs/:orgId/doors); `locks` is
    // kept for backward compatibility with any older client.
    res.json({ doors: rows, locks: rows });
  } catch (e) {
    console.error("[Org Doors] locked list failed:", e);
    res.status(500).json({ error: "Failed to load door locks" });
  }
});

// POST /api/orgs/doors/enter — decide entry for a door key.
// Body: { doorKey, passcode? }. Auth is optional: a signed-in member of the
// owning org with sufficient role enters without a passcode; anyone else (incl.
// other-org members and guests) must provide the correct passcode.
router.post("/orgs/doors/enter", async (req, res) => {
  const { doorKey, passcode } = req.body ?? {};
  if (typeof doorKey !== "string" || !doorKey.trim()) {
    res.status(400).json({ error: "doorKey required" });
    return;
  }
  try {
    const [lock] = await db
      .select()
      .from(orgDoorLocksTable)
      .where(eq(orgDoorLocksTable.doorKey, doorKey.trim()))
      .limit(1);
    if (!lock) {
      res.json({ allowed: true, locked: false });
      return;
    }

    const userId = req.isAuthenticated() ? req.user.id : null;
    if (userId) {
      const membership = await getCallerMembership(userId, lock.orgId);
      if (membership && hasRoleAccess(membership.role as OrgRole, lock.minRole as OrgRole)) {
        res.json({ allowed: true, locked: true, asMember: true, label: lock.label, spaceType: lock.spaceType });
        return;
      }
    }

    if (await verifyAccessCode(lock.passcode, passcode)) {
      if (!isHashedAccessCode(lock.passcode)) {
        await db.update(orgDoorLocksTable)
          .set({ passcode: await hashAccessCode(lock.passcode), updatedAt: new Date() })
          .where(eq(orgDoorLocksTable.id, lock.id));
      }
      res.json({ allowed: true, locked: true, asMember: false, label: lock.label, spaceType: lock.spaceType });
      return;
    }

    res.json({
      allowed: false,
      locked: true,
      requiresPasscode: true,
      label: lock.label,
      spaceType: lock.spaceType,
      minRole: lock.minRole,
    });
  } catch (e) {
    console.error("[Org Doors] enter failed:", e);
    res.status(500).json({ error: "Failed to check door" });
  }
});

// GET /api/orgs/:orgId/doors — list the org's door locks (active members only).
router.get("/orgs/:orgId/doors", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const orgId = Number(req.params.orgId);
  if (!Number.isFinite(orgId)) { res.status(400).json({ error: "Invalid orgId" }); return; }
  try {
    const caller = await getCallerMembership(req.user.id, orgId);
    if (!caller) { res.status(403).json({ error: "Not a member of this organization" }); return; }
    const rows = await db
      .select()
      .from(orgDoorLocksTable)
      .where(eq(orgDoorLocksTable.orgId, orgId));
    const canManage = hasRoleAccess(caller.role as OrgRole, "manager");
    // Access codes are write-only. Never return plaintext, legacy values, or hashes.
    const doors = rows.map(({ passcode: _passcode, ...door }) => door);
    res.json({ doors, canManage });
  } catch (e) {
    console.error("[Org Doors] list failed:", e);
    res.status(500).json({ error: "Failed to list doors" });
  }
});

// POST /api/orgs/:orgId/doors — create or update a door lock (manager+).
// Body: { doorKey, label?, spaceType?, passcode, minRole? }.
router.post("/orgs/:orgId/doors", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const orgId = Number(req.params.orgId);
  if (!Number.isFinite(orgId)) { res.status(400).json({ error: "Invalid orgId" }); return; }
  const { doorKey, label, spaceType, passcode, minRole } = req.body ?? {};
  try {
    const caller = await getCallerMembership(req.user.id, orgId);
    if (!caller || !hasRoleAccess(caller.role as OrgRole, "manager")) {
      res.status(403).json({ error: "Manager access required to manage door locks" });
      return;
    }
    if (typeof doorKey !== "string" || !doorKey.trim()) {
      res.status(400).json({ error: "doorKey required" });
      return;
    }
    const resolvedSpaceType = ORG_DOOR_SPACE_TYPES.includes(spaceType) ? spaceType : "office";
    const resolvedMinRole = (ORG_ROLES as readonly string[]).includes(minRole) ? minRole : "specialist";
    const key = doorKey.trim();

    // A door key is globally unique — a space is locked by at most one org. Block
    // hijacking another org's lock.
    const [existing] = await db
      .select({ orgId: orgDoorLocksTable.orgId })
      .from(orgDoorLocksTable)
      .where(eq(orgDoorLocksTable.doorKey, key))
      .limit(1);
    if (existing && existing.orgId !== orgId) {
      res.status(409).json({ error: "This space is already secured by another organization" });
      return;
    }

    const isUpdatingOwn = !!existing && existing.orgId === orgId;
    const hasPasscode = typeof passcode === "string" && passcode.length > 0;
    // A passcode is mandatory when CREATING a lock. When updating an existing
    // lock you may omit it to keep the current code (metadata-only update); if
    // supplied it must still meet the minimum length.
    if (hasPasscode && passcode.length < MIN_DOOR_PASSCODE_LEN) {
      res.status(400).json({ error: `Passcode must be at least ${MIN_DOOR_PASSCODE_LEN} characters` });
      return;
    }
    if (!hasPasscode && !isUpdatingOwn) {
      res.status(400).json({ error: `Passcode must be at least ${MIN_DOOR_PASSCODE_LEN} characters` });
      return;
    }

    // Metadata-only update — keep the existing passcode untouched.
    if (isUpdatingOwn && !hasPasscode) {
      const [updated] = await db
        .update(orgDoorLocksTable)
        .set({
          label: typeof label === "string" ? label.slice(0, 200) : null,
          spaceType: resolvedSpaceType,
          minRole: resolvedMinRole,
          updatedAt: new Date(),
        })
        .where(eq(orgDoorLocksTable.doorKey, key))
        .returning();
      res.json({ ok: true, door: updated });
      return;
    }

    const passcodeHash = await hashAccessCode(passcode);
    const [row] = await db
      .insert(orgDoorLocksTable)
      .values({
        orgId,
        doorKey: key,
        label: typeof label === "string" ? label.slice(0, 200) : null,
        spaceType: resolvedSpaceType,
        passcode: passcodeHash,
        minRole: resolvedMinRole,
        createdByUserId: req.user.id,
      })
      .onConflictDoUpdate({
        target: orgDoorLocksTable.doorKey,
        set: {
          label: typeof label === "string" ? label.slice(0, 200) : null,
          spaceType: resolvedSpaceType,
          passcode: passcodeHash,
          minRole: resolvedMinRole,
          updatedAt: new Date(),
        },
      })
      .returning();
    const { passcode: _passcode, ...safeDoor } = row;
    res.json({ ok: true, door: safeDoor });
  } catch (e) {
    console.error("[Org Doors] upsert failed:", e);
    res.status(500).json({ error: "Failed to save door lock" });
  }
});

// DELETE /api/orgs/:orgId/doors/:doorKey — remove a door lock (manager+).
router.delete("/orgs/:orgId/doors/:doorKey", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const orgId = Number(req.params.orgId);
  if (!Number.isFinite(orgId)) { res.status(400).json({ error: "Invalid orgId" }); return; }
  const doorKey = req.params.doorKey;
  try {
    const caller = await getCallerMembership(req.user.id, orgId);
    if (!caller || !hasRoleAccess(caller.role as OrgRole, "manager")) {
      res.status(403).json({ error: "Manager access required to manage door locks" });
      return;
    }
    await db
      .delete(orgDoorLocksTable)
      .where(and(eq(orgDoorLocksTable.orgId, orgId), eq(orgDoorLocksTable.doorKey, doorKey)));
    res.json({ ok: true });
  } catch (e) {
    console.error("[Org Doors] delete failed:", e);
    res.status(500).json({ error: "Failed to delete door lock" });
  }
});

// ── Org permissions matrix ───────────────────────────────────────────────────
// GET returns the org's effective policy + the self-describing catalog + the
// caller's own abilities, so the UI can render a straightforward matrix and know
// what the current user is allowed to do. Any active member (or owner) may read.
router.get("/orgs/:orgId/permissions", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const orgId = parseInt(req.params.orgId, 10);
  if (!Number.isFinite(orgId)) {
    res.status(400).json({ error: "Invalid org id" });
    return;
  }

  const [org] = await db
    .select({ ownerUserId: organizationsTable.ownerUserId })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }
  const caller = await getCallerMembership(userId, orgId);
  const isOwner = org.ownerUserId === userId;
  if (!caller && !isOwner) {
    res.status(403).json({ error: "Membership required" });
    return;
  }
  const callerRole = (isOwner ? "owner" : caller!.role) as OrgRole;

  const policy = await getOrgPermissionPolicy(orgId);
  const catalog = ORG_PERMISSION_KEYS.map((key) => ({
    key,
    ...ORG_PERMISSION_META[key],
    minRole: policy[key],
    defaultMinRole: DEFAULT_PERMISSION_MIN_ROLE[key],
    callerAllowed: isOwner || hasRoleAccess(callerRole, policy[key]),
  }));

  const canEdit = isOwner || hasRoleAccess(callerRole, policy["org.settings"]);
  res.json({ orgId, roles: ORG_ROLES, callerRole, canEdit, permissions: catalog });
});

// PUT updates one or more permission min-roles. Only a caller who holds the
// `org.settings` permission (or the owner) may edit. `org.settings` itself is
// floored at director so an org can never lock itself out of its own settings.
router.put("/orgs/:orgId/permissions", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const orgId = parseInt(req.params.orgId, 10);
  if (!Number.isFinite(orgId)) {
    res.status(400).json({ error: "Invalid org id" });
    return;
  }

  const gate = await canDoInOrg(userId, orgId, "org.settings");
  if (!gate.allowed) {
    res.status(403).json({ error: "You don't have permission to edit org settings" });
    return;
  }

  const updates = req.body?.permissions;
  if (!updates || typeof updates !== "object") {
    res.status(400).json({ error: "Expected { permissions: { key: minRole } }" });
    return;
  }

  const rows: Array<{ key: OrgPermissionKey; minRole: OrgRole }> = [];
  for (const [key, value] of Object.entries(updates)) {
    if (!isOrgPermissionKey(key)) {
      res.status(400).json({ error: `Unknown permission key: ${key}` });
      return;
    }
    if (typeof value !== "string" || !(ORG_ROLES as readonly string[]).includes(value) || value === "owner") {
      res.status(400).json({ error: `Invalid role for ${key}` });
      return;
    }
    // Guard: never let settings control rise above director (avoid lock-out).
    if (key === "org.settings" && !hasRoleAccess("director", value as OrgRole)) {
      res.status(400).json({ error: "org.settings cannot require a role higher than director" });
      return;
    }
    rows.push({ key, minRole: value as OrgRole });
  }
  if (rows.length === 0) {
    res.status(400).json({ error: "No valid permissions provided" });
    return;
  }

  for (const r of rows) {
    await db
      .insert(orgPermissionsTable)
      .values({ orgId, permissionKey: r.key, minRole: r.minRole, updatedByUserId: userId })
      .onConflictDoUpdate({
        target: [orgPermissionsTable.orgId, orgPermissionsTable.permissionKey],
        set: { minRole: r.minRole, updatedByUserId: userId, updatedAt: new Date() },
      });
  }

  const policy = await getOrgPermissionPolicy(orgId);
  res.json({ ok: true, policy });
});

export default router;
