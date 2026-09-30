import { Router, type Request, type Response } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import XLSX from "xlsx";
import { Readable } from "node:stream";
import { and, desc, eq, or } from "drizzle-orm";
import {
  db, leadRecordsTable, leadNotesTable, crmActivitiesTable, crmCustomFieldsTable,
  crmSourceConnectionsTable, crmSyncRunsTable, crmSyncChangesTable, crmSyncConflictsTable,
  CRM_CUSTOM_FIELD_TYPES,
} from "@workspace/db";
import { canDoInOrg, resolveCurrentOrgId } from "../lib/org-permissions";
import { publicCrmSource } from "../lib/crm-source-public";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const CORE_KEYS = new Set(["id", "orgId", "name", "phone", "email", "company", "business", "jobTitle", "source", "status", "assignedUserId", "callCount", "createdAt", "updatedAt"]);
const CORE_ALIASES: Record<string, string> = { fullname: "name", full_name: "name", mobile: "phone", phonenumber: "phone", mail: "email", business: "company", organization: "company", title: "jobTitle" };
const normalize = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");

function userId(req: Request, res: Response): string | null {
  if (!req.isAuthenticated?.() || !req.user?.id) { res.status(401).json({ error: "Login required" }); return null; }
  return String(req.user.id);
}
async function access(req: Request, res: Response, permission: "crm.view" | "crm.edit") {
  const id = userId(req, res); if (!id) return null;
  const orgId = await resolveCurrentOrgId(id);
  if (!orgId) { res.status(403).json({ error: "Organization required" }); return null; }
  if (!(await canDoInOrg(id, orgId, permission)).allowed) { res.status(403).json({ error: "CRM permission required" }); return null; }
  return { id, orgId };
}
function protectedDestination(key: string) { return CORE_KEYS.has(key) || key.startsWith("_"); }
function validateValue(field: any, value: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (value === null || value === undefined || String(value).trim() === "") {
    return field.required ? { ok: false, error: `${field.fieldKey} is required` } : { ok: true, value: null };
  }
  if (field.fieldType === "number") {
    const n = Number(value); return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: `${field.fieldKey} must be a number` };
  }
  if (field.fieldType === "boolean") {
    const s = normalize(value); if (["true", "yes", "1"].includes(s)) return { ok: true, value: true };
    if (["false", "no", "0"].includes(s)) return { ok: true, value: false };
    return { ok: false, error: `${field.fieldKey} must be boolean` };
  }
  if (field.fieldType === "date") {
    const d = new Date(String(value)); return Number.isNaN(d.getTime()) ? { ok: false, error: `${field.fieldKey} must be a date` } : { ok: true, value: d.toISOString().slice(0, 10) };
  }
  if (field.fieldType === "select" && !(field.optionsJson ?? []).includes(String(value))) return { ok: false, error: `${field.fieldKey} must be one of the configured options` };
  return { ok: true, value: String(value).trim() };
}
async function parseFile(file: Express.Multer.File) {
  const wb = new ExcelJS.Workbook();
  const isSheet = /\.(xlsx|xlsm|xls)$/i.test(file.originalname) || /sheet|excel/.test(file.mimetype);
  if (isSheet && /\.xls$/i.test(file.originalname)) {
    const workbook = XLSX.read(file.buffer, { type: "buffer", cellDates: false });
    const first = workbook.Sheets[workbook.SheetNames[0]];
    const rows = first ? XLSX.utils.sheet_to_json(first, { header: 1, raw: false }) as unknown[][] : [];
    const normalized = rows.map(row => (Array.isArray(row) ? row.map(v => String(v ?? "").trim()) : []));
    return { headers: normalized[0] ?? [], rows: normalized.slice(1).filter(r => r.some(Boolean)) };
  }
  if (isSheet) await wb.xlsx.load(file.buffer as any);
  else await wb.csv.read(Readable.from([file.buffer.toString("utf8").replace(/^\uFEFF/, "")]));
  const ws = wb.worksheets[0]; if (!ws) return { headers: [], rows: [] as string[][] };
  const all: string[][] = [];
  ws.eachRow({ includeEmpty: true }, row => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => { values[col - 1] = cell.text; });
    all.push(values.map(v => String(v ?? "").trim()));
  });
  return { headers: all[0] ?? [], rows: all.slice(1).filter(r => r.some(Boolean)) };
}
function coreValue(lead: any, key: string) {
  if (key === "business") return lead.company;
  return lead[key];
}

