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
import multer from "multer";
import ExcelJS from "exceljs";
import { Readable } from "node:stream";

const router = Router();

// 10 MB cap is plenty for a CRM CSV/XLSX. Anything bigger almost certainly
// indicates the user attached the wrong file (e.g. a backup) and we'd rather
// fail fast than try to load it into memory.
const sheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/**
 * SINGLE SOURCE OF TRUTH for CRM column ↔ DB field mapping.
 *
 * Why this matters:
 * - Import and export both read this list, so a CSV/XLSX you download will
 *   import cleanly when re-uploaded (round-trip).
 * - Header matching is fuzzy (case-insensitive, ignores spaces, underscores,
 *   hyphens) so "Job Title", "job_title", "JOBTITLE" all hit the same field.
 * - `Business` is a user-facing alias for `company` so an org with multiple
 *   businesses can group leads by business name without a schema migration.
 *   The CRM is already org-scoped (orgId on every lead); this column lets the
 *   user further segment within that org.
 */
type LeadFieldKey = "name" | "phone" | "email" | "business" | "jobTitle" | "status" | "source" | "callCount" | "createdAt";

const LEAD_FIELDS: ReadonlyArray<{
  key: LeadFieldKey;
  header: string;          // canonical header used in EXPORTS
  aliases: string[];       // additional headers accepted on IMPORT (normalized)
  importable: boolean;     // whether this column can populate a new lead
}> = [
  { key: "name",      header: "Name",      aliases: ["fullname", "contactname", "leadname"], importable: true },
  { key: "phone",     header: "Phone",     aliases: ["phonenumber", "mobile", "cell", "tel"], importable: true },
  { key: "email",     header: "Email",     aliases: ["emailaddress", "mail"], importable: true },
  // "Business" is the primary header so users see the multi-business framing;
  // company/organization/org are kept as aliases for compatibility with stock
  // CRM exports from HubSpot, Salesforce, Google Contacts, etc.
  { key: "business",  header: "Business",  aliases: ["company", "organization", "org", "account", "businessname", "companyname"], importable: true },
  { key: "jobTitle",  header: "Job Title", aliases: ["title", "position", "role"], importable: true },
  { key: "status",    header: "Status",    aliases: [], importable: false },
  { key: "source",    header: "Source",    aliases: [], importable: false },
  { key: "callCount", header: "Call Count", aliases: [], importable: false },
  { key: "createdAt", header: "Created At", aliases: [], importable: false },
];

