import { Router, type Request, type Response } from "express";
import {
  db,
  leadRecordsTable,
  leadNotesTable,
  leadImportsTable,
  orgMembersTable,
  callHistoryTable,
  usersTable,
  type LeadRecord,
} from "@workspace/db";
import { eq, and, or, ilike, desc } from "drizzle-orm";
import { broadcastLeadEvent } from "../chatServer";

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

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current.trim()); current = ""; }
      else { current += ch; }
    }
  }
  result.push(current.trim());
  return result;
}

export async function createOrUpdateLeadFromScreening(
  callerNumber: string,
  userId: string,
  outcome: string,
  extracted: { callerName?: string; company?: string; reason?: string; email?: string } | null,
): Promise<void> {
  try {
    const membership = await getCallerOrgRole(userId);
    if (!membership) return;

    const normalizedPhone = callerNumber.replace(/\D/g, "");
    const leads = await db.select().from(leadRecordsTable).where(eq(leadRecordsTable.orgId, membership.orgId));
    const existingLead = leads.find(l => l.phone.replace(/\D/g, "").endsWith(normalizedPhone.slice(-10)) || normalizedPhone.endsWith(l.phone.replace(/\D/g, "").slice(-10)));

    if (existingLead) {
      const statusMap: Record<string, string> = { transfer: "qualified", take_message: "contacted", end_call: "contacted" };
      const newStatus = statusMap[outcome] || existingLead.status;
      const existingNotes: string[] = existingLead.pabloNotesJson ? JSON.parse(existingLead.pabloNotesJson) : [];
      if (extracted?.reason) existingNotes.push(`[Screening] ${extracted.reason}`);
      const [updated] = await db.update(leadRecordsTable).set({
        status: newStatus,
        callCount: existingLead.callCount + 1,
        lastCalledAt: new Date(),
        pabloNotesJson: JSON.stringify(existingNotes),
      }).where(eq(leadRecordsTable.id, existingLead.id)).returning();
      if (updated) broadcastLeadEvent(membership.orgId, { type: 'lead_updated', lead: updated });
    } else {
      const e164Phone = normalizedPhone.length === 10 ? `+1${normalizedPhone}` : normalizedPhone.startsWith("1") && normalizedPhone.length === 11 ? `+${normalizedPhone}` : `+${normalizedPhone}`;
      const notesArr = extracted?.reason ? [`[Screening] ${extracted.reason}`] : [];
      const [newLead] = await db.insert(leadRecordsTable).values({
        orgId: membership.orgId,
        createdByUserId: userId,
        name: extracted?.callerName || callerNumber,
        phone: e164Phone,
        email: extracted?.email || "",
        company: extracted?.company || "",
        source: "inbound_transfer",
        status: outcome === "transfer" ? "qualified" : "contacted",
        assignedUserId: userId,
        callCount: 1,
        lastCalledAt: new Date(),
        pabloNotesJson: JSON.stringify(notesArr),
      }).returning();
      if (newLead) broadcastLeadEvent(membership.orgId, { type: 'lead_created', lead: newLead });
    }
  } catch (e: unknown) {
    console.error("[Leads] Screening lead upsert error:", e instanceof Error ? e.message : "Unknown");
  }
}

