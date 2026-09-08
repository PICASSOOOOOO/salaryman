import { Router, type Request, type Response } from "express";
import { eq, and, or, desc, sql, inArray } from "drizzle-orm";
import {
  db,
  jobPostingsTable,
  jobApplicationsTable,
  jobContractsTable,
  organizationsTable,
  orgMembersTable,
  usersTable,
  notificationsTable,
  worldBusinessesTable,
  balanceSheetTxTable,
  type OrgRole,
  hasRoleAccess,
  JOB_POSTING_STATUSES,
} from "@workspace/db";

const router = Router();

function requireAuth(req: Request, res: Response): req is Request & { user: Express.User } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

async function getCallerOrgMembership(userId: string, orgId: number) {
  const [m] = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.status, "active")))
    .limit(1);
  return m ?? null;
}

// ── Public job board ──────────────────────────────────────────────────────────

// GET /labor/jobs — public listing with optional filters
router.get("/labor/jobs", async (req, res) => {
  try {
    const { industry, status, orgId, limit: rawLimit } = req.query;
    const lim = Math.min(Number(rawLimit) || 50, 100);
    const conds = [eq(jobPostingsTable.status, "open")];
    if (status && (JOB_POSTING_STATUSES as readonly string[]).includes(String(status))) {
      conds[0] = eq(jobPostingsTable.status, String(status) as typeof JOB_POSTING_STATUSES[number]);
    }
    if (industry) conds.push(eq(jobPostingsTable.industry, String(industry)));
    if (orgId) conds.push(eq(jobPostingsTable.orgId, Number(orgId)));

    const rows = await db
      .select({
        posting: jobPostingsTable,
        orgName: organizationsTable.name,
        orgIndustry: organizationsTable.industry,
      })
      .from(jobPostingsTable)
      .innerJoin(organizationsTable, eq(organizationsTable.id, jobPostingsTable.orgId))
      .where(and(...conds))
      .orderBy(desc(jobPostingsTable.createdAt))
      .limit(lim);

    const applicantCounts = rows.length > 0
      ? await db
          .select({
            postingId: jobApplicationsTable.postingId,
            count: sql<number>`count(*)::int`,
          })
          .from(jobApplicationsTable)
          .where(inArray(jobApplicationsTable.postingId, rows.map(r => r.posting.id)))
          .groupBy(jobApplicationsTable.postingId)
      : [];
    const countMap = new Map(applicantCounts.map(r => [r.postingId, r.count]));

    res.json({
      jobs: rows.map(r => ({
        ...r.posting,
        orgName: r.orgName,
        orgIndustry: r.orgIndustry,
        applicantCount: countMap.get(r.posting.id) ?? 0,
      })),
    });
  } catch (e) {
    console.error("[Labor] list jobs failed:", e);
    res.status(500).json({ error: "Failed to load jobs" });
  }
});

// POST /labor/jobs — org admin creates a posting
router.post("/labor/jobs", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const { orgId, title, industry, payRateFiat, requiredSkillTier, slots, description } = req.body ?? {};

  if (!orgId || !title?.trim()) {
    res.status(400).json({ error: "orgId and title are required" });
    return;
  }

  const member = await getCallerOrgMembership(userId, Number(orgId));
  if (!member || !hasRoleAccess(member.role as OrgRole, "manager")) {
    res.status(403).json({ error: "Manager role required to post jobs" });
    return;
  }

  try {
    const [posting] = await db
      .insert(jobPostingsTable)
      .values({
        orgId: Number(orgId),
        title: String(title).trim().slice(0, 200),
        industry: String(industry || "").trim().slice(0, 80),
        payRateFiat: String(Math.max(0, Number(payRateFiat) || 0)),
        requiredSkillTier: Math.max(0, Number(requiredSkillTier) || 0),
        slots: Math.max(1, Number(slots) || 1),
        description: String(description || "").trim(),
        status: "open",
        createdByUserId: userId,
      })
      .returning();

    res.status(201).json({ posting });
  } catch (e) {
    console.error("[Labor] create posting failed:", e);
    res.status(500).json({ error: "Failed to create posting" });
  }
});