const normalizeHeader = (h: string): string =>
  String(h || "").toLowerCase().replace(/['"]/g, "").replace(/[\s_\-]+/g, "");

/** Map a row of header strings → index lookup keyed by LeadFieldKey. */
function indexHeaders(headers: string[]): Partial<Record<LeadFieldKey, number>> {
  const norm = headers.map(normalizeHeader);
  const out: Partial<Record<LeadFieldKey, number>> = {};
  for (const f of LEAD_FIELDS) {
    const candidates = [normalizeHeader(f.header), ...f.aliases.map(normalizeHeader)];
    const idx = norm.findIndex(h => candidates.includes(h));
    if (idx >= 0) out[f.key] = idx;
  }
  return out;
}

type ParsedLeadRow = { name: string; phone?: string; email?: string; company?: string; jobTitle?: string };

/** Build a ParsedLeadRow from a raw row + header index map. */
function rowToLead(values: (string | number | null | undefined)[], idx: Partial<Record<LeadFieldKey, number>>): ParsedLeadRow | null {
  const cell = (k: LeadFieldKey): string => {
    const i = idx[k];
    if (i === undefined || i < 0) return "";
    const v = values[i];
    return v === null || v === undefined ? "" : String(v).trim();
  };
  const name = cell("name");
  if (!name) return null;
  return {
    name,
    phone: cell("phone"),
    email: cell("email"),
    // "business" is the user-facing label; we store it in `company` so the
    // existing UI / export / search-by-company code keeps working unchanged.
    company: cell("business"),
    jobTitle: cell("jobTitle"),
  };
}

/** Parse an uploaded buffer (CSV or XLSX) into ParsedLeadRow[]. */
async function parseSheetBuffer(buf: Buffer, mimetype: string, originalName: string): Promise<{ rows: ParsedLeadRow[]; headerCount: number }> {
  const isXlsx = /sheet|excel|xlsx|xlsm|xlsb|xls/i.test(mimetype) || /\.(xlsx|xlsm|xlsb|xls)$/i.test(originalName);
  const workbook = new ExcelJS.Workbook();
  if (isXlsx) {
    await workbook.xlsx.load(buf as any);
  } else {
    const csv = buf.toString("utf8").replace(/^\uFEFF/, "");
    await workbook.csv.read(Readable.from([csv]));
  }
  const firstSheet = workbook.worksheets[0];
  if (!firstSheet) return { rows: [], headerCount: 0 };
  const aoa: (string | number | null | undefined)[][] = [];
  firstSheet.eachRow({ includeEmpty: true }, row => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      values[colNumber - 1] = cell.text;
    });
    aoa.push(values);
  });
  if (!aoa.length) return { rows: [], headerCount: 0 };
  const headerRow = (aoa[0] || []).map(v => String(v ?? "").trim());
  const idx = indexHeaders(headerRow);
  if (idx.name === undefined) {
    // No name column — caller will treat 0 rows as a hard error.
    return { rows: [], headerCount: headerRow.length };
  }
  const rows: ParsedLeadRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row || row.every(v => v === "" || v === null || v === undefined)) continue;
    const lead = rowToLead(row, idx);
    if (lead) rows.push(lead);
  }
  return { rows, headerCount: headerRow.length };
}

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

  // Optional ?business=Acme filter so an org can export leads for a single
  // business at a time. Matches the `company` field exactly (case-insensitive).
  const businessFilter = typeof req.query.business === "string" ? req.query.business.trim() : "";
  const baseWhere = eq(leadRecordsTable.orgId, membership.orgId);
  const leads = await db.select().from(leadRecordsTable)
    .where(businessFilter ? and(baseWhere, ilike(leadRecordsTable.company, businessFilter))! : baseWhere)
    .orderBy(desc(leadRecordsTable.createdAt));

  const rows = leads.map(l => buildExportRow(l));
  const csv = [LEAD_FIELDS.map(f => f.header).join(","), ...rows.map(r => r.map(csvCell).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="leads-export-${Date.now()}.csv"`);
  res.send(csv);
});

/**
 * Excel export — same column order as the CSV export so a user can download
 * either format, edit it in Excel/Numbers/Google Sheets, and re-upload it
 * through the same import endpoint without remapping anything.
 */
router.get("/leads/export/xlsx", async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Login required" }); return; }
  const membership = await getCallerOrgRole(userId);
  if (!membership) { res.status(403).json({ error: "Organization required" }); return; }
  if (!isAdmin(membership.role)) { res.status(403).json({ error: "Admin access required to export leads" }); return; }

  const businessFilter = typeof req.query.business === "string" ? req.query.business.trim() : "";
  const baseWhere = eq(leadRecordsTable.orgId, membership.orgId);
  const leads = await db.select().from(leadRecordsTable)
    .where(businessFilter ? and(baseWhere, ilike(leadRecordsTable.company, businessFilter))! : baseWhere)
    .orderBy(desc(leadRecordsTable.createdAt));

  // Apply the same formula-injection guard to XLSX cells so opening the
  // download in Excel can't execute attacker-controlled values.
  const guardCell = (v: string | number) => {
    if (typeof v !== "string" || v.length === 0) return v;
    const first = v.replace(/^[\s\u0000-\u001F]+/, "").charAt(0);
    return (first === "=" || first === "+" || first === "-" || first === "@" || first === "\t" || first === "\r") ? "'" + v : v;
  };
  const aoa: any[][] = [LEAD_FIELDS.map(f => f.header), ...leads.map(l => buildExportRow(l).map(guardCell))];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Leads");
  ws.addRows(aoa);
  // Column widths matched to typical content so the download opens looking
  // like a real spreadsheet rather than a wall of identically-sized columns.
  [28, 18, 28, 24, 22, 12, 14, 10, 22].forEach((width, i) => {
    ws.getColumn(i + 1).width = width;
  });
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="leads-export-${Date.now()}.xlsx"`);
  res.send(buf);
});

