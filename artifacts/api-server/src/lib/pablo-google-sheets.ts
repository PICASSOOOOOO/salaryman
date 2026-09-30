import { and, eq } from "drizzle-orm";
import { db, crmSourceConnectionsTable } from "@workspace/db";
import { canDoInOrg, resolveCurrentOrgId } from "./org-permissions";
import { decryptProtectedRecord, encryptProtectedRecord } from "./org-protected-records-crypto";
import { safeFetch } from "./site-proxy";

const MAX_ROWS = 100;
const MAX_CELL = 2000;
const MAX_BODY = 512 * 1024;

export type SheetsToolAccess = { orgId: number; canView: boolean; canEdit: boolean };
export async function getPabloSheetsAccess(userId: string): Promise<SheetsToolAccess | null> {
  const orgId = await resolveCurrentOrgId(userId);
  if (!orgId) return null;
  const [view, edit] = await Promise.all([canDoInOrg(userId, orgId, "crm.view"), canDoInOrg(userId, orgId, "crm.edit")]);
  return { orgId, canView: view.allowed, canEdit: edit.allowed };
}

function config() {
  const { GOOGLE_SHEETS_CLIENT_ID: clientId, GOOGLE_SHEETS_CLIENT_SECRET: clientSecret } = process.env;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}
function safeText(v: unknown) { return String(v ?? "").slice(0, MAX_CELL); }
function columnLetters(n: number) {
  let out = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) out = String.fromCharCode(65 + ((x - 1) % 26)) + out;
  return out;
}
/** Exact matching is deliberately separate so callers can prove multi-match
 * updates are rejected before any write request is sent. */
export function findExactSheetRow(rows: unknown[][], keyIndex: number, keyValue: unknown) {
  const wanted = safeText(keyValue).trim().toLowerCase();
  const matches = rows.map((row, index) => ({ row, index })).filter(({ row }) => safeText(row?.[keyIndex]).trim().toLowerCase() === wanted);
  return matches.length === 1 ? matches[0] : null;
}
function sourceConfig(source: any) {
  const c = source.configJson as any;
  if (!c || typeof c !== "object" || typeof c.spreadsheetId !== "string" || typeof c.range !== "string" || !c.spreadsheetId || !c.range)
    throw new Error("Google Sheets source is not configured");
  return c;
}
async function source(orgId: number, sourceId: number) {
  const [s] = await db.select().from(crmSourceConnectionsTable).where(and(
    eq(crmSourceConnectionsTable.id, sourceId), eq(crmSourceConnectionsTable.orgId, orgId),
    eq(crmSourceConnectionsTable.provider, "google_sheets"),
  ));
  if (!s) throw new Error("Configured Google Sheets source not found");
  return s;
}
async function request(sourceRow: any, orgId: number, path: string, method = "GET", body?: string) {
  const cfg = config(); if (!cfg) throw new Error("Google Sheets integration is unavailable");
  let token: any;
  try { token = JSON.parse(decryptProtectedRecord(sourceRow.encryptedAuth, orgId)); } catch { throw new Error("Google Sheets authorization is unavailable"); }
  if (!token.access_token) throw new Error("Google Sheets authorization is unavailable");
  const call = (access: string) => safeFetch(`https://sheets.googleapis.com/v4/${path}`, {
    method, maxRedirects: 0, maxResponseBytes: MAX_BODY, timeoutMs: 15000,
    headers: { authorization: `Bearer ${access}`, ...(body ? { "content-type": "application/json" } : {}) }, body,
  });
  let response = await call(String(token.access_token));
  if (response.status === 401 && token.refresh_token) {
    const refreshed = await safeFetch("https://oauth2.googleapis.com/token", {
      method: "POST", maxRedirects: 0, maxResponseBytes: 64 * 1024, timeoutMs: 15000,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: token.refresh_token, grant_type: "refresh_token" }).toString(),
    });
    if (refreshed.status < 200 || refreshed.status >= 300) throw new Error("Google Sheets authorization expired");
    const next = JSON.parse(refreshed.body.toString("utf8"));
    token = { ...token, ...next };
    await db.update(crmSourceConnectionsTable).set({ encryptedAuth: encryptProtectedRecord(JSON.stringify(token), orgId), updatedAt: new Date() }).where(eq(crmSourceConnectionsTable.id, sourceRow.id));
    response = await call(String(token.access_token));
  }
  if (response.status < 200 || response.status >= 300) throw new Error("Google Sheets request failed");
  return JSON.parse(response.body.toString("utf8"));
}