// PUT /labor/jobs/:id — org admin updates a posting
router.put("/labor/jobs/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const postingId = Number(req.params.id);

  const [existing] = await db.select().from(jobPostingsTable).where(eq(jobPostingsTable.id, postingId)).limit(1);
  if (!existing) { res.status(404).json({ error: "Posting not found" }); return; }

  const member = await getCallerOrgMembership(userId, existing.orgId);
  if (!member || !hasRoleAccess(member.role as OrgRole, "manager")) {
    res.status(403).json({ error: "Manager role required" });
    return;
  }

  const { title, industry, payRateFiat, requiredSkillTier, slots, description, status } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = String(title).trim().slice(0, 200);
  if (industry !== undefined) updates.industry = String(industry).trim().slice(0, 80);
  if (payRateFiat !== undefined) updates.payRateFiat = String(Math.max(0, Number(payRateFiat)));
  if (requiredSkillTier !== undefined) updates.requiredSkillTier = Math.max(0, Number(requiredSkillTier));
  if (slots !== undefined) updates.slots = Math.max(1, Number(slots));
  if (description !== undefined) updates.description = String(description).trim();
  if (status !== undefined && (JOB_POSTING_STATUSES as readonly string[]).includes(String(status))) {
    updates.status = status;
  }

  const [updated] = await db.update(jobPostingsTable).set(updates).where(eq(jobPostingsTable.id, postingId)).returning();
  res.json({ posting: updated });
});

// DELETE /labor/jobs/:id — org admin closes/removes a posting
router.delete("/labor/jobs/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const postingId = Number(req.params.id);

  const [existing] = await db.select().from(jobPostingsTable).where(eq(jobPostingsTable.id, postingId)).limit(1);
  if (!existing) { res.status(404).json({ error: "Posting not found" }); return; }

  const member = await getCallerOrgMembership(userId, existing.orgId);
  if (!member || !hasRoleAccess(member.role as OrgRole, "manager")) {
    res.status(403).json({ error: "Manager role required" });
    return;
  }

  await db.update(jobPostingsTable).set({ status: "closed" }).where(eq(jobPostingsTable.id, postingId));
  res.json({ ok: true });
});

// GET /labor/jobs/:id/applicants — org admin views applicants for a posting
router.get("/labor/jobs/:id/applicants", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const postingId = Number(req.params.id);

  const [existing] = await db.select().from(jobPostingsTable).where(eq(jobPostingsTable.id, postingId)).limit(1);
  if (!existing) { res.status(404).json({ error: "Posting not found" }); return; }

  const member = await getCallerOrgMembership(userId, existing.orgId);
  if (!member || !hasRoleAccess(member.role as OrgRole, "manager")) {
    res.status(403).json({ error: "Manager role required" });
    return;
  }

  const rows = await db
    .select({
      application: jobApplicationsTable,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      profileImageUrl: usersTable.profileImageUrl,
    })
    .from(jobApplicationsTable)
    .leftJoin(usersTable, eq(usersTable.id, jobApplicationsTable.applicantUserId))
    .where(eq(jobApplicationsTable.postingId, postingId))
    .orderBy(desc(jobApplicationsTable.createdAt));

  res.json({ applicants: rows });
});

// ── Player apply ──────────────────────────────────────────────────────────────

