import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import XLSX from "xlsx";
import { and, eq } from "drizzle-orm";
import {
  db,
  crmCustomFieldsTable,
  leadRecordsTable,
  CRM_CUSTOM_FIELD_TYPES,
  LEAD_STATUSES,
} from "@workspace/db";
import { canDoInOrg, resolveCurrentOrgId } from "./org-permissions";

const CORE_KEYS = new Set([
  "id", "orgId", "name", "phone", "email", "company", "business", "jobTitle",
  "source", "status", "assignedUserId", "callCount", "createdAt", "updatedAt",
]);
const IMPORTABLE_CORE_FIELDS = new Set(["name", "phone", "email", "company", "jobTitle", "status"]);
const CORE_ALIASES: Record<string, string> = {
  fullname: "name",
  mobile: "phone",
  phonenumber: "phone",
  mail: "email",
  business: "company",
  organization: "company",
  title: "jobTitle",
};
const MAX_ASSISTED_IMPORT_ROWS = 5000;

export type ParsedCrmImport = { headers: string[]; rows: string[][] };
export type CrmImportField = {
  fieldKey: string;
  label: string;
  fieldType: string;
  optionsJson?: string[] | null;
  required: boolean;
};
export type CrmImportResult = {
  created: number;
  updated: number;
  skipped: number;
  conflicts: Array<{ row: number; reason: string; leadIds: number[] }>;
  errors: Array<{ row: number; error: string }>;
};

export function normalizeCrmImportHeader(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export async function parseCrmImportBuffer(buffer: Buffer, fileName: string): Promise<ParsedCrmImport> {
  const lowerName = fileName.toLowerCase();
  if (!/\.(csv|xlsx|xls|xlsm)$/.test(lowerName)) {
    throw new Error("Choose a CSV, XLS, XLSX, or XLSM file");
  }

  if (/\.xls$/i.test(lowerName)) {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as unknown[][] : [];
    const rows = rawRows.map(row => Array.isArray(row) ? row.map(value => String(value ?? "").trim()) : []);
    return { headers: rows[0] ?? [], rows: rows.slice(1).filter(row => row.some(Boolean)) };
  }

  const workbook = new ExcelJS.Workbook();
  if (/\.(xlsx|xlsm)$/i.test(lowerName)) {
    await workbook.xlsx.load(buffer as any);
  } else {
    await workbook.csv.read(Readable.from([buffer.toString("utf8").replace(/^\uFEFF/, "")]));
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };
  const allRows: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, row => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => { values[column - 1] = cell.text; });
    allRows.push(values.map(value => String(value ?? "").trim()));
  });
  return { headers: allRows[0] ?? [], rows: allRows.slice(1).filter(row => row.some(Boolean)) };
}

export function autoMapCrmImportHeaders(headers: string[], fields: CrmImportField[]) {
  const mapping: Record<string, string> = {};
  const usedDestinations = new Set<string>();
  for (const header of headers) {
    const normalized = normalizeCrmImportHeader(header);
    const core = CORE_ALIASES[normalized]
      ?? [...IMPORTABLE_CORE_FIELDS].find(key => normalizeCrmImportHeader(key) === normalized);
    const custom = fields.find(field =>
      normalizeCrmImportHeader(field.fieldKey) === normalized ||
      normalizeCrmImportHeader(field.label) === normalized,
    );
    const destination = core ?? custom?.fieldKey;
    if (!header.trim() || !destination || usedDestinations.has(destination)) continue;
    mapping[header] = destination;
    usedDestinations.add(destination);
  }
  return mapping;
}

function validateValue(field: CrmImportField, value: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (value === null || value === undefined || String(value).trim() === "") {
    return field.required ? { ok: false, error: `${field.fieldKey} is required` } : { ok: true, value: null };
  }
  if (field.fieldType === "number") {
    const number = Number(value);
    return Number.isFinite(number) ? { ok: true, value: number } : { ok: false, error: `${field.fieldKey} must be a number` };
  }
  if (field.fieldType === "boolean") {
    const normalized = normalizeCrmImportHeader(value);
    if (["true", "yes", "1"].includes(normalized)) return { ok: true, value: true };
    if (["false", "no", "0"].includes(normalized)) return { ok: true, value: false };
    return { ok: false, error: `${field.fieldKey} must be boolean` };
  }
  if (field.fieldType === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime())
      ? { ok: false, error: `${field.fieldKey} must be a date` }
      : { ok: true, value: date.toISOString().slice(0, 10) };
  }
  if (field.fieldType === "select" && !(field.optionsJson ?? []).includes(String(value))) {
    return { ok: false, error: `${field.fieldKey} must be one of the configured options` };
  }
  return { ok: true, value: String(value).trim() };
}

