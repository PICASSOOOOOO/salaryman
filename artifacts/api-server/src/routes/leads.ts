import { Router, type Request, type Response } from "express";
import {
  db,
  leadRecordsTable,
  leadNotesTable,
  leadImportsTable,
  orgMembersTable,
  callHistoryTable,
  type LeadRecord,
} from "@workspace/db";
import { eq, and, or, ilike, desc, sql } from "drizzle-orm";

const router = Router();

function paramStr(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

function getAuthUserId(req: Request): string {
  if (req.isAuthenticated?.() && req.user?.id) return req.user.id;
  return "";
}

function getAuthUserName(req: Request): string {
  if (req.isAuthenticated?.() && req.user) {
    const u = req.user as { firstName?: string; lastName?: string };
    return [u.firstName, u.lastName].filter(Boolean).join(" ") || "Unknown";
  }
  return "Unknown";
}

async function getCallerOrgRole(userId: string): Promise<{ orgId: number; role: string } | null> {
  const rows = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")));
  if (rows.length === 0) return null;
  return { orgId: rows[0].orgId, role: rows[0].role };
}

function isAdmin(role: string): boolean {
  return role === "owner" || role === "manager";
}

router.get("/leads", async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Login required" }); return; }

  const membership = await getCallerOrgRole(userId);
  if (!membership) { res.status(403).json({ error: "You must be part of an organization to access leads" }); return; }

  const { search, status, assignedTo } = req.query as { search?: string; status?: string; assignedTo?: string };

  let query = db.select().from(leadRecordsTable).where(eq(leadRecordsTable.orgId, membership.orgId)).orderBy(desc(leadRecordsTable.updatedAt)).$dynamic();

  if (status && typeof status === "string") {
    query = query.where(and(eq(leadRecordsTable.orgId, membership.orgId), eq(leadRecordsTable.status, status)));
  }
  if (assignedTo && typeof assignedTo === "string") {
    query = query.where(and(eq(leadRecordsTable.orgId, membership.orgId), eq(leadRecordsTable.assignedUserId, assignedTo)));
  }

  let leads = await query;

  if (search && typeof search === "string" && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    leads = await db.select().from(leadRecordsTable).where(
      and(
        eq(leadRecordsTable.orgId, membership.orgId),
        or(
          ilike(leadRecordsTable.name, q),
          ilike(leadRecordsTable.phone, q),
          ilike(leadRecordsTable.email, q),
          ilike(leadRecordsTable.company, q),
          ilike(leadRecordsTable.jobTitle, q),
        )
      )
    ).orderBy(desc(leadRecordsTable.updatedAt));
  }

  res.json({ leads, role: membership.role, orgId: membership.orgId });
});

router.get("/leads/:id", async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Login required" }); return; }

  const membership = await getCallerOrgRole(userId);
  if (!membership) { res.status(403).json({ error: "Organization required" }); return; }

  const leadId = parseInt(paramStr(req.params.id));
  if (isNaN(leadId)) { res.status(400).json({ error: "Invalid lead ID" }); return; }

  const [lead] = await db.select().from(leadRecordsTable).where(and(eq(leadRecordsTable.id, leadId), eq(leadRecordsTable.orgId, membership.orgId)));
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }

  const notes = await db.select().from(leadNotesTable).where(eq(leadNotesTable.leadId, leadId)).orderBy(desc(leadNotesTable.createdAt));

  const callHistory = await db.select().from(callHistoryTable).where(
    and(
      eq(callHistoryTable.userId, lead.assignedUserId || userId),
      eq(callHistoryTable.recipientNumber, lead.phone)
    )
  ).orderBy(desc(callHistoryTable.startedAt)).limit(20);

  res.json({ lead, notes, callHistory, role: membership.role });
});

