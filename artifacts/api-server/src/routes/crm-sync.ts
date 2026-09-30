import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { db, crmSourceConnectionsTable, crmSyncRunsTable, crmSyncChangesTable, crmSyncConflictsTable, leadRecordsTable, crmCustomFieldsTable } from "@workspace/db";
import { canDoInOrg, resolveCurrentOrgId } from "../lib/org-permissions";
import { encryptProtectedRecord, decryptProtectedRecord } from "../lib/org-protected-records-crypto";
import { publicCrmSource } from "../lib/crm-source-public";
import { safeFetch } from "../lib/site-proxy";

const router = Router();
async function access(req: any, res: any, permission: "crm.view" | "crm.edit") {
  if (!req.isAuthenticated?.() || !req.user?.id) { res.status(401).json({ error: "Login required" }); return null; }
  const orgId = await resolveCurrentOrgId(req.user.id);
  if (!orgId || !(await canDoInOrg(req.user.id, orgId, permission)).allowed) { res.status(403).json({ error: "CRM permission required" }); return null; }
  return { orgId, userId: req.user.id };
}
function httpsUrl(raw: unknown): string | null {
  try { const u = new URL(String(raw)); return u.protocol === "https:" && !u.username && !u.password ? u.toString() : null; } catch { return null; }
}
const FORBIDDEN_FIELDS = new Set(["id", "orgId", "ownerUserId", "assignedUserId", "createdByUserId", "recordingUrl", "callHistory", "telephony"]);
const CORE_FIELDS = new Set(["name", "phone", "email", "company", "jobTitle", "status"]);
const VALID_STATUSES = new Set(["new", "contacted", "qualified", "proposal", "closed_won", "closed_lost"]);
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
function googleConfig() {
  const { GOOGLE_SHEETS_CLIENT_ID: clientId, GOOGLE_SHEETS_CLIENT_SECRET: clientSecret, GOOGLE_SHEETS_REDIRECT_URI: redirectUri } = process.env;
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null;
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableJson(obj[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? "");
}
function rowKey(field: "email" | "phone", value: unknown): string {
  const raw = String(value ?? "").trim();
  return field === "email" ? raw.toLowerCase() : raw.replace(/\D/g, "");
}
function leadKey(lead: any, field: "email" | "phone"): string {
  return rowKey(field, lead?.[field]);
}
function valuesFromLead(lead: any, mapping: Record<string, unknown>): Record<string, unknown> {
  const custom = lead?.customFieldsJson && typeof lead.customFieldsJson === "object" ? lead.customFieldsJson : {};
  return Object.fromEntries(Object.keys(mapping).sort().map((field) => [
    field,
    CORE_FIELDS.has(field) ? (lead?.[field] ?? "") : (custom[field] ?? ""),
  ]));
}
function applyMappedValues(existing: any, mapped: Record<string, unknown>): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const field of CORE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(mapped, field)) {
      const value = String(mapped[field] ?? "").trim();
      if (field === "status" && value && !VALID_STATUSES.has(value)) throw new Error("Source contains an invalid lead status");
      updates[field] = value || (field === "status" ? existing?.status ?? "new" : "");
    }
  }
  const custom = { ...(existing?.customFieldsJson && typeof existing.customFieldsJson === "object" ? existing.customFieldsJson : {}) };
  for (const [field, value] of Object.entries(mapped)) {
    if (!CORE_FIELDS.has(field) && !FORBIDDEN_FIELDS.has(field)) custom[field] = value ?? "";
  }
  if (Object.keys(custom).length || existing?.customFieldsJson) updates.customFieldsJson = custom;
  return updates;
}
function parseSheetRange(range: string): { sheet: string; startColumn: number; startRow: number } | null {
  const bang = range.lastIndexOf("!");
  if (bang <= 0) return null;
  const sheet = range.slice(0, bang);
  const cells = range.slice(bang + 1).split(":");
  const first = cells[0].replace(/\$/g, "").match(/^([A-Z]+)(\d+)$/i);
  const last = cells[1]?.replace(/\$/g, "").match(/^([A-Z]+)(\d+)?$/i);
  if (!first || (cells[1] && !last)) return null;
  const columnNumber = (letters: string) => letters.toUpperCase().split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  if (last && columnNumber(last[1]) < columnNumber(first[1])) return null;
  return { sheet, startColumn: columnNumber(first[1]), startRow: Number(first[2]) };
}
function columnLetters(column: number): string {
  let out = "";
  for (let n = column; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(((n - 1) % 26) + 65) + out;
  return out;
}

router.get("/crm/sources", async (req, res) => {
  const a = await access(req, res, "crm.view"); if (!a) return;
  const rows = await db.select().from(crmSourceConnectionsTable).where(eq(crmSourceConnectionsTable.orgId, a.orgId)).orderBy(desc(crmSourceConnectionsTable.id));
  res.json({ sources: rows.map(publicCrmSource) });
});
router.get("/crm/google/connect", async (req, res) => {
  const a = await access(req, res, "crm.edit"); if (!a) return;
  const cfg = googleConfig();
  if (!cfg) { res.status(503).json({ error: "Google Sheets integration is disabled: GOOGLE_SHEETS_CLIENT_ID, GOOGLE_SHEETS_CLIENT_SECRET, and GOOGLE_SHEETS_REDIRECT_URI are required" }); return; }
  const sourceId = Number(req.query.sourceId);
  if (!Number.isSafeInteger(sourceId) || sourceId <= 0) { res.status(400).json({ error: "A configured Google Sheets sourceId is required" }); return; }
  const [source] = await db.select().from(crmSourceConnectionsTable).where(and(eq(crmSourceConnectionsTable.id, sourceId), eq(crmSourceConnectionsTable.orgId, a.orgId), eq(crmSourceConnectionsTable.provider, "google_sheets")));
  const sheetConfig = source?.configJson as Record<string, unknown> | undefined;
  if (!source || !sheetConfig?.spreadsheetId || !sheetConfig?.range) { res.status(404).json({ error: "Configured Google Sheets source not found" }); return; }
  const state = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(state).digest("hex");
  await db.update(crmSourceConnectionsTable).set({ oauthStateHash: hash, oauthStateExpiresAt: new Date(Date.now() + 10 * 60 * 1000), updatedAt: new Date() }).where(and(eq(crmSourceConnectionsTable.id, source.id), eq(crmSourceConnectionsTable.orgId, a.orgId)));
  const params = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: "code", access_type: "offline", prompt: "consent", scope: SHEETS_SCOPE, state: `${source.id}.${state}` });
  res.json({ authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
});
router.get("/crm/google/callback", async (req, res) => {
  const cfg = googleConfig();
  if (!cfg) { res.status(503).json({ error: "Google Sheets integration is disabled: OAuth configuration is missing" }); return; }
  const [sourceId, state] = String(req.query.state ?? "").split(".");
  if (!/^\d+$/.test(sourceId ?? "") || !state) { res.status(400).json({ error: "Invalid OAuth state" }); return; }
  const hash = createHash("sha256").update(state).digest("hex");
  const [source] = await db.select().from(crmSourceConnectionsTable).where(and(eq(crmSourceConnectionsTable.id, Number(sourceId)), eq(crmSourceConnectionsTable.oauthStateHash, hash)));
  if (!source || source.provider !== "google_sheets" || !source.oauthStateExpiresAt || source.oauthStateExpiresAt < new Date()) { res.status(400).json({ error: "OAuth state expired or invalid" }); return; }
  const consumed = await db.update(crmSourceConnectionsTable).set({ oauthStateHash: null, oauthStateExpiresAt: null, updatedAt: new Date() }).where(and(
    eq(crmSourceConnectionsTable.id, source.id),
    eq(crmSourceConnectionsTable.oauthStateHash, hash),
    gt(crmSourceConnectionsTable.oauthStateExpiresAt, new Date()),
  )).returning({ id: crmSourceConnectionsTable.id });
  if (!consumed.length) { res.status(400).json({ error: "OAuth state expired or already consumed" }); return; }
  if (req.query.error) { res.redirect(303, "/leads?crm_google_sheets=cancelled"); return; }
  if (typeof req.query.code !== "string" || !req.query.code) { res.status(400).json({ error: "Google authorization code is missing" }); return; }
  let response;
  try {
    response = await safeFetch("https://oauth2.googleapis.com/token", { method: "POST", maxRedirects: 0, maxResponseBytes: 64 * 1024, headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: String(req.query.code), client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" }).toString(), timeoutMs: 15000 });
  } catch {
    res.status(502).json({ error: "Google OAuth token exchange failed" });
    return;
  }
  if (response.status < 200 || response.status >= 300) { res.redirect(303, "/leads?crm_google_sheets=failed"); return; }
  let token: Record<string, unknown>;
  try { token = JSON.parse(response.body.toString("utf8")) as Record<string, unknown>; } catch { res.redirect(303, "/leads?crm_google_sheets=failed"); return; }
  await db.update(crmSourceConnectionsTable).set({ encryptedAuth: encryptProtectedRecord(JSON.stringify(token), source.orgId), updatedAt: new Date() }).where(and(eq(crmSourceConnectionsTable.id, source.id), eq(crmSourceConnectionsTable.orgId, source.orgId)));
  res.redirect(303, "/leads?crm_google_sheets=connected");
});
router.post("/crm/sources", async (req, res) => {
  const a = await access(req, res, "crm.edit"); if (!a) return;
  const b = req.body ?? {}, provider = String(b.provider ?? "");
  if (!["rest", "google_sheets"].includes(provider)) { res.status(400).json({ error: "Unsupported source provider" }); return; }
  const inputConfig = b.config && typeof b.config === "object" && !Array.isArray(b.config) ? b.config : {};
  if (b.direction !== undefined && !["pull", "push", "bidirectional"].includes(b.direction)) { res.status(400).json({ error: "Unsupported source direction" }); return; }
  const direction = ["pull", "push", "bidirectional"].includes(b.direction) ? b.direction : "pull";
  const method = String(inputConfig.method ?? "GET").toUpperCase();
  if (provider === "google_sheets") {
    const spreadsheetId = String(inputConfig.spreadsheetId ?? "");
    const range = String(inputConfig.range ?? "");
    if (!/^[A-Za-z0-9_-]{10,}$/.test(spreadsheetId) || range.length > 200 || !parseSheetRange(range)) { res.status(400).json({ error: "Google Sheets requires a valid spreadsheetId and A1 range such as Contacts!A1:Z" }); return; }
  }
  const endpoint = provider === "rest" ? httpsUrl(inputConfig.endpoint) : null;
  if (provider === "rest" && !endpoint) { res.status(400).json({ error: "REST endpoint must use HTTPS" }); return; }
  if (!["GET", "POST", "PUT", "PATCH"].includes(method)) { res.status(400).json({ error: "Unsupported REST method" }); return; }
  if (provider === "rest" && direction !== "pull" && method === "GET") { res.status(400).json({ error: "REST push requires POST, PUT, or PATCH" }); return; }
  const fields = await db.select({ fieldKey: crmCustomFieldsTable.fieldKey }).from(crmCustomFieldsTable).where(and(eq(crmCustomFieldsTable.orgId, a.orgId), eq(crmCustomFieldsTable.archived, false)));
  const allowed = new Set(["name", "phone", "email", "company", "jobTitle", "status", ...fields.map(f => f.fieldKey)]);
  const mapping = inputConfig.mapping && typeof inputConfig.mapping === "object" ? inputConfig.mapping : {};
  if (Array.isArray(mapping) || Object.keys(mapping).length === 0 || Object.keys(mapping).length > 100 ||
      Object.keys(mapping).some(k => FORBIDDEN_FIELDS.has(k) || !allowed.has(k) || typeof mapping[k] !== "string" || !String(mapping[k]).trim() || mapping[k].length > 120)) {
    res.status(400).json({ error: "Mapping contains a forbidden or unknown CRM destination" }); return;
  }
  if (new Set(Object.values(mapping).map((value: unknown) => String(value).trim())).size !== Object.keys(mapping).length) {
    res.status(400).json({ error: "Each CRM field must map to a different source column or property" }); return;
  }
  const keyField = String(inputConfig.keyField ?? "email");
  if (!["email", "phone"].includes(keyField) || typeof mapping[keyField] !== "string" || !String(mapping[keyField]).trim()) {
    res.status(400).json({ error: "Mapping must include email or phone as the matching key" }); return;
  }
  const authValue = provider === "rest" && b.auth && typeof b.auth === "object" ? b.auth : {};
  if (Array.isArray(authValue) || Object.keys(authValue).some((key) => key !== "bearer") ||
      (authValue.bearer !== undefined && (typeof authValue.bearer !== "string" || authValue.bearer.length > 4096))) {
    res.status(400).json({ error: "REST authorization must be a bearer token no longer than 4096 characters" }); return;
  }
  const auth = authValue.bearer ? JSON.stringify({ bearer: authValue.bearer }) : "";
  const [source] = await db.insert(crmSourceConnectionsTable).values({
    orgId: a.orgId, provider, name: String(b.name || (provider === "rest" ? "REST source" : "Google Sheets source")).slice(0, 160), direction,
    configJson: provider === "rest" ? { endpoint, method, mapping, keyField } : { spreadsheetId: String(inputConfig.spreadsheetId), range: String(inputConfig.range), mapping, keyField },
    encryptedAuth: auth ? encryptProtectedRecord(auth, a.orgId) : null, createdByUserId: a.userId,
  }).returning();
  res.status(201).json(publicCrmSource(source));
});
router.delete("/crm/sources/:id", async (req, res) => {
  const a = await access(req, res, "crm.edit"); if (!a) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid source id" }); return; }
  await db.delete(crmSourceConnectionsTable).where(and(eq(crmSourceConnectionsTable.id, id), eq(crmSourceConnectionsTable.orgId, a.orgId)));
  res.json({ ok: true });
});
router.get("/crm/sync/conflicts", async (req, res) => {
  const a = await access(req, res, "crm.view"); if (!a) return;
  const conflicts = await db.select().from(crmSyncConflictsTable).where(and(eq(crmSyncConflictsTable.orgId, a.orgId), eq(crmSyncConflictsTable.status, "open"))).orderBy(desc(crmSyncConflictsTable.id));
  res.json({ conflicts });
});
router.post("/crm/sources/:id/sync", async (req, res) => {
  const a = await access(req, res, "crm.edit"); if (!a) return;
  const sourceId = Number(req.params.id);
  if (!Number.isSafeInteger(sourceId) || sourceId <= 0) { res.status(400).json({ error: "Invalid source id" }); return; }
  const [source] = await db.select().from(crmSourceConnectionsTable).where(and(eq(crmSourceConnectionsTable.id, sourceId), eq(crmSourceConnectionsTable.orgId, a.orgId)));
  if (!source) { res.status(404).json({ error: "Source not found" }); return; }
  if (source.provider === "google_sheets") {
    const cfg = googleConfig();
    if (!cfg) { res.status(503).json({ error: "Google Sheets integration is disabled: OAuth configuration is missing" }); return; }
    if (!source.encryptedAuth) { res.status(409).json({ error: "Google Sheets authorization is required" }); return; }
    const sheetCfg = source.configJson as any;
    if (!sheetCfg.spreadsheetId || !sheetCfg.range) { res.status(400).json({ error: "Google Sheets source requires spreadsheetId and range configuration" }); return; }
    const rangeInfo = parseSheetRange(String(sheetCfg.range));
    if (!rangeInfo) { res.status(400).json({ error: "Google Sheets range must be an A1 range such as Contacts!A1:Z" }); return; }
    const keyField: "email" | "phone" = sheetCfg.keyField === "phone" ? "phone" : "email";
    let token: any;
    try { token = JSON.parse(decryptProtectedRecord(source.encryptedAuth, a.orgId)); } catch { res.status(409).json({ error: "Google Sheets credentials are invalid or revoked" }); return; }
    const [sheetRun] = await db.insert(crmSyncRunsTable).values({ orgId: a.orgId, connectionId: source.id, direction: source.direction }).returning();
    const requestSheets = async (method: string, url: string, body?: string) => {
      let accessToken = String(token.access_token ?? "");
      let result = await safeFetch(url, { method, maxRedirects: 0, maxResponseBytes: 2 * 1024 * 1024, headers: { authorization: `Bearer ${accessToken}`, ...(body ? { "content-type": "application/json" } : {}) }, body, timeoutMs: 15000 });
      if (result.status === 401 && token.refresh_token) {
        const refreshed = await safeFetch("https://oauth2.googleapis.com/token", { method: "POST", maxRedirects: 0, maxResponseBytes: 64 * 1024, headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: token.refresh_token, grant_type: "refresh_token" }).toString(), timeoutMs: 15000 });
        if (refreshed.status < 200 || refreshed.status >= 300) throw new Error("Google Sheets authorization expired or revoked");
        const next = JSON.parse(refreshed.body.toString("utf8")); token = { ...token, ...next };
        await db.update(crmSourceConnectionsTable).set({ encryptedAuth: encryptProtectedRecord(JSON.stringify(token), a.orgId), updatedAt: new Date() }).where(and(eq(crmSourceConnectionsTable.id, source.id), eq(crmSourceConnectionsTable.orgId, a.orgId)));
        accessToken = String(token.access_token);
        result = await safeFetch(url, { method, maxRedirects: 0, maxResponseBytes: 2 * 1024 * 1024, headers: { authorization: `Bearer ${accessToken}`, ...(body ? { "content-type": "application/json" } : {}) }, body, timeoutMs: 15000 });
      }
      if (result.status < 200 || result.status >= 300) throw new Error("Google Sheets request failed");
      return result;
    };
    try {
      const mapping = sheetCfg.mapping as Record<string, string>;
      const response = await requestSheets("GET", `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetCfg.spreadsheetId)}/values/${encodeURIComponent(sheetCfg.range)}`);
      const values = JSON.parse(response.body.toString("utf8")).values;
      if (!Array.isArray(values) || values.length > 5001 || values.some((row: unknown) => !Array.isArray(row) || row.length > 100)) throw new Error("Google Sheets range exceeds the supported row or column limit");
      const headers = (values[0] ?? []).map((cell: unknown) => String(cell ?? "").trim());
      if (!headers.length) throw new Error("Google Sheets range is missing its header row");
      const offsets = new Map<string, number>();
      headers.forEach((header: string, index: number) => { if (header && !offsets.has(header)) offsets.set(header, index); });
      for (const header of Object.values(mapping)) if (!offsets.has(String(header))) throw new Error("A mapped Google Sheets header was not found");
      const remoteRows: Array<{ mapped: Record<string, unknown>; key: string; rowNumber: number }> = [];
      const remoteByKey = new Map<string, { mapped: Record<string, unknown>; key: string; rowNumber: number }>();
      for (const [index, row] of values.slice(1).entries()) {
        const mapped: Record<string, unknown> = {};
        for (const [field, header] of Object.entries(mapping)) mapped[field] = row[offsets.get(header)!] ?? "";
        const key = rowKey(keyField, mapped[keyField]);
        if (!key || remoteByKey.has(key)) continue;
        const remote = { mapped, key, rowNumber: rangeInfo.startRow + index + 1 };
        remoteRows.push(remote);
        remoteByKey.set(key, remote);
      }

      const leads = await db.select().from(leadRecordsTable).where(eq(leadRecordsTable.orgId, a.orgId)).limit(5000);
      const leadByKey = new Map<string, any>();
      for (const lead of leads) {
        const key = leadKey(lead, keyField);
        if (key && !leadByKey.has(key)) leadByKey.set(key, lead);
      }
      const cellUpdates = new Map<string, unknown>();
      const appendRows: string[][] = [];
      const snapshots: Array<{ leadId: number; key: string; source: Record<string, unknown>; crm: Record<string, unknown> }> = [];
      let created = 0, conflicts = 0, pulled = 0, pushed = 0;

      const snapshot = async (leadId: number, key: string, sourceValues: Record<string, unknown>, crmValues: Record<string, unknown>) => {
        await db.insert(crmSyncChangesTable).values({
          orgId: a.orgId, runId: sheetRun.id, connectionId: source.id, leadId, externalKey: key,
          changedFieldsJson: {}, sourceSnapshotJson: sourceValues, crmSnapshotJson: crmValues, isSnapshot: true,
        });
      };
      const createConflict = async (lead: any, key: string, sourceValues: Record<string, unknown>, crmValues: Record<string, unknown>) => {
        const [open] = await db.select({ id: crmSyncConflictsTable.id }).from(crmSyncConflictsTable).where(and(
          eq(crmSyncConflictsTable.orgId, a.orgId),
          eq(crmSyncConflictsTable.connectionId, source.id),
          eq(crmSyncConflictsTable.leadId, lead.id),
          eq(crmSyncConflictsTable.status, "open"),
        )).limit(1);
        if (open) { conflicts++; return; }
        const changedFields = Object.keys(sourceValues).filter((field) => stableJson(sourceValues[field]) !== stableJson(crmValues[field]));
        const [change] = await db.insert(crmSyncChangesTable).values({
          orgId: a.orgId, runId: sheetRun.id, connectionId: source.id, leadId: lead.id, externalKey: key,
          changedFieldsJson: { fields: changedFields }, sourceSnapshotJson: sourceValues, crmSnapshotJson: crmValues, isSnapshot: false,
        }).returning();
        await db.insert(crmSyncConflictsTable).values({
          orgId: a.orgId, connectionId: source.id, runId: sheetRun.id, changeId: change.id, leadId: lead.id,
          sourceSnapshotJson: sourceValues, crmSnapshotJson: crmValues,
        });
        conflicts++;
      };

      if (source.direction !== "push") {
        for (const remote of remoteRows) {
          let lead = leadByKey.get(remote.key);
          if (!lead) {
            const updates = applyMappedValues(null, remote.mapped);
            const [inserted] = await db.insert(leadRecordsTable).values({
              orgId: a.orgId,
              createdByUserId: a.userId,
              source: `google_sheets:${source.id}`,
              status: String(updates.status || "new"),
              name: String(updates.name || remote.mapped[keyField] || remote.key),
              email: String(updates.email ?? ""),
              phone: String(updates.phone ?? ""),
              company: String(updates.company ?? ""),
              jobTitle: String(updates.jobTitle ?? ""),
              customFieldsJson: (updates.customFieldsJson ?? {}) as Record<string, unknown>,
            }).returning();
            lead = inserted;
            leadByKey.set(remote.key, lead);
            created++;
            pulled++;
            const crmValues = valuesFromLead(lead, mapping);
            await snapshot(lead.id, remote.key, remote.mapped, crmValues);
            continue;
          }
          pulled++;
          const crmValues = valuesFromLead(lead, mapping);
          const [previous] = await db.select().from(crmSyncChangesTable).where(and(
            eq(crmSyncChangesTable.orgId, a.orgId),
            eq(crmSyncChangesTable.connectionId, source.id),
            eq(crmSyncChangesTable.externalKey, remote.key),
            eq(crmSyncChangesTable.isSnapshot, true),
          )).orderBy(desc(crmSyncChangesTable.id)).limit(1);
          const previousSource = previous?.sourceSnapshotJson ?? null;
          const previousCrm = previous?.crmSnapshotJson ?? null;
          const sourceChanged = previous ? stableJson(previousSource) !== stableJson(remote.mapped) : false;
          const crmChanged = previous ? stableJson(previousCrm) !== stableJson(crmValues) : false;
          const differs = stableJson(remote.mapped) !== stableJson(crmValues);

          if (source.direction === "bidirectional" && differs && (!previous || (sourceChanged && crmChanged))) {
            await createConflict(lead, remote.key, remote.mapped, crmValues);
            continue;
          }
          if (previous && sourceChanged && crmChanged && differs) {
            await createConflict(lead, remote.key, remote.mapped, crmValues);
            continue;
          }
          if (sourceChanged && !crmChanged) {
            const updates = applyMappedValues(lead, remote.mapped);
            const [updated] = await db.update(leadRecordsTable).set(updates).where(and(eq(leadRecordsTable.id, lead.id), eq(leadRecordsTable.orgId, a.orgId))).returning();
            lead = updated ?? { ...lead, ...updates };
          } else if (crmChanged && !sourceChanged && source.direction === "bidirectional" && differs) {
            for (const [field, value] of Object.entries(crmValues)) {
              const offset = offsets.get(mapping[field]);
              if (offset !== undefined) cellUpdates.set(`${remote.rowNumber}:${rangeInfo.startColumn + offset}`, value);
            }
          } else if (!previous && source.direction === "pull" && differs) {
            const updates = applyMappedValues(lead, remote.mapped);
            const [updated] = await db.update(leadRecordsTable).set(updates).where(and(eq(leadRecordsTable.id, lead.id), eq(leadRecordsTable.orgId, a.orgId))).returning();
            lead = updated ?? { ...lead, ...updates };
          } else if (previous && crmChanged && !sourceChanged && source.direction === "pull" && differs) {
            await createConflict(lead, remote.key, remote.mapped, crmValues);
            continue;
          }
          const nextCrm = valuesFromLead(lead, mapping);
          if (source.direction !== "bidirectional" || !differs || !crmChanged || sourceChanged) {
            await snapshot(lead.id, remote.key, remote.mapped, nextCrm);
          } else {
            snapshots.push({ leadId: lead.id, key: remote.key, source: remote.mapped, crm: crmValues });
          }
        }
      }

      if (source.direction === "push" || source.direction === "bidirectional") {
        for (const lead of leads) {
          const key = leadKey(lead, keyField);
          if (!key) continue;
          const remote = remoteByKey.get(key);
          const crmValues = valuesFromLead(lead, mapping);
          if (!remote) {
            const row = Array(Math.max(headers.length, ...Array.from(offsets.values(), (offset) => offset + 1))).fill("");
            for (const [field, value] of Object.entries(crmValues)) row[offsets.get(mapping[field])!] = String(value ?? "");
            appendRows.push(row);
            snapshots.push({ leadId: lead.id, key, source: crmValues, crm: crmValues });
            pushed++;
            continue;
          }
          if (source.direction === "push") {
            for (const [field, value] of Object.entries(crmValues)) {
              const offset = offsets.get(mapping[field]);
              if (offset === undefined || stableJson(value) === stableJson(remote.mapped[field])) continue;
              cellUpdates.set(`${remote.rowNumber}:${rangeInfo.startColumn + offset}`, value);
            }
            snapshots.push({ leadId: lead.id, key, source: crmValues, crm: crmValues });
            pushed++;
          }
        }
      }

      if (cellUpdates.size) {
        const data = Array.from(cellUpdates, ([cell, value]) => {
          const [row, column] = cell.split(":").map(Number);
          return { range: `${rangeInfo.sheet}!${columnLetters(column)}${row}`, majorDimension: "ROWS", values: [[value ?? ""]] };
        });
        const body = JSON.stringify({ valueInputOption: "RAW", data });
        if (Buffer.byteLength(body, "utf8") > 2 * 1024 * 1024) throw new Error("Google Sheets update exceeds the 2 MB limit");
        await requestSheets("POST", `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetCfg.spreadsheetId)}/values:batchUpdate`, body);
        pushed += data.length;
      }
      if (appendRows.length) {
        const body = JSON.stringify({ majorDimension: "ROWS", values: appendRows });
        if (Buffer.byteLength(body, "utf8") > 2 * 1024 * 1024) throw new Error("Google Sheets append exceeds the 2 MB limit");
        await requestSheets("POST", `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetCfg.spreadsheetId)}/values/${encodeURIComponent(sheetCfg.range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, body);
      }
      for (const item of snapshots) await snapshot(item.leadId, item.key, item.source, item.crm);

      await db.update(crmSyncRunsTable).set({ status: "completed", completedAt: new Date(), summaryJson: { created, conflicts, pulled, pushed } }).where(and(eq(crmSyncRunsTable.id, sheetRun.id), eq(crmSyncRunsTable.orgId, a.orgId)));
      res.json({ runId: sheetRun.id, created, conflicts, pulled, pushed });
      return;
    } catch (error) {
      await db.update(crmSyncRunsTable).set({ status: "failed", completedAt: new Date(), summaryJson: { error: "Google Sheets sync failed" } }).where(and(eq(crmSyncRunsTable.id, sheetRun.id), eq(crmSyncRunsTable.orgId, a.orgId)));
      res.status(502).json({ error: "Google Sheets sync failed. Check authorization and source configuration, then retry." });
      return;
    }
  }
  if (source.provider !== "rest") { res.status(400).json({ error: "Unsupported source provider" }); return; }
  const config = source.configJson as any;
  const endpoint = httpsUrl(config.endpoint);
  if (!endpoint) { res.status(400).json({ error: "REST endpoint must use HTTPS" }); return; }
  const mapping = config.mapping as Record<string, string>;
  const keyField: "email" | "phone" = config.keyField === "phone" ? "phone" : "email";
  const [run] = await db.insert(crmSyncRunsTable).values({ orgId: a.orgId, connectionId: source.id, direction: source.direction }).returning();
  try {
    const auth: Record<string, string> = source.encryptedAuth ? JSON.parse(decryptProtectedRecord(source.encryptedAuth, a.orgId)) : {};
    const headers: Record<string, string> = { accept: "application/json" };
    if (typeof auth.bearer === "string" && auth.bearer) headers.authorization = `Bearer ${auth.bearer}`;
    const requestExternal = async (method: string, body?: string) => {
      const response = await safeFetch(endpoint, {
        method,
        headers: { ...headers, ...(body ? { "content-type": "application/json" } : {}) },
        body,
        timeoutMs: 15000,
        maxRedirects: 0,
        maxResponseBytes: 2 * 1024 * 1024,
      });
      if (response.status < 200 || response.status >= 300) throw new Error("REST source request failed");
      return response;
    };
    const toExternal = (lead: any) => Object.fromEntries(Object.entries(valuesFromLead(lead, mapping)).map(([field, value]) => [mapping[field], value]));
    const leads = await db.select().from(leadRecordsTable).where(eq(leadRecordsTable.orgId, a.orgId)).limit(5000);
    let created = 0, conflicts = 0, pulled = 0, pushed = 0;

    if (source.direction === "push") {
      const body = JSON.stringify(leads.map(toExternal));
      if (Buffer.byteLength(body, "utf8") > 2 * 1024 * 1024) throw new Error("Request exceeds limit");
      await requestExternal(String(config.method ?? "POST"), body);
      pushed = leads.length;
      for (const lead of leads) {
        const key = leadKey(lead, keyField);
        if (!key) continue;
        const values = valuesFromLead(lead, mapping);
        await db.insert(crmSyncChangesTable).values({
          orgId: a.orgId, runId: run.id, connectionId: source.id, leadId: lead.id, externalKey: key,
          changedFieldsJson: {}, sourceSnapshotJson: values, crmSnapshotJson: values, isSnapshot: true,
        });
      }
    } else {
      const response = await requestExternal("GET");
      const payload = JSON.parse(response.body.toString("utf8")) as unknown;
      const rows = Array.isArray(payload) ? payload : Array.isArray((payload as any)?.data) ? (payload as any).data : null;
      if (!rows || rows.length > 5000) throw new Error("REST source response must contain at most 5000 records");
      const leadByKey = new Map<string, any>();
      for (const lead of leads) {
        const key = leadKey(lead, keyField);
        if (key && !leadByKey.has(key)) leadByKey.set(key, lead);
      }
      const seen = new Set<string>();
      const outbound: Record<string, unknown>[] = [];
      const pendingSnapshots: Array<{ leadId: number; key: string; source: Record<string, unknown>; crm: Record<string, unknown> }> = [];
      for (const row of rows) {
        if (!row || typeof row !== "object" || Array.isArray(row)) continue;
        const mapped: Record<string, unknown> = {};
        for (const [destination, external] of Object.entries(mapping)) mapped[destination] = (row as any)[external];
        const key = rowKey(keyField, mapped[keyField]);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        let lead = leadByKey.get(key);
        if (!lead) {
          if (source.direction === "bidirectional") {
            const updates = applyMappedValues(null, mapped);
            const [inserted] = await db.insert(leadRecordsTable).values({
              orgId: a.orgId, createdByUserId: a.userId, source: `rest:${source.id}`,
              name: String(updates.name || mapped[keyField] || key), email: String(updates.email ?? ""),
              phone: String(updates.phone ?? ""), company: String(updates.company ?? ""),
              jobTitle: String(updates.jobTitle ?? ""), status: String(updates.status || "new"),
              customFieldsJson: (updates.customFieldsJson ?? {}) as Record<string, unknown>,
            }).returning();
            lead = inserted;
            leadByKey.set(key, lead);
            created++;
          } else {
            const updates = applyMappedValues(null, mapped);
            const [inserted] = await db.insert(leadRecordsTable).values({
              orgId: a.orgId, createdByUserId: a.userId, source: `rest:${source.id}`,
              name: String(updates.name || mapped[keyField] || key), email: String(updates.email ?? ""),
              phone: String(updates.phone ?? ""), company: String(updates.company ?? ""),
              jobTitle: String(updates.jobTitle ?? ""), status: String(updates.status || "new"),
              customFieldsJson: (updates.customFieldsJson ?? {}) as Record<string, unknown>,
            }).returning();
            lead = inserted;
            leadByKey.set(key, lead);
            created++;
          }
          pulled++;
          const crmValues = valuesFromLead(lead, mapping);
          if (source.direction === "bidirectional") pendingSnapshots.push({ leadId: lead.id, key, source: mapped, crm: crmValues });
          else await db.insert(crmSyncChangesTable).values({ orgId: a.orgId, runId: run.id, connectionId: source.id, leadId: lead.id, externalKey: key, changedFieldsJson: {}, sourceSnapshotJson: mapped, crmSnapshotJson: crmValues, isSnapshot: true });
          continue;
        }
        pulled++;
        const crmValues = valuesFromLead(lead, mapping);
        const [previous] = await db.select().from(crmSyncChangesTable).where(and(
          eq(crmSyncChangesTable.orgId, a.orgId),
          eq(crmSyncChangesTable.connectionId, source.id),
          eq(crmSyncChangesTable.externalKey, key),
          eq(crmSyncChangesTable.isSnapshot, true),
        )).orderBy(desc(crmSyncChangesTable.id)).limit(1);
        const sourceChanged = previous ? stableJson(previous.sourceSnapshotJson) !== stableJson(mapped) : false;
        const crmChanged = previous ? stableJson(previous.crmSnapshotJson) !== stableJson(crmValues) : false;
        const differs = stableJson(mapped) !== stableJson(crmValues);
        const makeConflict = async () => {
          const [open] = await db.select({ id: crmSyncConflictsTable.id }).from(crmSyncConflictsTable).where(and(
            eq(crmSyncConflictsTable.orgId, a.orgId), eq(crmSyncConflictsTable.connectionId, source.id),
            eq(crmSyncConflictsTable.leadId, lead.id), eq(crmSyncConflictsTable.status, "open"),
          )).limit(1);
          if (open) { conflicts++; return; }
          const [change] = await db.insert(crmSyncChangesTable).values({
            orgId: a.orgId, runId: run.id, connectionId: source.id, leadId: lead.id, externalKey: key,
            changedFieldsJson: { fields: Object.keys(mapped).filter((field) => stableJson(mapped[field]) !== stableJson(crmValues[field])) },
            sourceSnapshotJson: mapped, crmSnapshotJson: crmValues, isSnapshot: false,
          }).returning();
          await db.insert(crmSyncConflictsTable).values({
            orgId: a.orgId, connectionId: source.id, runId: run.id, changeId: change.id,
            leadId: lead.id, sourceSnapshotJson: mapped, crmSnapshotJson: crmValues,
          });
          conflicts++;
        };
        if (differs && ((!previous && source.direction === "bidirectional") || (sourceChanged && crmChanged))) {
          await makeConflict();
          continue;
        }
        if (sourceChanged && !crmChanged) {
          const updates = applyMappedValues(lead, mapped);
          const [updated] = await db.update(leadRecordsTable).set(updates).where(and(eq(leadRecordsTable.id, lead.id), eq(leadRecordsTable.orgId, a.orgId))).returning();
          lead = updated ?? { ...lead, ...updates };
        } else if (crmChanged && !sourceChanged && differs) {
          if (source.direction !== "bidirectional") { await makeConflict(); continue; }
        } else if (!previous && source.direction === "pull" && differs) {
          const updates = applyMappedValues(lead, mapped);
          const [updated] = await db.update(leadRecordsTable).set(updates).where(and(eq(leadRecordsTable.id, lead.id), eq(leadRecordsTable.orgId, a.orgId))).returning();
          lead = updated ?? { ...lead, ...updates };
        }
        const nextCrm = valuesFromLead(lead, mapping);
        if (source.direction === "pull" || !crmChanged || sourceChanged || !differs) {
          await db.insert(crmSyncChangesTable).values({ orgId: a.orgId, runId: run.id, connectionId: source.id, leadId: lead.id, externalKey: key, changedFieldsJson: {}, sourceSnapshotJson: mapped, crmSnapshotJson: nextCrm, isSnapshot: true });
        } else if (source.direction === "bidirectional") {
          outbound.push(toExternal(lead));
          pendingSnapshots.push({ leadId: lead.id, key, source: mapped, crm: nextCrm });
        }
      }
      if (source.direction === "bidirectional") {
        for (const lead of leads) {
          const key = leadKey(lead, keyField);
          if (key && !seen.has(key)) {
            outbound.push(toExternal(lead));
            seen.add(key);
            const crmValues = valuesFromLead(lead, mapping);
            pendingSnapshots.push({ leadId: lead.id, key, source: crmValues, crm: crmValues });
          }
        }
        if (outbound.length) {
          const body = JSON.stringify(outbound);
          if (Buffer.byteLength(body, "utf8") > 2 * 1024 * 1024) throw new Error("Request exceeds limit");
          await requestExternal(String(config.method ?? "POST"), body);
          pushed = outbound.length;
          for (const item of pendingSnapshots) {
            await db.insert(crmSyncChangesTable).values({
              orgId: a.orgId, runId: run.id, connectionId: source.id, leadId: item.leadId, externalKey: item.key,
              changedFieldsJson: {}, sourceSnapshotJson: item.source, crmSnapshotJson: item.crm, isSnapshot: true,
            });
          }
        }
      }
    }
    await db.update(crmSyncRunsTable).set({ status: "completed", completedAt: new Date(), summaryJson: { created, conflicts, pulled, pushed } }).where(and(eq(crmSyncRunsTable.id, run.id), eq(crmSyncRunsTable.orgId, a.orgId)));
    res.json({ runId: run.id, created, conflicts, pulled, pushed });
  } catch {
    await db.update(crmSyncRunsTable).set({ status: "failed", completedAt: new Date(), summaryJson: { error: "REST source sync failed" } }).where(and(eq(crmSyncRunsTable.id, run.id), eq(crmSyncRunsTable.orgId, a.orgId)));
    res.status(502).json({ error: "REST source sync failed. Check the endpoint and authorization, then retry." });
  }
});
router.post("/crm/sync/conflicts/:id/resolve", async (req, res) => {
  const a = await access(req, res, "crm.edit"); if (!a) return;
  const resolution = req.body?.resolution;
  if (resolution !== "crm" && resolution !== "source") { res.status(400).json({ error: "resolution must be crm or source" }); return; }
  const [conflict] = await db.select().from(crmSyncConflictsTable).where(and(eq(crmSyncConflictsTable.id, Number(req.params.id)), eq(crmSyncConflictsTable.orgId, a.orgId), eq(crmSyncConflictsTable.status, "open")));
  if (!conflict) { res.status(404).json({ error: "Conflict not found" }); return; }
  const [source] = await db.select().from(crmSourceConnectionsTable).where(and(eq(crmSourceConnectionsTable.id, conflict.connectionId), eq(crmSourceConnectionsTable.orgId, a.orgId)));
  const [lead] = conflict.leadId ? await db.select().from(leadRecordsTable).where(and(eq(leadRecordsTable.id, conflict.leadId), eq(leadRecordsTable.orgId, a.orgId))) : [];
  if (!lead) { res.status(409).json({ error: "The conflicted CRM lead no longer exists" }); return; }
  if (resolution === "crm" && !source) { res.status(409).json({ error: "The source connection was removed; only the source version can be kept" }); return; }
  const config = source?.configJson as any;
  const mapping = (config?.mapping ?? {}) as Record<string, string>;
  const sourceValues = conflict.sourceSnapshotJson as Record<string, unknown>;
  const [run] = await db.insert(crmSyncRunsTable).values({ orgId: a.orgId, connectionId: conflict.connectionId, direction: source?.direction ?? "pull" }).returning();
  try {
    let resolvedLead = lead;
    let finalSourceValues: Record<string, unknown>;
    let finalCrmValues: Record<string, unknown>;
    if (resolution === "source") {
      const updates = applyMappedValues(lead, sourceValues);
      const [updated] = await db.update(leadRecordsTable).set(updates).where(and(eq(leadRecordsTable.id, lead.id), eq(leadRecordsTable.orgId, a.orgId))).returning();
      resolvedLead = updated ?? { ...lead, ...updates };
      finalSourceValues = sourceValues;
      finalCrmValues = source ? valuesFromLead(resolvedLead, mapping) : sourceValues;
    } else {
      const crmValues = valuesFromLead(lead, mapping);
      if (source.direction === "pull") {
        finalSourceValues = sourceValues;
        finalCrmValues = crmValues;
      } else if (source.provider === "rest") {
        const endpoint = httpsUrl(config.endpoint);
        if (!endpoint) throw new Error("REST endpoint is invalid");
        const auth: Record<string, string> = source.encryptedAuth ? JSON.parse(decryptProtectedRecord(source.encryptedAuth, a.orgId)) : {};
        const headers: Record<string, string> = { accept: "application/json", "content-type": "application/json" };
        if (typeof auth.bearer === "string" && auth.bearer) headers.authorization = `Bearer ${auth.bearer}`;
        const outbound = Object.fromEntries(Object.entries(crmValues).map(([field, value]) => [mapping[field], value]));
        const body = JSON.stringify([outbound]);
        if (Buffer.byteLength(body, "utf8") > 2 * 1024 * 1024) throw new Error("REST resolution exceeds limit");
        const response = await safeFetch(endpoint, { method: String(config.method ?? "POST"), headers, body, timeoutMs: 15000, maxRedirects: 0, maxResponseBytes: 2 * 1024 * 1024 });
        if (response.status < 200 || response.status >= 300) throw new Error("REST source rejected resolution");
      } else if (source.provider === "google_sheets") {
        const cfg = googleConfig();
        if (!cfg || !source.encryptedAuth) throw new Error("Google Sheets authorization is unavailable");
        const rangeInfo = parseSheetRange(String(config.range ?? ""));
        if (!rangeInfo || !config.spreadsheetId) throw new Error("Google Sheets configuration is invalid");
        let token = JSON.parse(decryptProtectedRecord(source.encryptedAuth, a.orgId)) as Record<string, unknown>;
        const requestSheets = async (url: string, method = "GET", body?: string) => {
          let response = await safeFetch(url, { method, maxRedirects: 0, maxResponseBytes: 2 * 1024 * 1024, headers: { authorization: `Bearer ${String(token.access_token ?? "")}`, ...(body ? { "content-type": "application/json" } : {}) }, body, timeoutMs: 15000 });
          if (response.status === 401 && token.refresh_token) {
            const refreshed = await safeFetch("https://oauth2.googleapis.com/token", { method: "POST", maxRedirects: 0, maxResponseBytes: 64 * 1024, headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: String(token.refresh_token), grant_type: "refresh_token" }).toString(), timeoutMs: 15000 });
            if (refreshed.status < 200 || refreshed.status >= 300) throw new Error("Google Sheets authorization expired");
            token = { ...token, ...JSON.parse(refreshed.body.toString("utf8")) };
            await db.update(crmSourceConnectionsTable).set({ encryptedAuth: encryptProtectedRecord(JSON.stringify(token), a.orgId), updatedAt: new Date() }).where(and(eq(crmSourceConnectionsTable.id, source.id), eq(crmSourceConnectionsTable.orgId, a.orgId)));
            response = await safeFetch(url, { method, maxRedirects: 0, maxResponseBytes: 2 * 1024 * 1024, headers: { authorization: `Bearer ${String(token.access_token ?? "")}`, ...(body ? { "content-type": "application/json" } : {}) }, body, timeoutMs: 15000 });
          }
          if (response.status < 200 || response.status >= 300) throw new Error("Google Sheets request failed");
          return response;
        };
        const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}/values/${encodeURIComponent(config.range)}`;
        const values = JSON.parse((await requestSheets(sheetUrl)).body.toString("utf8")).values;
        if (!Array.isArray(values) || values.length > 5001 || !Array.isArray(values[0])) throw new Error("Google Sheets data is invalid");
        const headers = values[0].map((cell: unknown) => String(cell ?? "").trim());
        const offsets = new Map<string, number>();
        headers.forEach((header: string, index: number) => { if (header && !offsets.has(header)) offsets.set(header, index); });
        for (const header of Object.values(mapping)) if (!offsets.has(header)) throw new Error("Mapped Google Sheets header is missing");
        const keyField: "email" | "phone" = config.keyField === "phone" ? "phone" : "email";
        const wantedKey = rowKey(keyField, sourceValues[keyField]);
        let rowNumber = 0;
        for (const [index, row] of values.slice(1).entries()) {
          const candidateKey = rowKey(keyField, row[offsets.get(mapping[keyField])!] ?? "");
          if (candidateKey && candidateKey === wantedKey) { rowNumber = rangeInfo.startRow + index + 1; break; }
        }
        const data: Array<{ range: string; majorDimension: "ROWS"; values: unknown[][] }> = [];
        if (rowNumber) {
          for (const [field, value] of Object.entries(crmValues)) {
            const offset = offsets.get(mapping[field]);
            if (offset !== undefined) data.push({ range: `${rangeInfo.sheet}!${columnLetters(rangeInfo.startColumn + offset)}${rowNumber}`, majorDimension: "ROWS", values: [[value ?? ""]] });
          }
          const body = JSON.stringify({ valueInputOption: "RAW", data });
          if (Buffer.byteLength(body, "utf8") > 2 * 1024 * 1024) throw new Error("Google Sheets update exceeds limit");
          await requestSheets(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}/values:batchUpdate`, "POST", body);
        } else {
          const row = Array(Math.max(headers.length, ...Array.from(offsets.values(), (offset) => offset + 1))).fill("");
          for (const [field, value] of Object.entries(crmValues)) row[offsets.get(mapping[field])!] = String(value ?? "");
          const body = JSON.stringify({ majorDimension: "ROWS", values: [row] });
          await requestSheets(`${sheetUrl}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, "POST", body);
        }
      } else {
        throw new Error("Unsupported CRM source");
      }
      finalSourceValues = crmValues;
      finalCrmValues = crmValues;
    }
    await db.insert(crmSyncChangesTable).values({
      orgId: a.orgId, runId: run.id, connectionId: conflict.connectionId, leadId: lead.id,
      externalKey: String((resolution === "source" ? sourceValues : finalSourceValues)[(config?.keyField === "phone" ? "phone" : "email")] ?? ""),
      changedFieldsJson: {}, sourceSnapshotJson: finalSourceValues, crmSnapshotJson: finalCrmValues, isSnapshot: true,
    });
    const [resolved] = await db.update(crmSyncConflictsTable).set({ status: "resolved", resolution, resolvedByUserId: a.userId, resolvedAt: new Date() }).where(and(
      eq(crmSyncConflictsTable.id, conflict.id), eq(crmSyncConflictsTable.orgId, a.orgId), eq(crmSyncConflictsTable.status, "open"),
    )).returning({ id: crmSyncConflictsTable.id });
    if (!resolved) throw new Error("Conflict was already resolved");
    await db.update(crmSyncRunsTable).set({ status: "completed", completedAt: new Date(), summaryJson: { resolution, conflictId: conflict.id } }).where(and(eq(crmSyncRunsTable.id, run.id), eq(crmSyncRunsTable.orgId, a.orgId)));
    res.json({ ok: true, resolution });
  } catch {
    await db.update(crmSyncRunsTable).set({ status: "failed", completedAt: new Date(), summaryJson: { error: "Conflict resolution failed" } }).where(and(eq(crmSyncRunsTable.id, run.id), eq(crmSyncRunsTable.orgId, a.orgId)));
    res.status(502).json({ error: "Could not apply this conflict choice to CRM and its source. Retry after checking source access." });
  }
});
export default router;