router.get("/crm/custom-fields", async (req, res) => {
  const a = await access(req, res, "crm.view"); if (!a) return;
  res.json(await db.select().from(crmCustomFieldsTable).where(eq(crmCustomFieldsTable.orgId, a.orgId)).orderBy(crmCustomFieldsTable.position));
});
router.post("/crm/custom-fields", async (req, res) => {
  const a = await access(req, res, "crm.edit"); if (!a) return;
  const b = req.body ?? {}, key = String(b.fieldKey ?? "").trim();
  const label = String(b.label ?? "").trim(), type = String(b.fieldType ?? "");
  if (!/^[a-z][a-z0-9_]{0,79}$/.test(key) || protectedDestination(key) || !label || !(CRM_CUSTOM_FIELD_TYPES as readonly string[]).includes(type)) {
    res.status(400).json({ error: "fieldKey must be stable, non-protected, label/type are required" }); return;
  }
  const options = Array.isArray(b.optionsJson) ? b.optionsJson.map(String).map((x: string) => x.trim()).filter(Boolean) : [];
  if (type === "select" && !options.length) { res.status(400).json({ error: "Select fields require options" }); return; }
  try {
    const [field] = await db.insert(crmCustomFieldsTable).values({ orgId: a.orgId, fieldKey: key, label, fieldType: type, optionsJson: options, required: b.required === true, position: Number.isInteger(b.position) ? b.position : 0, createdByUserId: a.id }).returning();
    res.status(201).json(field);
  } catch { res.status(409).json({ error: "A custom field with that key already exists" }); }
});
router.patch("/crm/custom-fields/:fieldKey", async (req, res) => {
  const a = await access(req, res, "crm.edit"); if (!a) return;
  const key = req.params.fieldKey;
  const [existing] = await db.select().from(crmCustomFieldsTable).where(and(eq(crmCustomFieldsTable.orgId, a.orgId), eq(crmCustomFieldsTable.fieldKey, key)));
  if (!existing) { res.status(404).json({ error: "Field not found" }); return; }
  const b = req.body ?? {}, updates: any = { updatedAt: new Date() };
  if (b.label !== undefined) updates.label = String(b.label).trim();
  if (b.archived !== undefined) updates.archived = b.archived === true;
  if (b.required !== undefined) updates.required = b.required === true;
  if (b.position !== undefined && Number.isInteger(b.position)) updates.position = b.position;
  if (b.optionsJson !== undefined) updates.optionsJson = Array.isArray(b.optionsJson) ? b.optionsJson.map(String) : [];
  const [field] = await db.update(crmCustomFieldsTable).set(updates).where(eq(crmCustomFieldsTable.id, existing.id)).returning();
  res.json(field);
});

router.post("/crm/leads/import/preview", upload.single("file"), async (req, res) => {
  const a = await access(req, res, "crm.edit"); if (!a) return;
  if (!req.file) { res.status(400).json({ error: "File is required" }); return; }
  try {
    const parsed = await parseFile(req.file);
    const fields = await db.select().from(crmCustomFieldsTable).where(and(eq(crmCustomFieldsTable.orgId, a.orgId), eq(crmCustomFieldsTable.archived, false)));
    const candidates = parsed.headers.map((header, index) => {
      const key = CORE_ALIASES[normalize(header)] ?? [...CORE_KEYS].find(k => normalize(k) === normalize(header));
      const custom = fields.find(f => normalize(f.fieldKey) === normalize(header) || normalize(f.label) === normalize(header));
      return { header, index, suggestedDestination: key ?? custom?.fieldKey ?? null, candidates: [key, ...fields.map(f => f.fieldKey)].filter(Boolean) };
    });
    res.json({ headers: parsed.headers, sampleRows: parsed.rows.slice(0, 5), rowCount: parsed.rows.length, candidates, rows: parsed.rows });
  } catch (e) { res.status(400).json({ error: `Could not read file: ${e instanceof Error ? e.message : "unknown"}` }); }
});