export async function applyCrmLeadImport(args: {
  orgId: number;
  userId: string;
  headers: string[];
  rows: unknown[];
  mapping: Record<string, unknown>;
  existingRowPolicy: "skip" | "update";
  authority: "import" | "crm";
}): Promise<CrmImportResult> {
  const { orgId, userId, headers, rows, mapping } = args;
  if (!headers.length || !rows.length || !["skip", "update"].includes(args.existingRowPolicy) || !["import", "crm"].includes(args.authority)) {
    throw new Error("headers, rows, explicit mapping, existingRowPolicy, and authority are required");
  }

  const destinations = Object.values(mapping).map(String).map(key => key === "business" ? "company" : key);
  if (
    new Set(destinations).size !== destinations.length ||
    destinations.some(key => key.startsWith("_") || (CORE_KEYS.has(key) && !IMPORTABLE_CORE_FIELDS.has(key))) ||
    Object.keys(mapping).some(header => !headers.includes(header))
  ) {
    throw new Error("Mapping contains duplicate, unknown, or protected destinations");
  }

  const fields = await db.select().from(crmCustomFieldsTable).where(and(
    eq(crmCustomFieldsTable.orgId, orgId),
    eq(crmCustomFieldsTable.archived, false),
  )) as CrmImportField[];
  const byKey = new Map(fields.map(field => [field.fieldKey, field]));
  for (const destination of destinations) {
    if (!IMPORTABLE_CORE_FIELDS.has(destination) && !byKey.has(destination)) {
      throw new Error(`Unknown destination: ${destination}`);
    }
  }

  const leads = await db.select().from(leadRecordsTable).where(eq(leadRecordsTable.orgId, orgId));
  const result: CrmImportResult = { created: 0, updated: 0, skipped: 0, conflicts: [], errors: [] };
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] as unknown[] : [];
    const data: Record<string, any> = {};
    const custom: Record<string, unknown> = {};
    const rowErrors: Array<{ row: number; error: string }> = [];
    const invalidCustomFields = new Set<string>();

    for (const [header, rawDestination] of Object.entries(mapping)) {
      const destination = String(rawDestination) === "business" ? "company" : String(rawDestination);
      const value = row[headers.indexOf(header)];
      const text = value == null ? "" : String(value).trim();
      if (CORE_KEYS.has(destination)) data[destination] = text;
      if (IMPORTABLE_CORE_FIELDS.has(destination)) {
        if (destination === "status") {
          if (text && !(LEAD_STATUSES as readonly string[]).includes(text)) {
            rowErrors.push({ row: rowIndex + 1, error: `status must be one of: ${LEAD_STATUSES.join(", ")}` });
          } else if (text) {
            data.status = text;
          } else {
            delete data.status;
          }
        } else {
          data[destination] = text;
        }
      } else {
        const fieldKey = String(rawDestination);
        const field = byKey.get(fieldKey);
        if (!field || !(CRM_CUSTOM_FIELD_TYPES as readonly string[]).includes(field.fieldType)) {
          rowErrors.push({ row: rowIndex + 1, error: `${fieldKey} is not an available CRM field` });
          invalidCustomFields.add(fieldKey);
          continue;
        }
        const valid = validateValue(field, value);
        if (!valid.ok) {
          rowErrors.push({ row: rowIndex + 1, error: valid.error });
          invalidCustomFields.add(fieldKey);
        } else {
          custom[fieldKey] = valid.value;
        }
      }
    }

    for (const field of fields) {
      if (field.required && !invalidCustomFields.has(field.fieldKey) &&
        (custom[field.fieldKey] === undefined || custom[field.fieldKey] === null || custom[field.fieldKey] === "")) {
        rowErrors.push({ row: rowIndex + 1, error: `${field.fieldKey} is required` });
      }
    }
    if (!data.name) rowErrors.push({ row: rowIndex + 1, error: "Name is required" });
    if (rowErrors.length) {
      result.errors.push(...rowErrors);
      continue;
    }

    const email = String(data.email ?? "").trim().toLowerCase();
    const phone = String(data.phone ?? "").replace(/\D/g, "");
    const matches = leads.filter((lead: any) =>
      (email && String(lead.email ?? "").toLowerCase() === email) ||
      (phone && String(lead.phone ?? "").replace(/\D/g, "").slice(-10) === phone.slice(-10)),
    );
    if (matches.length > 1) {
      result.conflicts.push({ row: rowIndex + 1, reason: "ambiguous_match", leadIds: matches.map((lead: any) => lead.id) });
      continue;
    }
    if (matches.length === 1) {
      if (args.existingRowPolicy === "skip" || args.authority === "crm") {
        result.skipped++;
        continue;
      }
      const existing = matches[0] as any;
      const updates: Record<string, unknown> = { customFieldsJson: { ...(existing.customFieldsJson ?? {}), ...custom } };
      for (const key of ["name", "phone", "email", "company", "jobTitle", "status"]) {
        if (data[key] !== undefined) updates[key] = data[key];
      }
      const [updated] = await db.update(leadRecordsTable).set(updates).where(and(
        eq(leadRecordsTable.id, existing.id),
        eq(leadRecordsTable.orgId, orgId),
      )).returning();
      if (updated) Object.assign(existing, updated);
      result.updated++;
      continue;
    }

    const [created] = await db.insert(leadRecordsTable).values({
      orgId,
      name: data.name,
      phone: data.phone ?? "",
      email: data.email ?? "",
      company: data.company ?? "",
      jobTitle: data.jobTitle ?? "",
      source: "crm_import",
      status: data.status ?? "new",
      createdByUserId: userId,
      customFieldsJson: custom,
    }).returning();
    if (created) {
      result.created++;
      leads.push(created);
    }
  }
  return result;
}