/**
 * CSV cell serializer with formula-injection neutralization.
 *
 * Excel / Numbers / Google Sheets will execute any cell whose first non-space
 * character is one of `= + - @` (and a few control chars). Since lead data is
 * user-supplied, an attacker could plant `=HYPERLINK(...)` or `=cmd|...` in a
 * Name field; opening the export would then fire the formula on the analyst's
 * machine. We prefix such cells with a single quote — the OWASP-recommended
 * mitigation — which forces spreadsheet apps to treat the value as text.
 */
function csvCell(v: string | number): string {
  let s = v == null ? "" : String(v);
  if (s.length > 0) {
    const first = s.replace(/^[\s\u0000-\u001F]+/, "").charAt(0);
    if (first === "=" || first === "+" || first === "-" || first === "@" || first === "\t" || first === "\r") {
      s = "'" + s;
    }
  }
  return `"${s.replace(/"/g, '""')}"`;
}

function buildExportRow(l: LeadRecord): (string | number)[] {
  // Order MUST match LEAD_FIELDS so import round-trips cleanly.
  return LEAD_FIELDS.map(f => {
    switch (f.key) {
      case "name":      return l.name || "";
      case "phone":     return l.phone || "";
      case "email":     return l.email || "";
      case "business":  return l.company || "";
      case "jobTitle":  return l.jobTitle || "";
      case "status":    return l.status || "";
      case "source":    return l.source || "";
      case "callCount": return l.callCount ?? 0;
      case "createdAt": return l.createdAt ? new Date(l.createdAt).toISOString() : "";
    }
  });
}

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

/**
 * Multipart upload for CSV / XLSX / XLS files. The browser sends the raw file
 * via FormData, we parse it server-side, and then run it through the same
 * insert path the JSON-body import uses.
 *
 * This is the recommended endpoint for the UI — JSON+csvText still works for
 * scripts and the legacy path.
 */
router.post("/leads/import-file", sheetUpload.single("file"), async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Login required" }); return; }
  const membership = await getCallerOrgRole(userId);
  if (!membership) { res.status(403).json({ error: "Organization required" }); return; }
  if (!isAdmin(membership.role)) { res.status(403).json({ error: "Admin access required to import leads" }); return; }

  const file = (req as any).file as { buffer: Buffer; mimetype: string; originalname: string } | undefined;
  if (!file || !file.buffer?.length) { res.status(400).json({ error: "No file uploaded (expected multipart field 'file')" }); return; }

  let parsed: { rows: ParsedLeadRow[]; headerCount: number };
  try {
    parsed = await parseSheetBuffer(file.buffer, file.mimetype || "", file.originalname || "");
  } catch (e) {
    res.status(400).json({ error: `Could not read file: ${e instanceof Error ? e.message : "unknown"}` });
    return;
  }
  if (parsed.headerCount === 0) { res.status(400).json({ error: "File appears empty (no header row)" }); return; }
  if (parsed.rows.length === 0) {
    res.status(400).json({ error: 'Could not find a "Name" column. Accepted headers: Name, Full Name, Contact Name. Other columns: Phone, Email, Business (or Company), Job Title.' });
    return;
  }

  // Optional ?business=Acme assigns/overrides the Business column for every
  // imported row — handy when an org uploads a sheet that's already filtered
  // to one business but has no Business column.
  const forcedBusiness = typeof req.body?.business === "string" ? req.body.business.trim() : "";
  if (forcedBusiness) parsed.rows = parsed.rows.map(r => ({ ...r, company: forcedBusiness }));

  const result = await insertLeadsForOrg({
    orgId: membership.orgId,
    userId,
    fileName: file.originalname || "upload",
    rows: parsed.rows,
  });
  broadcastLeadEvent(membership.orgId, { type: 'leads_imported', importId: result.importId, count: result.success });
  res.json(result);
});