router.post("/leads", async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Login required" }); return; }

  const membership = await getCallerOrgRole(userId);
  if (!membership) { res.status(403).json({ error: "Organization required" }); return; }
  if (!isAdmin(membership.role)) { res.status(403).json({ error: "Admin access required to create leads" }); return; }

  const { name, phone, email, company, jobTitle, source, status, assignedUserId } = req.body ?? {};
  if (!name || typeof name !== "string" || name.trim().length < 1) {
    res.status(400).json({ error: "Lead name is required" }); return;
  }

  const [lead] = await db.insert(leadRecordsTable).values({
    orgId: membership.orgId,
    name: String(name).trim(),
    phone: phone ? String(phone).trim() : "",
    email: email ? String(email).trim() : "",
    company: company ? String(company).trim() : "",
    jobTitle: jobTitle ? String(jobTitle).trim() : "",
    source: source ? String(source).trim() : "manual",
    status: status || "new",
    assignedUserId: assignedUserId || null,
    createdByUserId: userId,
    isLocked: false,
  }).returning();

  res.json({ lead });
});

router.patch("/leads/:id", async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Login required" }); return; }

  const membership = await getCallerOrgRole(userId);
  if (!membership) { res.status(403).json({ error: "Organization required" }); return; }

  const leadId = parseInt(paramStr(req.params.id));
  if (isNaN(leadId)) { res.status(400).json({ error: "Invalid lead ID" }); return; }

  const [existing] = await db.select().from(leadRecordsTable).where(and(eq(leadRecordsTable.id, leadId), eq(leadRecordsTable.orgId, membership.orgId)));
  if (!existing) { res.status(404).json({ error: "Lead not found" }); return; }

  const body = req.body ?? {};
  const admin = isAdmin(membership.role);

  if (!admin) {
    const allowedFields = ["status"];
    const attempted = Object.keys(body).filter(k => !allowedFields.includes(k));
    if (attempted.length > 0) {
      res.status(403).json({ error: "Regular users can only update lead status. Use notes to add updates." });
      return;
    }
  }

  const updates: Partial<LeadRecord> = {};
  if (admin) {
    if (body.name !== undefined) updates.name = String(body.name).trim();
    if (body.phone !== undefined) updates.phone = String(body.phone).trim();
    if (body.email !== undefined) updates.email = String(body.email).trim();
    if (body.company !== undefined) updates.company = String(body.company).trim();
    if (body.jobTitle !== undefined) updates.jobTitle = String(body.jobTitle).trim();
    if (body.source !== undefined) updates.source = String(body.source).trim();
    if (body.assignedUserId !== undefined) updates.assignedUserId = body.assignedUserId || null;
  }
  if (body.status !== undefined) updates.status = String(body.status);

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" }); return;
  }

  const [updated] = await db.update(leadRecordsTable).set(updates).where(eq(leadRecordsTable.id, leadId)).returning();
  res.json({ lead: updated });
});

router.delete("/leads/:id", async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Login required" }); return; }

  const membership = await getCallerOrgRole(userId);
  if (!membership) { res.status(403).json({ error: "Organization required" }); return; }
  if (!isAdmin(membership.role)) { res.status(403).json({ error: "Admin access required to delete leads" }); return; }

  const leadId = parseInt(paramStr(req.params.id));
  if (isNaN(leadId)) { res.status(400).json({ error: "Invalid lead ID" }); return; }

  const [existing] = await db.select().from(leadRecordsTable).where(and(eq(leadRecordsTable.id, leadId), eq(leadRecordsTable.orgId, membership.orgId)));
  if (!existing) { res.status(404).json({ error: "Lead not found" }); return; }

  await db.delete(leadRecordsTable).where(eq(leadRecordsTable.id, leadId));
  res.json({ ok: true });
});

router.post("/leads/:id/notes", async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Login required" }); return; }

  const membership = await getCallerOrgRole(userId);
  if (!membership) { res.status(403).json({ error: "Organization required" }); return; }

  const leadId = parseInt(paramStr(req.params.id));
  if (isNaN(leadId)) { res.status(400).json({ error: "Invalid lead ID" }); return; }

  const [existing] = await db.select().from(leadRecordsTable).where(and(eq(leadRecordsTable.id, leadId), eq(leadRecordsTable.orgId, membership.orgId)));
  if (!existing) { res.status(404).json({ error: "Lead not found" }); return; }

  const { note } = req.body ?? {};
  if (!note || typeof note !== "string" || note.trim().length < 1) {
    res.status(400).json({ error: "Note text is required" }); return;
  }

  const userName = getAuthUserName(req);
  const [created] = await db.insert(leadNotesTable).values({
    leadId,
    userId,
    userName,
    note: note.trim(),
  }).returning();

  res.json({ note: created });
});

