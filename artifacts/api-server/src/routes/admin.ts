import { Router, type Request, type Response } from "express";
import {
  db,
  usersTable,
  organizationsTable,
  orgMembersTable,
  bansTable,
  ORG_ROLE_HIERARCHY,
  type OrgRole,
} from "@workspace/db";
import { eq, and, desc, sql, ilike, or, count } from "drizzle-orm";
import { isOwnerEmail } from "../lib/plan";

const router = Router();

const ADMIN_ROLES = ["owner", "ceo", "executive", "director", "manager"] as const;

function requireAuth(req: Request, res: Response): req is Request & { user: Express.User } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

function getHighestRole(memberships: { role: string }[]): string | null {
  if (memberships.length === 0) return null;
  let highest: string | null = null;
  let highestLevel = -1;
  for (const m of memberships) {
    const level = ORG_ROLE_HIERARCHY[m.role as OrgRole] ?? 0;
    if (level > highestLevel) {
      highestLevel = level;
      highest = m.role;
    }
  }
  return highest;
}

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  if (!requireAuth(req, res)) return false;
  const user = req.user!;
  if (isOwnerEmail(user.email ?? undefined)) return true;

  const memberships = await db
    .select({ role: orgMembersTable.role })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, user.id), eq(orgMembersTable.status, "active")));

  const highestRole = getHighestRole(memberships);
  if (!highestRole || !(ADMIN_ROLES as readonly string[]).includes(highestRole)) {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

router.get("/admin/users", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
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

  res.json({ users, total, page, limit });
});

router.get("/admin/users/:userId", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const { userId } = req.params;

  const rows = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (rows.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

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

  const bans = await db
    .select()
    .from(bansTable)
    .where(eq(bansTable.userId, userId))
    .orderBy(desc(bansTable.createdAt));

  res.json({ user: rows[0], memberships, bans });
});

router.get("/admin/orgs", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const search = (req.query.search as string) ?? "";
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
  const offset = (page - 1) * limit;

  const memberCountSql = db
    .select({
      orgId: orgMembersTable.orgId,
      memberCount: count().as("member_count"),
    })
    .from(orgMembersTable)
    .where(eq(orgMembersTable.status, "active"))
    .groupBy(orgMembersTable.orgId)
    .as("mc");

  let baseQuery = db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      industry: organizationsTable.industry,
      size: organizationsTable.size,
      ownerUserId: organizationsTable.ownerUserId,
      isDeveloper: organizationsTable.isDeveloper,
      createdAt: organizationsTable.createdAt,
      memberCount: sql<number>`COALESCE(${memberCountSql.memberCount}, 0)`.as("member_count"),
    })
    .from(organizationsTable)
    .leftJoin(memberCountSql, eq(organizationsTable.id, memberCountSql.orgId));

  if (search) {
    baseQuery = baseQuery.where(ilike(organizationsTable.name, `%${search}%`)) as typeof baseQuery;
  }

  const orgs = await baseQuery
    .orderBy(desc(organizationsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(organizationsTable);

  res.json({ orgs, total, page, limit });
});

router.get("/admin/bans", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const activeOnly = req.query.active !== "false";
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
  const offset = (page - 1) * limit;

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
    .limit(limit)
    .offset(offset);

  res.json({ bans });
});

router.post("/admin/bans", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const { userId, reason, type, expiresAt } = req.body;

  if (!userId || !reason) {
    res.status(400).json({ error: "userId and reason are required" });
    return;
  }

  const userRows = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (userRows.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (isOwnerEmail(userRows[0].email ?? undefined)) {
    res.status(403).json({ error: "Cannot ban platform owner" });
    return;
  }

  const [ban] = await db.insert(bansTable).values({
    userId,
    reason,
    bannedBy: req.user!.id,
    type: type === "permanent" ? "permanent" : "temporary",
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  }).returning();

  res.json({ ban });
});

router.patch("/admin/bans/:banId", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const banId = parseInt(req.params.banId);
  const { active } = req.body;

  if (isNaN(banId)) {
    res.status(400).json({ error: "Invalid ban ID" });
    return;
  }

  const [updated] = await db
    .update(bansTable)
    .set({ active: !!active })
    .where(eq(bansTable.id, banId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Ban not found" });
    return;
  }

  res.json({ ban: updated });
});

router.get("/admin/stats", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;

  const [userCount] = await db.select({ value: count() }).from(usersTable);
  const [orgCount] = await db.select({ value: count() }).from(organizationsTable);
  const [activeBans] = await db.select({ value: count() }).from(bansTable).where(eq(bansTable.active, true));

  res.json({
    totalUsers: userCount.value,
    totalOrgs: orgCount.value,
    activeBans: activeBans.value,
  });
});

export default router;
