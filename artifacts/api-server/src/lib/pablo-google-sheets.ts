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
function normalizedKey(v: unknown) { return String(v ?? "").trim().toLowerCase(); }
function columnLetters(n: number) {
  let out = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) out = String.fromCharCode(65 + ((x - 1) % 26)) + out;
  return out;
}
/** Exact matching is deliberately separate so callers can prove multi-match
 * updates are rejected before any write request is sent. */
export function findExactSheetRow(rows: unknown[][], keyIndex: number, keyValue: unknown) {
  const wanted = normalizedKey(keyValue);
  const matches = rows.map((row, index) => ({ row, index })).filter(({ row }) => normalizedKey(row?.[keyIndex]) === wanted);
  return matches.length === 1 ? matches[0] : null;
}
function sourceConfig(source: any) {
  const c = source.configJson as any;
  if (!c || typeof c !== "object" || typeof c.spreadsheetId !== "string" || typeof c.range !== "string" || !c.spreadsheetId || !c.range)
    throw new Error("Google Sheets source is not configured");
  if (!parseA1Range(c.range)) throw new Error("Google Sheets source has an invalid range");
  return c;
}
function parseA1Range(range: string) {
  const bang = range.lastIndexOf("!");
  if (bang <= 0) return null;
  const sheet = range.slice(0, bang);
  const cells = range.slice(bang + 1).split(":");
  const first = cells[0]?.replace(/\$/g, "").match(/^([A-Z]+)(\d+)$/i);
  const last = cells[1]?.replace(/\$/g, "").match(/^([A-Z]+)(\d+)?$/i);
  if (!first || (cells[1] && !last)) return null;
  const columnNumber = (letters: string) => letters.toUpperCase().split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  if (last && columnNumber(last[1]) < columnNumber(first[1])) return null;
  return { sheet, startColumn: columnNumber(first[1]), startRow: Number(first[2]) };
}
async function source(orgId: number, sourceId: number) {
  if (!Number.isSafeInteger(sourceId) || sourceId <= 0) throw new Error("Invalid Google Sheets source");
  const [s] = await db.select().from(crmSourceConnectionsTable).where(and(
    eq(crmSourceConnectionsTable.id, sourceId), eq(crmSourceConnectionsTable.orgId, orgId),
    eq(crmSourceConnectionsTable.provider, "google_sheets"),
  ));
  if (!s || s.enabled !== "true") throw new Error("Enabled Google Sheets source not found");
  return s;
}
async function request(sourceRow: any, orgId: number, path: string, method = "GET", body?: string) {
  const cfg = config(); if (!cfg) throw new Error("Google Sheets integration is unavailable");
  let token: any;
  try { token = JSON.parse(decryptProtectedRecord(sourceRow.encryptedAuth, orgId)); } catch { throw new Error("Google Sheets authorization is unavailable"); }
  if (!token.access_token) throw new Error("Google Sheets authorization is unavailable");
  const call = async (access: string) => {
    try {
      return await safeFetch(`https://sheets.googleapis.com/v4/${path}`, {
        method, maxRedirects: 0, maxResponseBytes: MAX_BODY, timeoutMs: 15000,
        headers: { authorization: `Bearer ${access}`, ...(body ? { "content-type": "application/json" } : {}) }, body,
      });
    } catch {
      throw new Error("Could not reach Google Sheets. Check the source connection and retry.");
    }
  };
  let response = await call(String(token.access_token));
  if (response.status === 401 && token.refresh_token) {
    let refreshed;
    try {
      refreshed = await safeFetch("https://oauth2.googleapis.com/token", {
        method: "POST", maxRedirects: 0, maxResponseBytes: 64 * 1024, timeoutMs: 15000,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: token.refresh_token, grant_type: "refresh_token" }).toString(),
      });
    } catch {
      throw new Error("Could not reach Google's authorization service. Reconnect the Sheets source and retry.");
    }
    if (refreshed.status < 200 || refreshed.status >= 300) throw new Error("Google Sheets authorization expired");
    let next: Record<string, unknown>;
    try { next = JSON.parse(refreshed.body.toString("utf8")); }
    catch { throw new Error("Google authorization returned unreadable data. Reconnect the Sheets source."); }
    token = { ...token, ...next };
    await db.update(crmSourceConnectionsTable).set({ encryptedAuth: encryptProtectedRecord(JSON.stringify(token), orgId), updatedAt: new Date() }).where(eq(crmSourceConnectionsTable.id, sourceRow.id));
    response = await call(String(token.access_token));
  }
  if (response.status < 200 || response.status >= 300) {
    if (response.status === 401) throw new Error("Google Sheets authorization expired. Reconnect the source.");
    if (response.status === 403) throw new Error("Google denied access. Confirm the connected account has spreadsheet access.");
    if (response.status === 404) throw new Error("Configured spreadsheet or worksheet was not found. Check the source range.");
    if (response.status === 400) throw new Error("Google Sheets rejected the request. Check the configured range.");
    if (response.status === 429) throw new Error("Google Sheets rate limit reached. Wait briefly, then retry.");
    if (response.status >= 500) throw new Error("Google Sheets is temporarily unavailable. Retry shortly.");
    throw new Error("Google Sheets request failed. Check the source configuration and retry.");
  }
  try { return JSON.parse(response.body.toString("utf8")); }
  catch { throw new Error("Google Sheets returned unreadable data. Check the configured source and retry."); }
}

export async function listPabloSheetSources(access: SheetsToolAccess) {
  if (!access.canView) throw new Error("CRM view permission required");
  const rows = await db.select().from(crmSourceConnectionsTable).where(and(eq(crmSourceConnectionsTable.orgId, access.orgId), eq(crmSourceConnectionsTable.provider, "google_sheets")));
  return rows.filter((s: any) => s.enabled === "true").slice(0, 50).map((s: any) => ({ sourceId: s.id, name: s.name ?? `Google Sheet ${s.id}`, range: (s.configJson as any)?.range ?? "" }));
}