export async function updateLeadFromPabloCall(
  callerNumber: string,
  userId: string,
  outcome: string,
  transcript: string | null,
  pabloNotes: string | null,
): Promise<void> {
  try {
    const membership = await getCallerOrgRole(userId);
    if (!membership) return;

    const normalizedPhone = callerNumber.replace(/\D/g, "");
    const leads = await db.select().from(leadRecordsTable).where(eq(leadRecordsTable.orgId, membership.orgId));
    const lead = leads.find(l => l.phone.replace(/\D/g, "").endsWith(normalizedPhone.slice(-10)) || normalizedPhone.endsWith(l.phone.replace(/\D/g, "").slice(-10)));
    if (!lead) return;

    const statusMap: Record<string, string> = {
      transfer: "qualified",
      take_message: "contacted",
      end_call: "contacted",
      create_lead: "new",
    };
    const newStatus = statusMap[outcome] || lead.status;

    const existingNotes: string[] = lead.pabloNotesJson ? JSON.parse(lead.pabloNotesJson) : [];
    if (pabloNotes) existingNotes.push(pabloNotes);
    if (transcript) existingNotes.push(`[Transcript] ${transcript.slice(0, 500)}`);

    const [updated] = await db.update(leadRecordsTable).set({
      status: newStatus === "new" ? lead.status : newStatus,
      callCount: lead.callCount + 1,
      lastCalledAt: new Date(),
      pabloNotesJson: JSON.stringify(existingNotes),
    }).where(eq(leadRecordsTable.id, lead.id)).returning();
    if (updated) broadcastLeadEvent(membership.orgId, { type: 'lead_updated', lead: updated });
  } catch (e: unknown) {
    console.error("[Leads] Pablo call update error:", e instanceof Error ? e.message : "Unknown");
  }
}

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

router.get("/leads", async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Login required" }); return; }

  const membership = await getCallerOrgRole(userId);
  if (!membership) { res.status(403).json({ error: "You must be part of an organization to access leads" }); return; }

  const { search, status, assignedTo } = req.query as { search?: string; status?: string; assignedTo?: string };

  const conditions = [eq(leadRecordsTable.orgId, membership.orgId)];

  if (status && typeof status === "string") {
    conditions.push(eq(leadRecordsTable.status, status));
  }
  if (assignedTo && typeof assignedTo === "string") {
    conditions.push(eq(leadRecordsTable.assignedUserId, assignedTo));
  }
  if (search && typeof search === "string" && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    conditions.push(
      or(
        ilike(leadRecordsTable.name, q),
        ilike(leadRecordsTable.phone, q),
        ilike(leadRecordsTable.email, q),
        ilike(leadRecordsTable.company, q),
        ilike(leadRecordsTable.jobTitle, q),
      )!
    );
  }

  const leads = await db.select().from(leadRecordsTable)
    .where(and(...conditions))
    .orderBy(desc(leadRecordsTable.updatedAt));

  const members = await db.select({
    userId: orgMembersTable.userId,
    role: orgMembersTable.role,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
  }).from(orgMembersTable)
    .innerJoin(usersTable, eq(orgMembersTable.userId, usersTable.id))
    .where(and(eq(orgMembersTable.orgId, membership.orgId), eq(orgMembersTable.status, "active")));

  const memberMap: Record<string, string> = {};
  for (const m of members) {
    memberMap[m.userId] = [m.firstName, m.lastName].filter(Boolean).join(" ") || "Unknown";
  }

  res.json({ leads, role: membership.role, orgId: membership.orgId, members: memberMap });
});