/**
 * Shared insert path used by both `/leads/import` (JSON/csvText) and
 * `/leads/import-file` (multipart). Keeping a single insert routine means
 * both code paths log to the same `lead_imports` audit table identically.
 */
async function insertLeadsForOrg(args: { orgId: number; userId: string; fileName: string; rows: ParsedLeadRow[] }) {
  const { orgId, userId, fileName, rows } = args;
  const [importRecord] = await db.insert(leadImportsTable).values({
    orgId,
    uploadedByUserId: userId,
    fileName,
    totalRecords: rows.length,
  }).returning();

  let successCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.name || typeof row.name !== "string" || row.name.trim().length < 1) {
      errorCount++;
      errors.push(`Row ${i + 1}: Missing name`);
      continue;
    }
    try {
      await db.insert(leadRecordsTable).values({
        orgId,
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

  return { importId: importRecord.id, total: rows.length, success: successCount, errors: errorCount, errorDetails: errors.slice(0, 10) };
}

router.post("/leads/import", async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Login required" }); return; }

  const membership = await getCallerOrgRole(userId);
  if (!membership) { res.status(403).json({ error: "Organization required" }); return; }
  if (!isAdmin(membership.role)) { res.status(403).json({ error: "Admin access required to import leads" }); return; }

  const { leads, fileName, csvText } = req.body ?? {};

  let parsedLeads: ParsedLeadRow[] = [];

  if (csvText && typeof csvText === "string") {
    // Route CSV text through the same SheetJS-backed parser the file upload
    // uses. Single code path = identical header matching and edge cases.
    try {
      const { rows, headerCount } = await parseSheetBuffer(Buffer.from(csvText, "utf8"), "text/csv", fileName || "import.csv");
      if (headerCount === 0) { res.status(400).json({ error: "CSV must have a header row and at least one data row" }); return; }
      if (rows.length === 0) { res.status(400).json({ error: 'CSV must include a "Name" (or full_name / contact_name) column with at least one row' }); return; }
      parsedLeads = rows;
    } catch (e) {
      res.status(400).json({ error: `Could not parse CSV: ${e instanceof Error ? e.message : "unknown"}` });
      return;
    }
  } else if (Array.isArray(leads) && leads.length > 0) {
    // Normalize JSON-body aliases so callers can send `business` OR `company`
    // (matching the file-import column aliasing).
    parsedLeads = leads.map((row: any) => ({
      name: row?.name,
      phone: row?.phone,
      email: row?.email,
      company: row?.business ?? row?.company,
      jobTitle: row?.jobTitle ?? row?.job_title ?? row?.title,
    }));
  } else {
    res.status(400).json({ error: "Provide csvText (raw CSV string) or leads (JSON array of {name, phone, email, business/company, jobTitle})" }); return;
  }

  if (parsedLeads.length === 0) { res.status(400).json({ error: "No valid lead rows found" }); return; }

  // Single insert path shared with `/leads/import-file` so audit rows in the
  // lead_imports table look identical regardless of how the data arrived.
  const result = await insertLeadsForOrg({
    orgId: membership.orgId,
    userId,
    fileName: fileName || "import.csv",
    rows: parsedLeads,
  });
  broadcastLeadEvent(membership.orgId, { type: 'leads_imported', importId: result.importId, count: result.success });
  res.json(result);
});

/**
 * Multer/file-upload error handler — converts limit and parse errors into
 * deterministic 4xx responses instead of letting them surface as 500s.
 * Mounted last so it only catches errors raised by the upload middleware.
 */
router.use((err: any, _req: Request, res: Response, next: any) => {
  if (err && (err.code === "LIMIT_FILE_SIZE" || err instanceof multer.MulterError)) {
    res.status(413).json({ error: err.message || "Upload too large" });
    return;
  }
  next(err);
});

export default router;