export async function listPabloSheetSources(access: SheetsToolAccess) {
  if (!access.canView) throw new Error("CRM view permission required");
  const rows = await db.select().from(crmSourceConnectionsTable).where(and(eq(crmSourceConnectionsTable.orgId, access.orgId), eq(crmSourceConnectionsTable.provider, "google_sheets")));
  return rows.slice(0, 50).map((s: any) => ({ sourceId: s.id, name: s.name ?? `Google Sheet ${s.id}`, range: (s.configJson as any)?.range ?? "" }));
}

export async function readPabloSheet(access: SheetsToolAccess, sourceId: number, maxRows = MAX_ROWS) {
  if (!access.canView) throw new Error("CRM view permission required");
  const s = await source(access.orgId, sourceId); const c = sourceConfig(s);
  const data = await request(s, access.orgId, `spreadsheets/${encodeURIComponent(c.spreadsheetId)}/values/${encodeURIComponent(c.range)}`);
  const values = Array.isArray(data.values) ? data.values.slice(0, Math.min(MAX_ROWS, Math.max(1, Math.floor(maxRows)))) : [];
  const headers = (values.shift() ?? []).map((v: unknown) => safeText(v));
  const rows = values.map((row: unknown[]) => Object.fromEntries(headers.map((h: string, i: number) => [h || `column_${i + 1}`, safeText(row?.[i])])));
  return { sourceId, headers, rows };
}

export async function writePabloSheet(access: SheetsToolAccess, args: { sourceId: number; operation: "append" | "update"; keyField?: string; keyValue?: string; values: Record<string, unknown> }) {
  if (!access.canEdit) throw new Error("CRM edit permission required");
  if (!args.values || typeof args.values !== "object" || Object.keys(args.values).length > 100) throw new Error("Invalid row values");
  const s = await source(access.orgId, args.sourceId); const c = sourceConfig(s);
  const mapping = c.mapping && typeof c.mapping === "object" ? c.mapping as Record<string, string> : {};
  const read = await request(s, access.orgId, `spreadsheets/${encodeURIComponent(c.spreadsheetId)}/values/${encodeURIComponent(c.range)}`);
  const all = Array.isArray(read.values) ? read.values.slice(0, MAX_ROWS + 1) : [];
  const headers = (all[0] ?? []).map((v: unknown) => safeText(v));
  const row = headers.map((header: string) => safeText(args.values[header] ?? args.values[Object.keys(mapping).find(k => mapping[k] === header) ?? ""] ?? ""));
  if (args.operation === "append") {
    const body = JSON.stringify({ majorDimension: "ROWS", values: [row] });
    if (Buffer.byteLength(body) > MAX_BODY) throw new Error("Row is too large");
    await request(s, access.orgId, `spreadsheets/${encodeURIComponent(c.spreadsheetId)}/values/${encodeURIComponent(c.range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, "POST", body);
    return { operation: "append", sourceId: args.sourceId, written: 1 };
  }
  if (!args.keyField || args.keyValue === undefined) throw new Error("Exact key is required for update");
  const keyHeader = mapping[args.keyField] ?? args.keyField;
  const keyIndex = headers.indexOf(keyHeader); if (keyIndex < 0) throw new Error("Update key column not found");
  const matches = all.slice(1).map((r: any[]) => r);
  const match = findExactSheetRow(matches, keyIndex, args.keyValue);
  const matchCount = matches.filter(r => safeText(r?.[keyIndex]).trim().toLowerCase() === safeText(args.keyValue).trim().toLowerCase()).length;
  if (!match) throw new Error(matchCount > 1 ? "Update key matched multiple rows; no changes made" : "Update key did not match a row");
  const rowNumber = 2 + match.index;
  // Preserve cells not included in the requested patch; an update must never
  // turn omitted fields into blanks.
  const existingRow = match.row;
  for (let i = 0; i < headers.length; i++) {
    const field = Object.keys(mapping).find(k => mapping[k] === headers[i]);
    if (!Object.prototype.hasOwnProperty.call(args.values, headers[i]) && (!field || !Object.prototype.hasOwnProperty.call(args.values, field))) {
      row[i] = safeText(existingRow?.[i]);
    }
  }
  const range = `${String(c.range).split("!")[0]}!A${rowNumber}:${columnLetters(headers.length)}${rowNumber}`;
  await request(s, access.orgId, `spreadsheets/${encodeURIComponent(c.spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, "PUT", JSON.stringify({ majorDimension: "ROWS", values: [row] }));
  return { operation: "update", sourceId: args.sourceId, written: 1 };
}