// POST /labor/jobs/:id/apply — player applies to a posting
router.post("/labor/jobs/:id/apply", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const postingId = Number(req.params.id);

  const [posting] = await db.select().from(jobPostingsTable).where(eq(jobPostingsTable.id, postingId)).limit(1);
  if (!posting || posting.status !== "open") {
    res.status(404).json({ error: "Job not found or no longer open" });
    return;
  }

  const existing = await db
    .select({ id: jobApplicationsTable.id })
    .from(jobApplicationsTable)
    .where(and(eq(jobApplicationsTable.postingId, postingId), eq(jobApplicationsTable.applicantUserId, userId)))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "You have already applied to this posting" });
    return;
  }

  const { coverNote } = req.body ?? {};

  try {
    const [app] = await db
      .insert(jobApplicationsTable)
      .values({
        postingId,
        applicantUserId: userId,
        coverNote: String(coverNote || "").trim().slice(0, 2000),
        status: "pending",
      })
      .returning();

    // Notify org managers about the new application
    try {
      const managers = await db
        .select({ userId: orgMembersTable.userId })
        .from(orgMembersTable)
        .where(
          and(
            eq(orgMembersTable.orgId, posting.orgId),
            eq(orgMembersTable.status, "active"),
            inArray(orgMembersTable.role, ["owner", "ceo", "executive", "director", "manager"]),
          )
        );
      const [org] = await db.select({ name: organizationsTable.name }).from(organizationsTable).where(eq(organizationsTable.id, posting.orgId)).limit(1);
      const [applicant] = await db.select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      const applicantName = [applicant?.firstName, applicant?.lastName].filter(Boolean).join(" ") || applicant?.email || "A candidate";
      if (managers.length > 0) {
        await db.insert(notificationsTable).values(
          managers.map(m => ({
            userId: m.userId,
            type: "job_application",
            title: `New application for ${posting.title}`,
            body: `${applicantName} applied to ${posting.title} at ${org?.name ?? "your org"}.`,
            link: `/business/jobs?posting=${postingId}&tab=applicants`,
          }))
        );
      }
    } catch (e) {
      console.error("[Labor] notify managers failed:", e);
    }

    res.status(201).json({ application: app });
  } catch (e: any) {
    if (e?.code === "23505") {
      res.status(409).json({ error: "You have already applied to this posting" });
      return;
    }
    console.error("[Labor] apply failed:", e);
    res.status(500).json({ error: "Failed to apply" });
  }
});

// ── Offer flow ────────────────────────────────────────────────────────────────

// POST /labor/jobs/:id/offer — org sends an offer to an applicant → creates a pending job_contract
router.post("/labor/jobs/:id/offer", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const postingId = Number(req.params.id);
  const { applicantUserId, roleTitle, payRateFiat, rights } = req.body ?? {};

  if (!applicantUserId) {
    res.status(400).json({ error: "applicantUserId required" });
    return;
  }

  const [posting] = await db.select().from(jobPostingsTable).where(eq(jobPostingsTable.id, postingId)).limit(1);
  if (!posting) { res.status(404).json({ error: "Posting not found" }); return; }

  const member = await getCallerOrgMembership(userId, posting.orgId);
  if (!member || !hasRoleAccess(member.role as OrgRole, "manager")) {
    res.status(403).json({ error: "Manager role required" });
    return;
  }

  // Confirm this user applied
  const [application] = await db
    .select()
    .from(jobApplicationsTable)
    .where(and(eq(jobApplicationsTable.postingId, postingId), eq(jobApplicationsTable.applicantUserId, String(applicantUserId))))
    .limit(1);
  if (!application) {
    res.status(404).json({ error: "No application from this user for this posting" });
    return;
  }

  try {
    const [contract] = await db
      .insert(jobContractsTable)
      .values({
        userId: String(applicantUserId),
        orgId: posting.orgId,
        postingId,
        roleTitle: String(roleTitle || posting.title).trim().slice(0, 200),
        payRateFiat: String(Math.max(0, Number(payRateFiat) || Number(posting.payRateFiat))),
        rightsJson: Array.isArray(rights) ? rights : [],
        status: "pending",
      })
      .returning();

    // Mark application as offered
    await db.update(jobApplicationsTable).set({ status: "offered" }).where(eq(jobApplicationsTable.id, application.id));

    // Notify the player
    try {
      const [org] = await db.select({ name: organizationsTable.name }).from(organizationsTable).where(eq(organizationsTable.id, posting.orgId)).limit(1);
      await db.insert(notificationsTable).values({
        userId: String(applicantUserId),
        type: "job_offer",
        title: `Job offer from ${org?.name ?? "an org"}`,
        body: `You received an offer for the role: ${contract.roleTitle}. Pay: ƒ${Number(contract.payRateFiat).toLocaleString()}/hr.`,
        link: `/business/jobs?tab=my-contracts`,
      });
    } catch (e) {
      console.error("[Labor] notify player of offer failed:", e);
    }

    res.status(201).json({ contract });
  } catch (e) {
    console.error("[Labor] send offer failed:", e);
    res.status(500).json({ error: "Failed to send offer" });
  }
});

// ── Contract lifecycle ────────────────────────────────────────────────────────

