import { Router, type Request, type Response } from "express";
import multer from "multer";
import { and, desc, eq, or } from "drizzle-orm";
import {
  db, leadRecordsTable, leadNotesTable, crmActivitiesTable, crmCustomFieldsTable,
  crmSourceConnectionsTable, crmSyncRunsTable, crmSyncChangesTable, crmSyncConflictsTable,
  CRM_CUSTOM_FIELD_TYPES,
} from "@workspace/db";
import { canDoInOrg, resolveCurrentOrgId } from "../lib/org-permissions";
import { publicCrmSource } from "../lib/crm-source-public";
import { applyCrmLeadImport, normalizeCrmImportHeader, parseCrmImportBuffer } from "../lib/crm-lead-import";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const CORE_KEYS = new Set(["id", "orgId", "name", "phone", "email", "company", "business", "jobTitle", "source", "status", "assignedUserId", "callCount", "createdAt", "updatedAt"]);
const CORE_ALIASES: Record<string, string> = { fullname: "name", full_name: "name", mobile: "phone", phonenumber: "phone", mail: "email", business: "company", organization: "company", title: "jobTitle" };
const normalize = normalizeCrmImportHeader;

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
    const parsed = await parseCrmImportBuffer(req.file.buffer, req.file.originalname);
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
  const mapping = b.mapping && typeof b.mapping === "object" ? b.mapping as Record<string, unknown> : {};
  try {
    res.json(await applyCrmLeadImport({
      orgId: a.orgId,
      userId: a.id,
      headers,
      rows,
      mapping,
      existingRowPolicy: b.existingRowPolicy,
      authority: b.authority,
    }));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "CRM import failed" });
  }
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