export async function readPabloSheet(access: SheetsToolAccess, sourceId: number, maxRows = MAX_ROWS) {
  if (!access.canView) throw new Error("CRM view permission required");
  const s = await source(access.orgId, sourceId); const c = sourceConfig(s);
  const data = await request(s, access.orgId, `spreadsheets/${encodeURIComponent(c.spreadsheetId)}/values/${encodeURIComponent(c.range)}`);
  const safeMaxRows = Number.isFinite(maxRows) ? Math.min(MAX_ROWS, Math.max(1, Math.floor(maxRows))) : MAX_ROWS;
  const values = Array.isArray(data.values) ? data.values.slice(0, safeMaxRows + 1) : [];
  if (values.some((row: unknown) => !Array.isArray(row) || row.length > 100)) throw new Error("Google Sheets range exceeds the supported column limit");
  const headers = (values.shift() ?? []).map((v: unknown) => safeText(v));
  if (!headers.length) throw new Error("Google Sheets range is missing its header row");
  const rows = values.map((row: unknown[]) => Object.fromEntries(headers.map((h: string, i: number) => [h || `column_${i + 1}`, safeText(row?.[i])])));
  return { sourceId, headers, rows };
}

export async function writePabloSheet(access: SheetsToolAccess, args: { sourceId: number; operation: "append" | "update"; keyField?: string; keyValue?: string; values: Record<string, unknown> }) {
  if (!access.canView || !access.canEdit) throw new Error("CRM view and edit permissions required");
  if (!["append", "update"].includes(args.operation)) throw new Error("Unsupported Google Sheets write operation");
  if (!args.values || typeof args.values !== "object" || Array.isArray(args.values) || Object.keys(args.values).length < 1 || Object.keys(args.values).length > 100) throw new Error("Invalid row values");
  for (const value of Object.values(args.values)) {
    if (typeof value !== "string" || value.length > MAX_CELL) throw new Error(`Each cell must be text no longer than ${MAX_CELL} characters`);
  }
  const s = await source(access.orgId, args.sourceId); const c = sourceConfig(s);
  const rangeInfo = parseA1Range(c.range);
  if (!rangeInfo) throw new Error("Google Sheets source has an invalid range");
  const mapping = c.mapping && typeof c.mapping === "object" ? c.mapping as Record<string, string> : {};
  const read = await request(s, access.orgId, `spreadsheets/${encodeURIComponent(c.spreadsheetId)}/values/${encodeURIComponent(c.range)}`);
  const all = Array.isArray(read.values) ? read.values.slice(0, MAX_ROWS + 1) : [];
  if (!Array.isArray(all[0])) throw new Error("Google Sheets range is missing its header row");
  if (all.some((row: unknown) => !Array.isArray(row) || row.length > 100)) throw new Error("Google Sheets range exceeds the supported column limit");
  const headers = (all[0] ?? []).map((v: unknown) => safeText(v));
  if (!headers.length) throw new Error("Google Sheets range is missing its header row");
  const row: unknown[] = headers.map((header: string) => safeText(args.values[header] ?? args.values[Object.keys(mapping).find(k => mapping[k] === header) ?? ""] ?? ""));
  if (args.operation === "append") {
    const body = JSON.stringify({ majorDimension: "ROWS", values: [row] });
    if (Buffer.byteLength(body) > MAX_BODY) throw new Error("Row is too large");
    await request(s, access.orgId, `spreadsheets/${encodeURIComponent(c.spreadsheetId)}/values/${encodeURIComponent(c.range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, "POST", body);
    return { operation: "append", sourceId: args.sourceId, written: 1 };
  }
  if (!args.keyField || typeof args.keyValue !== "string" || !args.keyValue.trim() || args.keyValue.length > MAX_CELL) throw new Error("A non-empty exact key of at most 2000 characters is required for update");
  const keyHeader = mapping[args.keyField] ?? args.keyField;
  const keyIndex = headers.indexOf(keyHeader); if (keyIndex < 0) throw new Error("Update key column not found");
  const matches = all.slice(1).map((r: any[]) => r);
  const match = findExactSheetRow(matches, keyIndex, args.keyValue);
  const matchCount = matches.filter(r => normalizedKey(r?.[keyIndex]) === normalizedKey(args.keyValue)).length;
  if (!match) throw new Error(matchCount > 1 ? "Update key matched multiple rows; no changes made" : "Update key did not match within the first 100 data rows checked; no changes made");
  const rowNumber = rangeInfo.startRow + 1 + match.index;
  // Preserve cells not included in the requested patch; an update must never
  // turn omitted fields into blanks.
  const existingRow = match.row;
  for (let i = 0; i < headers.length; i++) {
    const field = Object.keys(mapping).find(k => mapping[k] === headers[i]);
    if (!Object.prototype.hasOwnProperty.call(args.values, headers[i]) && (!field || !Object.prototype.hasOwnProperty.call(args.values, field))) {
      row[i] = existingRow?.[i] ?? "";
    }
  }
  const range = `${rangeInfo.sheet}!${columnLetters(rangeInfo.startColumn)}${rowNumber}:${columnLetters(rangeInfo.startColumn + headers.length - 1)}${rowNumber}`;
  await request(s, access.orgId, `spreadsheets/${encodeURIComponent(c.spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, "PUT", JSON.stringify({ majorDimension: "ROWS", values: [row] }));
  return { operation: "update", sourceId: args.sourceId, written: 1 };
}