router.post("/leads/import", async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Login required" }); return; }

  const membership = await getCallerOrgRole(userId);
  if (!membership) { res.status(403).json({ error: "Organization required" }); return; }
  if (!isAdmin(membership.role)) { res.status(403).json({ error: "Admin access required to import leads" }); return; }

  const { leads, fileName } = req.body ?? {};
  if (!Array.isArray(leads) || leads.length === 0) {
    res.status(400).json({ error: "No leads data provided. Expected array of {name, phone, email, company, jobTitle}" }); return;
  }

  const [importRecord] = await db.insert(leadImportsTable).values({
    orgId: membership.orgId,
    uploadedByUserId: userId,
    fileName: fileName || "import.csv",
    totalRecords: leads.length,
  }).returning();

  let successCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < leads.length; i++) {
    const row = leads[i];
    if (!row.name || typeof row.name !== "string" || row.name.trim().length < 1) {
      errorCount++;
      errors.push(`Row ${i + 1}: Missing name`);
      continue;
    }
    try {
      await db.insert(leadRecordsTable).values({
        orgId: membership.orgId,
        importId: importRecord.id,
        isLocked: true,
        name: String(row.name).trim(),
        phone: row.phone ? String(row.phone).trim() : "",
        email: row.email ? String(row.email).trim() : "",
        company: row.company ? String(row.company).trim() : "",
        jobTitle: row.jobTitle || row.job_title || row.title ? String(row.jobTitle || row.job_title || row.title).trim() : "",
        source: "csv_import",
        status: "new",
        createdByUserId: userId,
      });
      successCount++;
    } catch (e: unknown) {
      errorCount++;
      errors.push(`Row ${i + 1}: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  }

  await db.update(leadImportsTable).set({
    successCount,
    errorCount,
    errorsJson: errors.length > 0 ? JSON.stringify(errors) : null,
  }).where(eq(leadImportsTable.id, importRecord.id));

  res.json({ importId: importRecord.id, total: leads.length, success: successCount, errors: errorCount, errorDetails: errors.slice(0, 10) });
});

router.get("/leads/export/csv", async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Login required" }); return; }

  const membership = await getCallerOrgRole(userId);
  if (!membership) { res.status(403).json({ error: "Organization required" }); return; }
  if (!isAdmin(membership.role)) { res.status(403).json({ error: "Admin access required to export leads" }); return; }

  const leads = await db.select().from(leadRecordsTable).where(eq(leadRecordsTable.orgId, membership.orgId)).orderBy(desc(leadRecordsTable.createdAt));

  const headers = ["Name", "Phone", "Email", "Company", "Job Title", "Status", "Source", "Call Count", "Created At"];
  const rows = leads.map(l => [
    `"${(l.name || "").replace(/"/g, '""')}"`,
    `"${(l.phone || "").replace(/"/g, '""')}"`,
    `"${(l.email || "").replace(/"/g, '""')}"`,
    `"${(l.company || "").replace(/"/g, '""')}"`,
    `"${(l.jobTitle || "").replace(/"/g, '""')}"`,
    l.status,
    l.source,
    String(l.callCount),
    l.createdAt ? new Date(l.createdAt).toISOString() : "",
  ].join(","));

  const csv = [headers.join(","), ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="leads-export-${Date.now()}.csv"`);
  res.send(csv);
});

router.get("/leads/imports", async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Login required" }); return; }

  const membership = await getCallerOrgRole(userId);
  if (!membership) { res.status(403).json({ error: "Organization required" }); return; }

  const imports = await db.select().from(leadImportsTable).where(eq(leadImportsTable.orgId, membership.orgId)).orderBy(desc(leadImportsTable.createdAt));
  res.json({ imports });
});

export default router;
