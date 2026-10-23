import { Router, type Request, type Response } from "express";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import {
  db,
  crmCustomFieldsTable,
  LEAD_STATUSES,
  leadRecordsTable,
  orgConnectorActivityTable,
  type OrgConnectorScope,
} from "@workspace/db";
import {
  authenticateOrgConnectorToken,
  parseOrgConnectorBearer,
} from "../lib/org-connector-auth";
import { hasOrgConnectorScope } from "../lib/org-connectors";

const router = Router();

const PUBLIC_LEAD_FIELDS = {
  id: leadRecordsTable.id,
  name: leadRecordsTable.name,
  phone: leadRecordsTable.phone,
  email: leadRecordsTable.email,
  company: leadRecordsTable.company,
  jobTitle: leadRecordsTable.jobTitle,
  status: leadRecordsTable.status,
  source: leadRecordsTable.source,
  customFieldsJson: leadRecordsTable.customFieldsJson,
  createdAt: leadRecordsTable.createdAt,
  updatedAt: leadRecordsTable.updatedAt,
};

type ConnectorPrincipal = NonNullable<Awaited<ReturnType<typeof authenticateOrgConnectorToken>>>;

async function requireScope(
  req: Request,
  res: Response,
  scope: OrgConnectorScope,
): Promise<ConnectorPrincipal | null> {
  const token = parseOrgConnectorBearer(req.get("authorization"));
  if (!token) {
    res.status(401).json({ error: "Valid connector bearer token required" });
    return null;
  }
  const principal = await authenticateOrgConnectorToken(token);
  if (!principal) {
    res.status(401).json({ error: "Connector token is invalid or revoked" });
    return null;
  }
  if (!hasOrgConnectorScope(principal.scopes, scope)) {
    res.status(403).json({ error: `The organization has not granted ${scope}.` });
    return null;
  }
  return principal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateCustomFieldValues(
  orgId: number,
  input: unknown,
  options: { requireRequired: boolean },
): Promise<{ value?: Record<string, unknown>; error?: string }> {
  return (async () => {
    if (input === undefined) input = {};
    if (!isRecord(input)) return { error: "customFieldsJson must be an object" };
    const fields = await db.select().from(crmCustomFieldsTable)
      .where(and(eq(crmCustomFieldsTable.orgId, orgId), eq(crmCustomFieldsTable.archived, false)));
    const byKey = new Map(fields.map((field) => [field.fieldKey, field]));
    for (const [key, value] of Object.entries(input)) {
      const field = byKey.get(key);
      if (!field) return { error: `Unknown or archived custom field: ${key}` };
      if (value === null || value === "") continue;
      if (field.fieldType === "number" && !Number.isFinite(Number(value))) return { error: `${key} must be a number` };
      if (field.fieldType === "boolean" && ![true, false, "true", "false"].includes(value as never)) return { error: `${key} must be boolean` };
      if (field.fieldType === "date" && Number.isNaN(new Date(String(value)).getTime())) return { error: `${key} must be a date` };
      if (field.fieldType === "select" && !(field.optionsJson ?? []).includes(String(value))) return { error: `${key} must be one of the configured options` };
      if (typeof value === "string" && value.length > 2000) return { error: `${key} is too long` };
    }
    if (options.requireRequired) {
      for (const field of fields) {
        if (field.required && (input[field.fieldKey] === undefined || input[field.fieldKey] === null || input[field.fieldKey] === "")) {
          return { error: `Required custom field missing: ${field.fieldKey}` };
        }
      }
    }
    return { value: input };
  })();
}

function validateWriteKeys(body: Record<string, unknown>, allowed: readonly string[]): string | null {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  return unknown.length ? `Unsupported field: ${unknown[0]}` : null;
}

function validateCoreFields(body: Record<string, unknown>, creating: boolean): {
  values?: Record<string, string>;
  error?: string;
} {
  const values: Record<string, string> = {};
  const limits: Record<string, number> = {
    name: 256,
    phone: 64,
    email: 256,
    company: 256,
    jobTitle: 256,
  };
  for (const [field, limit] of Object.entries(limits)) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== "string") return { error: `${field} must be text` };
    const normalized = value.trim();
    if (normalized.length > limit) return { error: `${field} is too long` };
    if (field === "name" && !normalized) return { error: "Lead name is required" };
    values[field] = normalized;
  }
  if (creating && !values.name) return { error: "Lead name is required" };
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !(LEAD_STATUSES as readonly string[]).includes(body.status)) {
      return { error: `status must be one of: ${LEAD_STATUSES.join(", ")}` };
    }
    values.status = body.status;
  }
  return { values };
}

router.get("/connectors/v1/crm/custom-fields", async (req, res) => {
  const principal = await requireScope(req, res, "crm:read");
  if (!principal) return;
  const fields = await db.select({
    fieldKey: crmCustomFieldsTable.fieldKey,
    label: crmCustomFieldsTable.label,
    fieldType: crmCustomFieldsTable.fieldType,
    optionsJson: crmCustomFieldsTable.optionsJson,
    required: crmCustomFieldsTable.required,
    position: crmCustomFieldsTable.position,
  }).from(crmCustomFieldsTable)
    .where(and(eq(crmCustomFieldsTable.orgId, principal.orgId), eq(crmCustomFieldsTable.archived, false)))
    .orderBy(crmCustomFieldsTable.position);
  res.json({ fields });
});

