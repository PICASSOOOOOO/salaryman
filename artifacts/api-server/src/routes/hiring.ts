import { Router, type IRouter, type Request, type Response } from "express";
import { db, jobListingsTable, applicantsTable, staffTable, stageTransitionsTable, worldBusinessesTable, salarymanSavesTable, employeePerformanceNotesTable, onboardingChecklistsTable, departmentsTable, usersTable } from "@workspace/db";
import { eq, and, sql, gte } from "drizzle-orm";
import {
  createJobListing,
  createApplicant,
  updateApplicant,
  isServiceError,
} from "../lib/hiring-service";

const router: IRouter = Router();

const VALID_JOB_STATUSES = ["open", "closed", "filled"] as const;
const VALID_STAFF_STATUSES = ["active", "on leave", "terminated", "departed"] as const;

async function requirePro(req: Request, res: Response): Promise<boolean> {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

router.get("/tools/hiring/stats", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const userId = req.user!.id;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [openPositions] = await db.select({ count: sql<number>`count(*)::int` }).from(jobListingsTable)
    .where(and(eq(jobListingsTable.userId, userId), eq(jobListingsTable.status, "open")));
  const [totalApplicants] = await db.select({ count: sql<number>`count(*)::int` }).from(applicantsTable)
    .where(eq(applicantsTable.userId, userId));
  const [activeStaff] = await db.select({ count: sql<number>`count(*)::int` }).from(staffTable)
    .where(and(eq(staffTable.userId, userId), eq(staffTable.status, "active")));
  const [filledThisMonth] = await db.select({ count: sql<number>`count(*)::int` }).from(jobListingsTable)
    .where(and(eq(jobListingsTable.userId, userId), eq(jobListingsTable.status, "filled"), gte(jobListingsTable.updatedAt, monthStart)));

  res.json({
    openPositions: openPositions.count,
    totalApplicants: totalApplicants.count,
    activeStaff: activeStaff.count,
    filledThisMonth: filledThisMonth.count,
  });
});

router.get("/tools/hiring/jobs", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const rows = await db.select().from(jobListingsTable)
    .where(eq(jobListingsTable.userId, req.user!.id))
    .orderBy(sql`${jobListingsTable.createdAt} DESC`);
  res.json({ jobs: rows });
});

router.post("/tools/hiring/jobs", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const result = await createJobListing(req.user!.id, req.body);
  if (isServiceError(result)) { res.status(result.status).json({ error: result.error }); return; }
  res.status(201).json({ job: result });
});

router.put("/tools/hiring/jobs/:id", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const id = Number(req.params.id);
  const body = req.body as { title?: string; description?: string; requirements?: string; salaryMin?: number | null; salaryMax?: number | null; status?: string };
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.requirements !== undefined) updates.requirements = body.requirements;
  if (body.salaryMin !== undefined) updates.salaryMin = body.salaryMin != null ? Number(body.salaryMin) : null;
  if (body.salaryMax !== undefined) updates.salaryMax = body.salaryMax != null ? Number(body.salaryMax) : null;
  if (body.status !== undefined && (VALID_JOB_STATUSES as readonly string[]).includes(body.status)) updates.status = body.status;
  const [updated] = await db.update(jobListingsTable)
    .set(updates)
    .where(and(eq(jobListingsTable.id, id), eq(jobListingsTable.userId, req.user!.id)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ job: updated });
});

router.delete("/tools/hiring/jobs/:id", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const id = Number(req.params.id);
  const deleted = await db.delete(jobListingsTable)
    .where(and(eq(jobListingsTable.id, id), eq(jobListingsTable.userId, req.user!.id)))
    .returning();
  if (deleted.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true });
});

router.get("/tools/hiring/applicants", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const jobId = req.query.jobId ? Number(req.query.jobId) : undefined;
  const conditions = [eq(applicantsTable.userId, req.user!.id)];
  if (jobId) conditions.push(eq(applicantsTable.jobId, jobId));
  const rows = await db.select().from(applicantsTable)
    .where(and(...conditions))
    .orderBy(sql`${applicantsTable.createdAt} DESC`);
  res.json({ applicants: rows });
});

router.post("/tools/hiring/applicants", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const result = await createApplicant(req.user!.id, req.body);
  if (isServiceError(result)) { res.status(result.status).json({ error: result.error }); return; }
  res.status(201).json({ applicant: result });
});

router.put("/tools/hiring/applicants/:id", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const result = await updateApplicant(req.user!.id, Number(req.params.id), req.body);
  if (isServiceError(result)) { res.status(result.status).json({ error: result.error }); return; }
  res.json({ applicant: result });
});