router.post("/crm/leads/import/apply", async (req, res) => {
  const a = await access(req, res, "crm.edit"); if (!a) return;
  const b = req.body ?? {}, headers = Array.isArray(b.headers) ? b.headers.map(String) : [], rows = Array.isArray(b.rows) ? b.rows : [];
  const mapping = b.mapping && typeof b.mapping === "object" ? b.mapping : {};
  if (!headers.length || !rows.length || !["skip", "update"].includes(b.existingRowPolicy) || !["import", "crm"].includes(b.authority)) { res.status(400).json({ error: "headers, rows, explicit mapping, existingRowPolicy, and authority are required" }); return; }
  const destinations = Object.values(mapping).map(String).map(k => k === "business" ? "company" : k);
  if (new Set(destinations).size !== destinations.length || destinations.some(protectedDestination) && destinations.some(k => !CORE_KEYS.has(k) && !CORE_ALIASES[k])) { res.status(400).json({ error: "Mapping contains duplicate or protected destinations" }); return; }
  const fields = await db.select().from(crmCustomFieldsTable).where(and(eq(crmCustomFieldsTable.orgId, a.orgId), eq(crmCustomFieldsTable.archived, false)));
  const byKey = new Map(fields.map(f => [f.fieldKey, f]));
  for (const d of destinations) if (!CORE_KEYS.has(d) && !byKey.has(d)) { res.status(400).json({ error: `Unknown destination: ${d}` }); return; }
  const leads = await db.select().from(leadRecordsTable).where(eq(leadRecordsTable.orgId, a.orgId));
  const result = { created: 0, updated: 0, skipped: 0, conflicts: [] as any[], errors: [] as any[] };
  for (let ri = 0; ri < rows.length; ri++) {
    const row = Array.isArray(rows[ri]) ? rows[ri] : []; const data: any = {}; const custom: Record<string, unknown> = {};
    for (const [header, destination] of Object.entries(mapping)) {
      const destinationKey = String(destination) === "business" ? "company" : String(destination);
      const value = row[headers.indexOf(header)]; if (CORE_KEYS.has(destinationKey)) data[destinationKey] = value == null ? "" : String(value).trim();
      else { const valid = validateValue(byKey.get(String(destination)), value); if (!valid.ok) { result.errors.push({ row: ri + 1, error: valid.error }); continue; } custom[String(destination)] = valid.value; }
    }
    for (const field of fields) {
      if (field.required && (custom[field.fieldKey] === undefined || custom[field.fieldKey] === null || custom[field.fieldKey] === "")) {
        result.errors.push({ row: ri + 1, error: `${field.fieldKey} is required` });
      }
    }
    if (!data.name) { result.errors.push({ row: ri + 1, error: "Name is required" }); continue; }
    const email = String(data.email ?? "").trim().toLowerCase(), phone = String(data.phone ?? "").replace(/\D/g, "");
    const matches = leads.filter(l => (email && l.email.toLowerCase() === email) || (phone && l.phone.replace(/\D/g, "").slice(-10) === phone.slice(-10)));
    if (matches.length > 1) { result.conflicts.push({ row: ri + 1, reason: "ambiguous_match", leadIds: matches.map(x => x.id) }); continue; }
    if (matches.length === 1) {
      if (b.existingRowPolicy === "skip") { result.skipped++; continue; }
      if (b.authority === "crm") { result.skipped++; continue; }
      const existing = matches[0], updates: any = { customFieldsJson: { ...(existing.customFieldsJson ?? {}), ...custom } };
      for (const k of ["name", "phone", "email", "company", "jobTitle"]) if (data[k] !== undefined) updates[k] = data[k];
      await db.update(leadRecordsTable).set(updates).where(and(eq(leadRecordsTable.id, existing.id), eq(leadRecordsTable.orgId, a.orgId))); result.updated++; continue;
    }
    const [created] = await db.insert(leadRecordsTable).values({ orgId: a.orgId, name: data.name, phone: data.phone ?? "", email: data.email ?? "", company: data.company ?? "", jobTitle: data.jobTitle ?? "", source: "crm_import", status: data.status ?? "new", createdByUserId: a.id, customFieldsJson: custom }).returning();
    if (created) result.created++;
  }
  res.json(result);
});

router.get("/crm/archive/export", async (req, res) => {
  const a = await access(req, res, "crm.edit"); if (!a) return;
  const [leads, notes, activities, fields, sources, runs, changes, conflicts] = await Promise.all([
    db.select().from(leadRecordsTable).where(eq(leadRecordsTable.orgId, a.orgId)).orderBy(desc(leadRecordsTable.id)),
    db.select().from(leadNotesTable).innerJoin(leadRecordsTable, eq(leadNotesTable.leadId, leadRecordsTable.id)).where(eq(leadRecordsTable.orgId, a.orgId)),
    db.select().from(crmActivitiesTable).where(eq(crmActivitiesTable.orgId, a.orgId)).orderBy(desc(crmActivitiesTable.id)),
    db.select().from(crmCustomFieldsTable).where(eq(crmCustomFieldsTable.orgId, a.orgId)),
    db.select().from(crmSourceConnectionsTable).where(eq(crmSourceConnectionsTable.orgId, a.orgId)),
    db.select().from(crmSyncRunsTable).where(eq(crmSyncRunsTable.orgId, a.orgId)),
    db.select().from(crmSyncChangesTable).where(eq(crmSyncChangesTable.orgId, a.orgId)),
    db.select().from(crmSyncConflictsTable).where(eq(crmSyncConflictsTable.orgId, a.orgId)),
  ]);
  const serial = (v: any): any => v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.map(serial) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, serial(x)])) : v;
  res.json(serial({ format: "calll-home-crm-archive-v2", exportedAt: new Date(), orgId: a.orgId, leads, notes: notes.map(n => n.lead_notes), activities: activities.map(({ recordingUrl, ...x }) => x), customFields: fields, sources: sources.map(publicCrmSource), syncRuns: runs, syncChanges: changes, syncConflicts: conflicts }));
});
export default router;