export async function importPabloCrmFile(args: {
  userId: string;
  file: { buffer: Buffer; originalname: string };
}) {
  const orgId = await resolveCurrentOrgId(args.userId);
  if (!orgId) throw new Error("Choose an organization before importing CRM data");
  if (!(await canDoInOrg(args.userId, orgId, "crm.edit")).allowed) {
    throw new Error("CRM edit permission is required to import records");
  }

  const parsed = await parseCrmImportBuffer(args.file.buffer, args.file.originalname);
  if (!parsed.headers.length || !parsed.rows.length) throw new Error("The file has no header row or contact rows");
  if (parsed.rows.length > MAX_ASSISTED_IMPORT_ROWS) {
    throw new Error(`The assisted import limit is ${MAX_ASSISTED_IMPORT_ROWS} rows per file`);
  }
  if (parsed.headers.length > 100) throw new Error("The file has more than 100 columns");
  const nonEmptyHeaders = parsed.headers.filter(header => header.trim());
  const normalizedHeaders = nonEmptyHeaders.map(normalizeCrmImportHeader);
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new Error("The file has duplicate column headings. Rename them and upload it again.");
  }

  const fields = await db.select().from(crmCustomFieldsTable).where(and(
    eq(crmCustomFieldsTable.orgId, orgId),
    eq(crmCustomFieldsTable.archived, false),
  )) as CrmImportField[];
  const mapping = autoMapCrmImportHeaders(parsed.headers, fields);
  if (!Object.values(mapping).includes("name")) {
    throw new Error("I couldn't identify a lead-name column. Rename a column to Name, Full Name, or Lead Name and try again.");
  }
  const result = await applyCrmLeadImport({
    orgId,
    userId: args.userId,
    headers: parsed.headers,
    rows: parsed.rows,
    mapping,
    existingRowPolicy: "skip",
    authority: "import",
  });
  const MAX_REPORTED_ROWS = 25;
  return {
    fileName: args.file.originalname.slice(0, 180),
    rowsRead: parsed.rows.length,
    mappedColumns: mapping,
    ignoredColumns: parsed.headers.filter(header => header.trim() && !mapping[header]),
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    conflictCount: result.conflicts.length,
    conflicts: result.conflicts.slice(0, MAX_REPORTED_ROWS),
    errors: result.errors.slice(0, MAX_REPORTED_ROWS),
    errorCount: result.errors.length,
    omittedConflictCount: Math.max(0, result.conflicts.length - MAX_REPORTED_ROWS),
    omittedErrorCount: Math.max(0, result.errors.length - MAX_REPORTED_ROWS),
  };
}