// POST /labor/contracts/:id/accept — player accepts a contract
router.post("/labor/contracts/:id/accept", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const contractId = Number(req.params.id);

  const [contract] = await db.select().from(jobContractsTable).where(eq(jobContractsTable.id, contractId)).limit(1);
  if (!contract || contract.userId !== userId) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  if (contract.status !== "pending") {
    res.status(400).json({ error: "Contract is not pending" });
    return;
  }

  const now = new Date();
  const [updated] = await db
    .update(jobContractsTable)
    .set({ status: "active", startedAt: now })
    .where(eq(jobContractsTable.id, contractId))
    .returning();

  // Mark posting slot filled if all slots taken
  if (contract.postingId) {
    const activeContracts = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobContractsTable)
      .where(and(eq(jobContractsTable.postingId, contract.postingId), eq(jobContractsTable.status, "active")));
    const [posting] = await db.select({ slots: jobPostingsTable.slots }).from(jobPostingsTable).where(eq(jobPostingsTable.id, contract.postingId!)).limit(1);
    if (posting && (activeContracts[0]?.count ?? 0) >= posting.slots) {
      await db.update(jobPostingsTable).set({ status: "filled" }).where(eq(jobPostingsTable.id, contract.postingId!));
    }
  }

  // Notify org managers
  try {
    const [user] = await db.select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "A player";
    const managers = await db
      .select({ userId: orgMembersTable.userId })
      .from(orgMembersTable)
      .where(and(eq(orgMembersTable.orgId, contract.orgId), eq(orgMembersTable.status, "active"), inArray(orgMembersTable.role, ["owner", "ceo", "executive", "director", "manager"])));
    if (managers.length > 0) {
      await db.insert(notificationsTable).values(
        managers.map(m => ({
          userId: m.userId,
          type: "job_accepted",
          title: `${userName} accepted the offer`,
          body: `${userName} accepted the role: ${contract.roleTitle}.`,
          link: `/business/jobs?tab=contracts`,
        }))
      );
    }
  } catch (e) {
    console.error("[Labor] notify managers of accept failed:", e);
  }

  res.json({ contract: updated });
});