router.get("/connectors/v1/crm/leads", async (req, res) => {
  const principal = await requireScope(req, res, "crm:read");
  if (!principal) return;
  const conditions = [eq(leadRecordsTable.orgId, principal.orgId)];
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 120) : "";
  const status = typeof req.query.status === "string" ? req.query.status : "";
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(
      ilike(leadRecordsTable.name, pattern),
      ilike(leadRecordsTable.email, pattern),
      ilike(leadRecordsTable.phone, pattern),
      ilike(leadRecordsTable.company, pattern),
      ilike(leadRecordsTable.jobTitle, pattern),
    )!);
  }
  if (status) {
    if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
      res.status(400).json({ error: `status must be one of: ${LEAD_STATUSES.join(", ")}` });
      return;
    }
    conditions.push(eq(leadRecordsTable.status, status));
  }
  const limitInput = Number.parseInt(String(req.query.limit ?? "100"), 10);
  const offsetInput = Number.parseInt(String(req.query.offset ?? "0"), 10);
  const limit = Number.isFinite(limitInput) ? Math.min(Math.max(limitInput, 1), 200) : 100;
  const offset = Number.isFinite(offsetInput) ? Math.min(Math.max(offsetInput, 0), 10_000) : 0;
  const leads = await db.select(PUBLIC_LEAD_FIELDS).from(leadRecordsTable)
    .where(and(...conditions))
    .orderBy(desc(leadRecordsTable.updatedAt))
    .limit(limit)
    .offset(offset);
  res.json({ leads, limit, offset });
});

router.get("/connectors/v1/crm/leads/:id", async (req, res) => {
  const principal = await requireScope(req, res, "crm:read");
  if (!principal) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid lead ID" });
    return;
  }
  const [lead] = await db.select(PUBLIC_LEAD_FIELDS).from(leadRecordsTable)
    .where(and(eq(leadRecordsTable.id, id), eq(leadRecordsTable.orgId, principal.orgId)))
    .limit(1);
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  res.json({ lead });
});

router.post("/connectors/v1/crm/leads", async (req, res) => {
  const principal = await requireScope(req, res, "crm:write");
  if (!principal) return;
  const body = isRecord(req.body) ? req.body : {};
  const keyError = validateWriteKeys(body, ["name", "phone", "email", "company", "jobTitle", "status", "customFieldsJson"]);
  if (keyError) {
    res.status(400).json({ error: keyError });
    return;
  }
  const core = validateCoreFields(body, true);
  if (!core.values) {
    res.status(400).json({ error: core.error });
    return;
  }
  const custom = await validateCustomFieldValues(principal.orgId, body.customFieldsJson, { requireRequired: true });
  if (!custom.value) {
    res.status(400).json({ error: custom.error });
    return;
  }

  const lead = await db.transaction(async (tx) => {
    const [created] = await tx.insert(leadRecordsTable).values({
      orgId: principal.orgId,
      name: core.values!.name,
      phone: core.values!.phone ?? "",
      email: core.values!.email ?? "",
      company: core.values!.company ?? "",
      jobTitle: core.values!.jobTitle ?? "",
      status: core.values!.status ?? "new",
      source: `connector:${principal.appId}`,
      createdByUserId: `connector:${principal.appId}`,
      customFieldsJson: custom.value!,
    }).returning(PUBLIC_LEAD_FIELDS);
    await tx.insert(orgConnectorActivityTable).values({
      orgId: principal.orgId,
      connectionId: principal.connectionId,
      appId: principal.appId,
      eventType: "crm_lead_created",
      resourceType: "crm_lead",
      summary: `${principal.appName} created a CRM lead.`,
    });
    return created;
  });
  res.status(201).json({ lead });
});

router.patch("/connectors/v1/crm/leads/:id", async (req, res) => {
  const principal = await requireScope(req, res, "crm:write");
  if (!principal) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid lead ID" });
    return;
  }
  const body = isRecord(req.body) ? req.body : {};
  const keyError = validateWriteKeys(body, ["name", "phone", "email", "company", "jobTitle", "status", "customFieldsJson"]);
  if (keyError) {
    res.status(400).json({ error: keyError });
    return;
  }
  const core = validateCoreFields(body, false);
  if (!core.values) {
    res.status(400).json({ error: core.error });
    return;
  }
  const [existing] = await db.select().from(leadRecordsTable)
    .where(and(eq(leadRecordsTable.id, id), eq(leadRecordsTable.orgId, principal.orgId)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const updates: Record<string, unknown> = { ...core.values };
  if (body.customFieldsJson !== undefined) {
    const patch = await validateCustomFieldValues(principal.orgId, body.customFieldsJson, { requireRequired: false });
    if (!patch.value) {
      res.status(400).json({ error: patch.error });
      return;
    }
    updates.customFieldsJson = { ...(existing.customFieldsJson ?? {}), ...patch.value };
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Provide at least one supported field to update" });
    return;
  }

  const lead = await db.transaction(async (tx) => {
    const [updated] = await tx.update(leadRecordsTable).set(updates)
      .where(and(eq(leadRecordsTable.id, id), eq(leadRecordsTable.orgId, principal.orgId)))
      .returning(PUBLIC_LEAD_FIELDS);
    if (!updated) return null;
    await tx.insert(orgConnectorActivityTable).values({
      orgId: principal.orgId,
      connectionId: principal.connectionId,
      appId: principal.appId,
      eventType: "crm_lead_updated",
      resourceType: "crm_lead",
      summary: `${principal.appName} updated a CRM lead.`,
    });
    return updated;
  });
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  res.json({ lead });
});

export default router;