router.delete("/tools/hiring/applicants/:id", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const id = Number(req.params.id);
  const deleted = await db.delete(applicantsTable)
    .where(and(eq(applicantsTable.id, id), eq(applicantsTable.userId, req.user!.id)))
    .returning();
  if (deleted.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true });
});

router.get("/tools/hiring/staff", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const rows = await db.select().from(staffTable)
    .where(eq(staffTable.userId, req.user!.id))
    .orderBy(sql`${staffTable.createdAt} DESC`);
  res.json({ staff: rows });
});

async function findLinkedUserId(email: string): Promise<string | null> {
  const cleaned = email.trim().toLowerCase();
  if (!cleaned) return null;
  const [u] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${cleaned}`);
  return u?.id ?? null;
}

router.post("/tools/hiring/staff", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const body = req.body as {
    name?: string; role?: string; department?: string; salary?: number | null;
    status?: string; startDate?: string; email?: string; phone?: string;
  };
  if (!body.name?.trim()) { res.status(400).json({ error: "Name required" }); return; }
  const email = body.email?.trim() ?? "";
  const phone = body.phone?.trim() ?? "";
  const linkedUserId = email ? await findLinkedUserId(email) : null;
  const [record] = await db.insert(staffTable).values({
    userId: req.user!.id,
    name: body.name.trim(),
    role: body.role?.trim() ?? "",
    department: body.department?.trim() ?? "",
    salary: body.salary != null ? Number(body.salary) : null,
    status: (VALID_STAFF_STATUSES as readonly string[]).includes(body.status ?? "") ? body.status! : "active",
    startDate: body.startDate ? new Date(body.startDate) : new Date(),
    email,
    phone,
    linkedUserId,
  }).returning();
  res.status(201).json({ staff: record, linked: !!linkedUserId });
});

router.put("/tools/hiring/staff/:id", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const id = Number(req.params.id);
  const body = req.body as {
    status?: string; role?: string; salary?: number | null; department?: string;
    endDate?: string | null; offboardingNotes?: string; name?: string;
    assignedOffice?: string; assignedDesk?: string; assignedTerminal?: string;
    email?: string; phone?: string;
  };
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.status !== undefined && (VALID_STAFF_STATUSES as readonly string[]).includes(body.status)) updates.status = body.status;
  if (body.role !== undefined) updates.role = body.role;
  if (body.name !== undefined && body.name.trim()) updates.name = body.name.trim();
  if (body.salary !== undefined) updates.salary = body.salary != null ? Number(body.salary) : null;
  if (body.department !== undefined) updates.department = body.department;
  if (body.offboardingNotes !== undefined) updates.offboardingNotes = body.offboardingNotes;
  if (body.endDate !== undefined) updates.endDate = body.endDate ? new Date(body.endDate) : null;
  if (body.assignedOffice !== undefined) updates.assignedOffice = body.assignedOffice;
  if (body.assignedDesk !== undefined) updates.assignedDesk = body.assignedDesk;
  if (body.assignedTerminal !== undefined) updates.assignedTerminal = body.assignedTerminal;
  if (body.phone !== undefined) updates.phone = body.phone.trim();
  if (body.email !== undefined) {
    const newEmail = body.email.trim();
    updates.email = newEmail;
    // Re-resolve linked user when email changes
    updates.linkedUserId = newEmail ? await findLinkedUserId(newEmail) : null;
  }
  const [updated] = await db.update(staffTable)
    .set(updates)
    .where(and(eq(staffTable.id, id), eq(staffTable.userId, req.user!.id)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ staff: updated });
});

// ── Departments ───────────────────────────────────────────────────────────────

router.get("/tools/hiring/departments", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const rows = await db.select().from(departmentsTable)
    .where(eq(departmentsTable.userId, req.user!.id))
    .orderBy(departmentsTable.name);
  res.json({ departments: rows });
});

router.post("/tools/hiring/departments", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const body = req.body as { name?: string; description?: string; color?: string };
  if (!body.name?.trim()) { res.status(400).json({ error: "Department name required" }); return; }
  const name = body.name.trim().slice(0, 100);
  const [existing] = await db.select().from(departmentsTable)
    .where(and(eq(departmentsTable.userId, req.user!.id), eq(departmentsTable.name, name)));
  if (existing) { res.status(409).json({ error: "Department already exists", department: existing }); return; }
  const [record] = await db.insert(departmentsTable).values({
    userId: req.user!.id,
    name,
    description: body.description?.trim().slice(0, 500) ?? "",
    color: body.color?.trim().slice(0, 20) ?? "sky",
  }).returning();
  res.status(201).json({ department: record });
});

router.put("/tools/hiring/departments/:id", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const id = Number(req.params.id);
  const body = req.body as { name?: string; description?: string; color?: string };
  const userId = req.user!.id;

  try {
    const result = await db.transaction(async (tx) => {
      const updates: Record<string, unknown> = {};
      let renameFrom: string | null = null;

      if (body.name !== undefined) {
        const newName = body.name.trim().slice(0, 100);
        if (!newName) throw Object.assign(new Error("Name cannot be empty"), { httpStatus: 400 });
        const [current] = await tx.select().from(departmentsTable)
          .where(and(eq(departmentsTable.id, id), eq(departmentsTable.userId, userId)));
        if (!current) throw Object.assign(new Error("Not found"), { httpStatus: 404 });
        if (current.name !== newName) {
          // Duplicate-name guard: ensure no other dept owned by this user already uses newName
          const [conflict] = await tx.select().from(departmentsTable)
            .where(and(eq(departmentsTable.userId, userId), eq(departmentsTable.name, newName)));
          if (conflict && conflict.id !== id) {
            throw Object.assign(new Error("Department name already in use"), { httpStatus: 409 });
          }
          renameFrom = current.name;
        }
        updates.name = newName;
      }
      if (body.description !== undefined) updates.description = body.description.slice(0, 500);
      if (body.color !== undefined) updates.color = body.color.slice(0, 20);

      const [updated] = await tx.update(departmentsTable)
        .set(updates)
        .where(and(eq(departmentsTable.id, id), eq(departmentsTable.userId, userId)))
        .returning();
      if (!updated) throw Object.assign(new Error("Not found"), { httpStatus: 404 });

      if (renameFrom) {
        await tx.update(staffTable)
          .set({ department: updated.name, updatedAt: new Date() })
          .where(and(eq(staffTable.userId, userId), eq(staffTable.department, renameFrom)));
      }
      return updated;
    });
    res.json({ department: result });
  } catch (err) {
    const e = err as { httpStatus?: number; message?: string };
    res.status(e.httpStatus ?? 500).json({ error: e.message ?? "Server error" });
  }
});

router.delete("/tools/hiring/departments/:id", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const id = Number(req.params.id);
  const userId = req.user!.id;
  try {
    const ok = await db.transaction(async (tx) => {
      const [dept] = await tx.select().from(departmentsTable)
        .where(and(eq(departmentsTable.id, id), eq(departmentsTable.userId, userId)));
      if (!dept) throw Object.assign(new Error("Not found"), { httpStatus: 404 });
      await tx.update(staffTable)
        .set({ department: "", updatedAt: new Date() })
        .where(and(eq(staffTable.userId, userId), eq(staffTable.department, dept.name)));
      await tx.delete(departmentsTable).where(eq(departmentsTable.id, id));
      return true;
    });
    res.json({ ok });
  } catch (err) {
    const e = err as { httpStatus?: number; message?: string };
    res.status(e.httpStatus ?? 500).json({ error: e.message ?? "Server error" });
  }
});

router.delete("/tools/hiring/staff/:id", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const id = Number(req.params.id);
  const deleted = await db.delete(staffTable)
    .where(and(eq(staffTable.id, id), eq(staffTable.userId, req.user!.id)))
    .returning();
  if (deleted.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true });
});

// ── Performance Notes ─────────────────────────────────────────────────────────

router.get("/tools/hiring/staff/:id/performance-notes", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const staffId = Number(req.params.id);
  const [member] = await db.select().from(staffTable)
    .where(and(eq(staffTable.id, staffId), eq(staffTable.userId, req.user!.id)));
  if (!member) { res.status(404).json({ error: "Not found" }); return; }
  const rows = await db.select().from(employeePerformanceNotesTable)
    .where(eq(employeePerformanceNotesTable.staffId, staffId))
    .orderBy(sql`${employeePerformanceNotesTable.createdAt} DESC`);
  res.json({ notes: rows });
});

router.post("/tools/hiring/staff/:id/performance-notes", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const staffId = Number(req.params.id);
  const [member] = await db.select().from(staffTable)
    .where(and(eq(staffTable.id, staffId), eq(staffTable.userId, req.user!.id)));
  if (!member) { res.status(404).json({ error: "Not found" }); return; }
  const { note } = req.body as { note?: string };
  if (!note?.trim()) { res.status(400).json({ error: "Note required" }); return; }
  const [record] = await db.insert(employeePerformanceNotesTable).values({
    staffId,
    userId: req.user!.id,
    note: note.trim(),
  }).returning();
  res.status(201).json({ note: record });
});

router.delete("/tools/hiring/performance-notes/:noteId", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const id = Number(req.params.noteId);
  const deleted = await db.delete(employeePerformanceNotesTable)
    .where(and(eq(employeePerformanceNotesTable.id, id), eq(employeePerformanceNotesTable.userId, req.user!.id)))
    .returning();
  if (deleted.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true });
});

// ── Onboarding Checklists ─────────────────────────────────────────────────────

const DEFAULT_CHECKLIST_ITEMS = [
  "Send welcome email",
  "Set up workstation / equipment",
  "Create system accounts (email, Slack, etc.)",
  "Complete I-9 / tax paperwork",
  "Introduce to team",
  "Review company handbook",
  "Schedule first week 1-on-1",
  "Assign first tasks or projects",
];

router.get("/tools/hiring/staff/:id/onboarding", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const staffId = Number(req.params.id);
  const [member] = await db.select().from(staffTable)
    .where(and(eq(staffTable.id, staffId), eq(staffTable.userId, req.user!.id)));
  if (!member) { res.status(404).json({ error: "Not found" }); return; }
  let rows = await db.select().from(onboardingChecklistsTable)
    .where(eq(onboardingChecklistsTable.staffId, staffId))
    .orderBy(onboardingChecklistsTable.sortOrder);
  if (rows.length === 0) {
    const defaults = DEFAULT_CHECKLIST_ITEMS.map((item, i) => ({
      staffId,
      userId: req.user!.id,
      item,
      completed: false,
      sortOrder: i,
    }));
    rows = await db.insert(onboardingChecklistsTable).values(defaults).returning();
    rows.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  res.json({ items: rows });
});

router.put("/tools/hiring/onboarding/:itemId", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const id = Number(req.params.itemId);
  const { completed } = req.body as { completed?: boolean };
  const updates: Record<string, unknown> = {};
  if (completed !== undefined) {
    updates.completed = completed;
    updates.completedAt = completed ? new Date() : null;
  }
  const [updated] = await db.update(onboardingChecklistsTable)
    .set(updates)
    .where(and(eq(onboardingChecklistsTable.id, id), eq(onboardingChecklistsTable.userId, req.user!.id)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ item: updated });
});

router.post("/tools/hiring/staff/:id/onboarding", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const staffId = Number(req.params.id);
  const [member] = await db.select().from(staffTable)
    .where(and(eq(staffTable.id, staffId), eq(staffTable.userId, req.user!.id)));
  if (!member) { res.status(404).json({ error: "Not found" }); return; }
  const { item } = req.body as { item?: string };
  if (!item?.trim()) { res.status(400).json({ error: "Item text required" }); return; }
  const [record] = await db.insert(onboardingChecklistsTable).values({
    staffId,
    userId: req.user!.id,
    item: item.trim(),
    sortOrder: 999,
  }).returning();
  res.status(201).json({ item: record });
});

router.get("/tools/hiring/employees", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Login required" }); return; }
  try {
    const rows = await db
      .select({
        staffName: staffTable.name,
        staffRole: staffTable.role,
        playerName: salarymanSavesTable.charName,
        companyName: worldBusinessesTable.companyName,
      })
      .from(staffTable)
      .innerJoin(salarymanSavesTable, eq(staffTable.userId, salarymanSavesTable.userId))
      .innerJoin(
        worldBusinessesTable,
        and(
          eq(worldBusinessesTable.playerName, salarymanSavesTable.charName),
          sql`${worldBusinessesTable.sessionId} IS NOT NULL`,
        ),
      )
      .where(eq(staffTable.status, "active"));

    const byOwner: Record<string, { name: string; role: string; businessName: string }[]> = {};
    for (const r of rows) {
      const owner = r.playerName.toUpperCase();
      if (!byOwner[owner]) byOwner[owner] = [];
      byOwner[owner].push({ name: r.staffName, role: r.staffRole, businessName: r.companyName ?? "" });
    }
    res.json({ employeesByOwner: byOwner });
  } catch (err: unknown) {
    console.error("[Hiring] world-employees error:", err instanceof Error ? err.message : err);
    res.json({ employeesByOwner: {} });
  }
});

router.get("/tools/hiring/applicants/:id/transitions", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const applicantId = Number(req.params.id);
  const [applicant] = await db.select().from(applicantsTable)
    .where(and(eq(applicantsTable.id, applicantId), eq(applicantsTable.userId, req.user!.id)));
  if (!applicant) { res.status(404).json({ error: "Not found" }); return; }
  const rows = await db.select().from(stageTransitionsTable)
    .where(eq(stageTransitionsTable.applicantId, applicantId))
    .orderBy(sql`${stageTransitionsTable.transitionedAt} ASC`);
  res.json({ transitions: rows });
});

export default router;