// POST /labor/contracts/:id/decline — player declines a contract
router.post("/labor/contracts/:id/decline", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const contractId = Number(req.params.id);

  const [contract] = await db.select().from(jobContractsTable).where(eq(jobContractsTable.id, contractId)).limit(1);
  if (!contract || contract.userId !== userId) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  if (contract.status !== "pending") {
    res.status(400).json({ error: "Contract is not pending" });
    return;
  }

  const [updated] = await db
    .update(jobContractsTable)
    .set({ status: "declined", endedAt: new Date() })
    .where(eq(jobContractsTable.id, contractId))
    .returning();

  // Notify org
  try {
    const [user] = await db.select({ firstName: usersTable.firstName, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const userName = user?.firstName || user?.email || "A candidate";
    const [orgOwner] = await db.select({ ownerUserId: organizationsTable.ownerUserId }).from(organizationsTable).where(eq(organizationsTable.id, contract.orgId)).limit(1);
    if (orgOwner?.ownerUserId) {
      await db.insert(notificationsTable).values({
        userId: orgOwner.ownerUserId,
        type: "job_declined",
        title: `${userName} declined the offer`,
        body: `${userName} declined the role: ${contract.roleTitle}.`,
        link: `/business/jobs`,
      });
    }
  } catch (e) {
    console.error("[Labor] notify of decline failed:", e);
  }

  res.json({ contract: updated });
});

// POST /labor/contracts/:id/terminate — org terminates employment (firing)
router.post("/labor/contracts/:id/terminate", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const contractId = Number(req.params.id);

  const [contract] = await db.select().from(jobContractsTable).where(eq(jobContractsTable.id, contractId)).limit(1);
  if (!contract) { res.status(404).json({ error: "Contract not found" }); return; }

  const member = await getCallerOrgMembership(userId, contract.orgId);
  if (!member || !hasRoleAccess(member.role as OrgRole, "manager")) {
    res.status(403).json({ error: "Manager role required to terminate contracts" });
    return;
  }
  if (contract.status !== "active") {
    res.status(400).json({ error: "Contract is not active" });
    return;
  }

  const now = new Date();
  // Wrongful dismissal check: < 24hr notice = auto severance (= 1 week pay)
  const startedAt = contract.startedAt ? new Date(contract.startedAt) : null;
  const hoursEmployed = startedAt ? (now.getTime() - startedAt.getTime()) / 3_600_000 : Infinity;
  const { cause } = req.body ?? {};
  const wrongfulDismissal = !cause && hoursEmployed < 24;
  const severanceAmount = wrongfulDismissal ? Number(contract.payRateFiat) * 40 : 0; // 40 hrs pay

  const [updated] = await db
    .update(jobContractsTable)
    .set({
      status: "terminated",
      endedAt: now,
      terminatedBy: userId,
      severancePaid: wrongfulDismissal,
    })
    .where(eq(jobContractsTable.id, contractId))
    .returning();

  // Deduct severance from org owner's balance sheet
  if (wrongfulDismissal && severanceAmount > 0) {
    try {
      const [org] = await db.select({ ownerUserId: organizationsTable.ownerUserId }).from(organizationsTable).where(eq(organizationsTable.id, contract.orgId)).limit(1);
      const txDate = now.toISOString().slice(0, 10);
      if (org?.ownerUserId) {
        await db.insert(balanceSheetTxTable).values({
          userId: org.ownerUserId,
          type: "debit",
          amount: String(severanceAmount),
          description: `Wrongful dismissal severance: ${contract.roleTitle}`,
          category: "payroll",
          txDate,
        });
        // Credit the terminated player
        await db.insert(balanceSheetTxTable).values({
          userId: contract.userId,
          type: "credit",
          amount: String(severanceAmount),
          description: `Severance payment from employment termination`,
          category: "income",
          txDate,
        });
      }
    } catch (e) {
      console.error("[Labor] severance deduction failed:", e);
    }
  }

  // Notify the fired player
  try {
    const [org] = await db.select({ name: organizationsTable.name }).from(organizationsTable).where(eq(organizationsTable.id, contract.orgId)).limit(1);
    await db.insert(notificationsTable).values({
      userId: contract.userId,
      type: "job_terminated",
      title: `Your employment at ${org?.name ?? "your employer"} has ended`,
      body: wrongfulDismissal
        ? `Your role ${contract.roleTitle} was terminated. You received ƒ${severanceAmount.toLocaleString()} severance.`
        : `Your role ${contract.roleTitle} was terminated${cause ? `: ${cause}` : ""}.`,
      link: `/business/jobs?tab=my-contracts`,
    });
  } catch (e) {
    console.error("[Labor] notify termination failed:", e);
  }

  res.json({ contract: updated, severancePaid: wrongfulDismissal, severanceAmount });
});

// ── Player's own contracts / applications ─────────────────────────────────────

// GET /labor/my/contracts — player views their contract history
router.get("/labor/my/contracts", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;

  const rows = await db
    .select({
      contract: jobContractsTable,
      orgName: organizationsTable.name,
      orgIndustry: organizationsTable.industry,
    })
    .from(jobContractsTable)
    .innerJoin(organizationsTable, eq(organizationsTable.id, jobContractsTable.orgId))
    .where(eq(jobContractsTable.userId, userId))
    .orderBy(desc(jobContractsTable.createdAt));

  res.json({ contracts: rows.map(r => ({ ...r.contract, orgName: r.orgName, orgIndustry: r.orgIndustry })) });
});

// GET /labor/my/applications — player views their applications
router.get("/labor/my/applications", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;

  const rows = await db
    .select({
      application: jobApplicationsTable,
      postingTitle: jobPostingsTable.title,
      postingIndustry: jobPostingsTable.industry,
      postingPayRate: jobPostingsTable.payRateFiat,
      orgName: organizationsTable.name,
    })
    .from(jobApplicationsTable)
    .innerJoin(jobPostingsTable, eq(jobPostingsTable.id, jobApplicationsTable.postingId))
    .innerJoin(organizationsTable, eq(organizationsTable.id, jobPostingsTable.orgId))
    .where(eq(jobApplicationsTable.applicantUserId, userId))
    .orderBy(desc(jobApplicationsTable.createdAt));

  res.json({ applications: rows.map(r => ({ ...r.application, postingTitle: r.postingTitle, postingIndustry: r.postingIndustry, postingPayRate: r.postingPayRate, orgName: r.orgName })) });
});

// ── Looking for Work flag ─────────────────────────────────────────────────────