router.get("/leads/members", async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Login required" }); return; }

  const membership = await getCallerOrgRole(userId);
  if (!membership) { res.status(403).json({ error: "Organization required" }); return; }

  const members = await db.select({
    userId: orgMembersTable.userId,
    role: orgMembersTable.role,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
  }).from(orgMembersTable)
    .innerJoin(usersTable, eq(orgMembersTable.userId, usersTable.id))
    .where(and(eq(orgMembersTable.orgId, membership.orgId), eq(orgMembersTable.status, "active")));

  res.json({ members: members.map(m => ({ userId: m.userId, name: [m.firstName, m.lastName].filter(Boolean).join(" ") || "Unknown", role: m.role })) });
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

  const normalizedPhone = lead.phone.replace(/\D/g, "");
  const phoneVariants = [lead.phone];
  if (normalizedPhone.length >= 10) {
    phoneVariants.push(normalizedPhone);
    phoneVariants.push(`+${normalizedPhone}`);
    phoneVariants.push(`+1${normalizedPhone.slice(-10)}`);
    phoneVariants.push(normalizedPhone.slice(-10));
  }
  const callHistory = lead.phone ? await db.select().from(callHistoryTable).where(
    or(...phoneVariants.map(p => eq(callHistoryTable.recipientNumber, p)))
  ).orderBy(desc(callHistoryTable.startedAt)).limit(20) : [];

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

  broadcastLeadEvent(membership.orgId, { type: 'lead_created', lead });
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
  if (body.status !== undefined) {
    const validStatuses = ["new", "contacted", "qualified", "proposal", "closed_won", "closed_lost"];
    const st = String(body.status);
    if (!validStatuses.includes(st)) { res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }); return; }
    updates.status = st;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" }); return;
  }

  const [updated] = await db.update(leadRecordsTable).set(updates).where(eq(leadRecordsTable.id, leadId)).returning();
  broadcastLeadEvent(membership.orgId, { type: 'lead_updated', lead: updated });
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
  broadcastLeadEvent(membership.orgId, { type: 'lead_deleted', leadId });
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

  const { leads, fileName, csvText } = req.body ?? {};

  let parsedLeads: Array<{ name: string; phone?: string; email?: string; company?: string; jobTitle?: string }> = [];

  if (csvText && typeof csvText === "string") {
    const lines = csvText.split('\n').filter((l: string) => l.trim());
    if (lines.length < 2) { res.status(400).json({ error: "CSV must have a header row and at least one data row" }); return; }

    const headers = parseCSVLine(lines[0]).map((h: string) => h.toLowerCase().replace(/['"]/g, ''));
    const nameIdx = headers.findIndex((h: string) => h === 'name' || h === 'full_name' || h === 'fullname' || h === 'contact_name');
    const phoneIdx = headers.findIndex((h: string) => h === 'phone' || h === 'phone_number' || h === 'phonenumber' || h === 'mobile');
    const emailIdx = headers.findIndex((h: string) => h === 'email' || h === 'email_address');
    const companyIdx = headers.findIndex((h: string) => h === 'company' || h === 'organization' || h === 'org');
    const titleIdx = headers.findIndex((h: string) => h === 'title' || h === 'job_title' || h === 'jobtitle' || h === 'position' || h === 'role');

    if (nameIdx === -1) { res.status(400).json({ error: 'CSV must have a "name" column' }); return; }

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (!values[nameIdx]) continue;
      parsedLeads.push({
        name: values[nameIdx],
        phone: phoneIdx >= 0 ? (values[phoneIdx] || '') : '',
        email: emailIdx >= 0 ? (values[emailIdx] || '') : '',
        company: companyIdx >= 0 ? (values[companyIdx] || '') : '',
        jobTitle: titleIdx >= 0 ? (values[titleIdx] || '') : '',
      });
    }
  } else if (Array.isArray(leads) && leads.length > 0) {
    parsedLeads = leads;
  } else {
    res.status(400).json({ error: "Provide csvText (raw CSV string) or leads (JSON array of {name, phone, email, company, jobTitle})" }); return;
  }

  if (parsedLeads.length === 0) { res.status(400).json({ error: "No valid lead rows found" }); return; }

  const [importRecord] = await db.insert(leadImportsTable).values({
    orgId: membership.orgId,
    uploadedByUserId: userId,
    fileName: fileName || "import.csv",
    totalRecords: parsedLeads.length,
  }).returning();

  let successCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < parsedLeads.length; i++) {
    const row = parsedLeads[i];
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
        jobTitle: row.jobTitle ? String(row.jobTitle).trim() : "",
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

  broadcastLeadEvent(membership.orgId, { type: 'leads_imported', importId: importRecord.id, count: successCount });
  res.json({ importId: importRecord.id, total: parsedLeads.length, success: successCount, errors: errorCount, errorDetails: errors.slice(0, 10) });
});

export default router;
