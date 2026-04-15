import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import {
  db,
  organizationsTable,
  orgMembersTable,
  orgFeatureGrantsTable,
  orgInvitesTable,
  orgPartnershipsTable,
  usersTable,
  notificationsTable,
  balanceSheetTxTable,
  FEATURE_KEYS,
  type FeatureKey,
  type OrgMember,
  type OrgRole,
  ORG_ROLES,
  hasRoleAccess,
  isReservedOrgName,
} from "@workspace/db";
import { eq, and, or, sql, inArray } from "drizzle-orm";
import { grantFeature, resolveFeatureKey } from "../lib/plan";
import { getStripe } from "./stripe";

const router = Router();

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
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    res.status(400).json({ error: "Organization name is required (min 2 characters)" });
    return;
  }

  if (isReservedOrgName(name)) {
    res.status(400).json({ error: "That organization name is reserved and cannot be used" });
    return;
  }

  const [existingOrg] = await db
    .select()
    .from(organizationsTable)
    .where(sql`lower(${organizationsTable.name}) = lower(${name.trim()})`);
  if (existingOrg) {
    res.status(400).json({ error: "An organization with that name already exists" });
    return;
  }

  let org: typeof organizationsTable.$inferSelect;
  try {
    const [inserted] = await db
      .insert(organizationsTable)
      .values({
        name: name.trim().toUpperCase(),
        industry: industry ? String(industry).trim() : null,
        size: size ? String(size).trim() : null,
        ownerUserId: userId,
      })
      .returning();
    org = inserted;
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr?.code === "23505") {
      res.status(400).json({ error: "An organization with that name already exists" });
      return;
    }
    throw err;
  }

  await db.insert(orgMembersTable).values({
    orgId: org.id,
    userId,
    role: "owner",
    featureBilling: "individual",
    status: "active",
    joinedAt: new Date(),
  });

  res.json({ org });
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

  const { name, industry, size } = (req.body ?? {}) as { name?: string; industry?: string; size?: string };
  const updates: { name?: string; industry?: string | null; size?: string | null } = {};

  if (name && typeof name === "string") {
    if (isReservedOrgName(name)) {
      res.status(400).json({ error: "That organization name is reserved and cannot be used" });
      return;
    }
    const [existingOrg] = await db
      .select()
      .from(organizationsTable)
      .where(sql`lower(${organizationsTable.name}) = lower(${name.trim()}) AND ${organizationsTable.id} != ${orgId}`);
    if (existingOrg) {
      res.status(400).json({ error: "An organization with that name already exists" });
      return;
    }
    updates.name = name.trim().toUpperCase();
  }

  if (industry !== undefined) updates.industry = industry ? String(industry).trim() : null;
  if (size !== undefined) updates.size = size ? String(size).trim() : null;

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
      res.status(400).json({ error: "An organization with that name already exists" });
      return;
    }
    throw err;
  }

  res.json({ org: updated });
});

router.post("/orgs/:orgId/invite", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const orgId = parseInt(req.params.orgId);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org ID" }); return; }

  const caller = await getCallerMembership(userId, orgId);
  if (!caller || !hasRoleAccess(caller.role as OrgRole, "manager")) {
    res.status(403).json({ error: "Not authorized" }); return;
  }

  const { email, username } = (req.body ?? {}) as { email?: string; username?: string };
  if (!email && !username) {
    res.status(400).json({ error: "email or username required" });
    return;
  }

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

  if (existingMember.length > 0) {
    await db
      .update(orgMembersTable)
      .set({ status: "active", joinedAt: new Date(), ...(developerSpawn ? { spawnLocation: developerSpawn } : {}) })
      .where(and(eq(orgMembersTable.orgId, invite.orgId), eq(orgMembersTable.userId, userId)));
  } else {
    await db.insert(orgMembersTable).values({
      orgId: invite.orgId,
      userId,
      role: "specialist",
      featureBilling: "individual",
      status: "active",
      invitedByUserId: invite.invitedByUserId,
      inviteEmail: invite.inviteEmail,
      joinedAt: new Date(),
      ...(developerSpawn ? { spawnLocation: developerSpawn } : {}),
    });
  }

  await db
    .update(orgInvitesTable)
    .set({ status: "accepted" })
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

router.put("/orgs/:orgId/members/:memberId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const callerId = req.user.id;
  const orgId = parseInt(req.params.orgId);
  const memberId = req.params.memberId;
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org ID" }); return; }

  const caller = await getCallerMembership(callerId, orgId);
  if (!caller || !hasRoleAccess(caller.role as OrgRole, "manager")) {
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

  const { role, department, spawnLocation, featureBilling, title, salary } = (req.body ?? {}) as {
    role?: string;
    department?: string | null;
    spawnLocation?: string | null;
    featureBilling?: string;
    title?: string | null;
    salary?: string | null;
  };

  const updates: {
    role?: string;
    department?: string | null;
    spawnLocation?: string | null;
    featureBilling?: string;
    title?: string | null;
    salary?: string | null;
  } = {};

  const assignableRoles: string[] = ORG_ROLES.filter(r => r !== "owner");
  if (role && assignableRoles.includes(role)) updates.role = role;
  if (department !== undefined) updates.department = department ? String(department).trim() : null;
  if (spawnLocation !== undefined) updates.spawnLocation = spawnLocation ? String(spawnLocation).trim() : null;
  if (featureBilling && ["company", "individual"].includes(featureBilling)) updates.featureBilling = featureBilling;
  if (title !== undefined) updates.title = title ? String(title).trim() : null;
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

  if (!isSelf && !hasRoleAccess(caller.role as OrgRole, "manager")) {
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

export default router;