// PUT /labor/looking-for-work — player toggles LFW flag (stored in world_businesses.meta)
router.put("/labor/looking-for-work", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const { enabled } = req.body ?? {};

  await db
    .update(worldBusinessesTable)
    .set({ meta: sql`COALESCE(meta, '{}'::jsonb) || ${JSON.stringify({ lookingForWork: !!enabled })}::jsonb` })
    .where(eq(worldBusinessesTable.userId, userId));

  res.json({ ok: true, lookingForWork: !!enabled });
});

// GET /labor/looking-for-work — get caller's LFW status
router.get("/labor/looking-for-work", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;

  const [wb] = await db
    .select({ meta: worldBusinessesTable.meta })
    .from(worldBusinessesTable)
    .where(eq(worldBusinessesTable.userId, userId))
    .limit(1);

  const meta = (wb?.meta as Record<string, unknown> | null) ?? {};
  res.json({ lookingForWork: !!meta.lookingForWork });
});

// GET /labor/workers — org admin searches available workers (LFW = true)
router.get("/labor/workers", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const { orgId, industry } = req.query;

  if (!orgId) { res.status(400).json({ error: "orgId required" }); return; }

  const member = await getCallerOrgMembership(userId, Number(orgId));
  if (!member || !hasRoleAccess(member.role as OrgRole, "manager")) {
    res.status(403).json({ error: "Manager role required" });
    return;
  }

  const rows = await db
    .select({
      userId: worldBusinessesTable.userId,
      playerName: worldBusinessesTable.playerName,
      industry: worldBusinessesTable.industry,
      meta: worldBusinessesTable.meta,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      profileImageUrl: usersTable.profileImageUrl,
    })
    .from(worldBusinessesTable)
    .leftJoin(usersTable, eq(usersTable.id, worldBusinessesTable.userId))
    .where(sql`${worldBusinessesTable.meta}->>'lookingForWork' = 'true'`);

  const filtered = industry
    ? rows.filter(r => r.industry?.toLowerCase().includes(String(industry).toLowerCase()))
    : rows;

  res.json({
    workers: filtered.map(r => ({
      userId: r.userId,
      playerName: r.playerName,
      industry: r.industry,
      firstName: r.firstName,
      lastName: r.lastName,
      profileImageUrl: r.profileImageUrl,
    })),
  });
});

// ── Org contracts (for Team Management) ──────────────────────────────────────

// GET /labor/orgs/:orgId/contracts — org admin sees all active contracts
router.get("/labor/orgs/:orgId/contracts", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const orgId = Number(req.params.orgId);

  const member = await getCallerOrgMembership(userId, orgId);
  if (!member || !hasRoleAccess(member.role as OrgRole, "manager")) {
    res.status(403).json({ error: "Manager role required" });
    return;
  }

  const rows = await db
    .select({
      contract: jobContractsTable,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      profileImageUrl: usersTable.profileImageUrl,
    })
    .from(jobContractsTable)
    .leftJoin(usersTable, eq(usersTable.id, jobContractsTable.userId))
    .where(and(eq(jobContractsTable.orgId, orgId), eq(jobContractsTable.status, "active")))
    .orderBy(desc(jobContractsTable.startedAt));

  res.json({ contracts: rows.map(r => ({ ...r.contract, firstName: r.firstName, lastName: r.lastName, email: r.email, profileImageUrl: r.profileImageUrl })) });
});

// GET /labor/employer-badge/:userId — get a player's active employment for profile badge
router.get("/labor/employer-badge/:userId", async (req, res) => {
  try {
    const [contract] = await db
      .select({
        contractId: jobContractsTable.id,
        roleTitle: jobContractsTable.roleTitle,
        payRateFiat: jobContractsTable.payRateFiat,
        startedAt: jobContractsTable.startedAt,
        orgName: organizationsTable.name,
        orgId: organizationsTable.id,
      })
      .from(jobContractsTable)
      .innerJoin(organizationsTable, eq(organizationsTable.id, jobContractsTable.orgId))
      .where(and(eq(jobContractsTable.userId, req.params.userId), eq(jobContractsTable.status, "active")))
      .orderBy(desc(jobContractsTable.startedAt))
      .limit(1);

    res.json({ contract: contract ?? null });
  } catch (e) {
    res.json({ contract: null });
  }
});

export default router;
