import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  orgCustomAppsTable,
  orgCustomAppRecordsTable,
  type OrgCustomAppField,
} from "@workspace/db";
import {
  CreateOrganizationCustomAppBody,
  CreateOrganizationCustomAppRecordBody,
  CreateOrganizationCustomAppRecordResponse,
  CreateOrganizationCustomAppResponse,
  ListOrganizationCustomAppRecordsResponse,
  ListOrganizationCustomAppsResponse,
  SetOrganizationCustomAppStatusBody,
  UpdateOrganizationCustomAppBody,
  UpdateOrganizationCustomAppRecordBody,
  UpdateOrganizationCustomAppRecordResponse,
} from "@workspace/api-zod";
import { canDoInOrg, resolveCurrentOrgId } from "../lib/org-permissions";

const router = Router();
const PAGE_SIZE = 100;
const MAX_RECORD_BYTES = 32_000;

type OrgPermission = "custom_apps.view" | "custom_apps.edit" | "custom_apps.manage";

interface RequestContext {
  userId: string;
  orgId: number;
}

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return String((req.user as { id: string }).id);
}

function routeParam(
  req: Request,
  res: Response,
  name: string,
  pattern: RegExp,
  label: string,
): string | null {
  const raw = req.params[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !pattern.test(value)) {
    res.status(400).json({ error: `Invalid ${label}` });
    return null;
  }
  return value;
}

async function requestContext(req: Request, res: Response): Promise<RequestContext | null> {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  const orgId = await resolveCurrentOrgId(userId);
  if (!orgId) {
    res.status(404).json({ error: "No active organization found" });
    return null;
  }
  return { userId, orgId };
}

async function permission(
  context: RequestContext,
  key: OrgPermission,
  res: Response,
): Promise<boolean> {
  const gate = await canDoInOrg(context.userId, context.orgId, key);
  if (!gate.allowed) {
    res.status(403).json({ error: `Requires ${key} permission` });
    return false;
  }
  return true;
}

async function appPermissions(context: RequestContext) {
  const [canView, canEdit, canManage] = await Promise.all([
    canDoInOrg(context.userId, context.orgId, "custom_apps.view"),
    canDoInOrg(context.userId, context.orgId, "custom_apps.edit"),
    canDoInOrg(context.userId, context.orgId, "custom_apps.manage"),
  ]);
  return {
    canView: canView.allowed,
    canEditRecords: canView.allowed && canEdit.allowed,
    canManageApps: canManage.allowed,
  };
}

function slugBase(name: string): string {
  const value = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 88);
  return value || "custom-app";
}

function appDto(app: typeof orgCustomAppsTable.$inferSelect) {
  return {
    slug: app.slug,
    name: app.name,
    description: app.description,
    fields: app.fields,
    status: app.status,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

function appResponse(
  app: typeof orgCustomAppsTable.$inferSelect,
  permissions: { canEditRecords: boolean; canManageApps: boolean },
) {
  return CreateOrganizationCustomAppResponse.parse({
    app: appDto(app),
    permissions,
  });
}

function validateFields(fields: OrgCustomAppField[]): string | null {
  const seen = new Set<string>();
  for (const field of fields) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(field.key)) {
      return `Field key for "${field.label}" is invalid`;
    }
    if (!field.label.trim()) return "Every field needs a label";
    if (seen.has(field.key)) return `Field key "${field.key}" is duplicated`;
    seen.add(field.key);
    const options = field.options ?? [];
    if (field.type === "select" && options.length === 0) {
      return `Add at least one option for "${field.label}"`;
    }
    if (field.type !== "select" && options.length > 0) {
      return `Options are only supported for select fields ("${field.label}")`;
    }
    if (new Set(options).size !== options.length) {
      return `Options for "${field.label}" must be unique`;
    }
    if (options.some((option) => !option.trim())) {
      return `Options for "${field.label}" cannot be blank`;
    }
  }
  return null;
}

function normalizeFields(fields: OrgCustomAppField[]): OrgCustomAppField[] {
  return fields.map((field) => ({
    ...field,
    key: field.key.trim(),
    label: field.label.trim(),
    placeholder: field.placeholder?.trim() || undefined,
    options: field.type === "select"
      ? (field.options ?? []).map((option) => option.trim())
      : undefined,
  }));
}

function validateSchemaUpdate(
  currentFields: OrgCustomAppField[],
  nextFields: OrgCustomAppField[],
): string | null {
  const nextByKey = new Map(nextFields.map((field) => [field.key, field]));
  for (const current of currentFields) {
    const next = nextByKey.get(current.key);
    if (!next) {
      return `Cannot remove "${current.label}" after records exist. Keep the field or add a replacement.`;
    }
    if (next.type !== current.type) {
      return `Cannot change the type of "${current.label}" after records exist. Add a new field instead.`;
    }
    if (!current.required && next.required) {
      return `Cannot make "${current.label}" required after records exist.`;
    }
    if (
      current.type === "select" &&
      (current.options ?? []).some((option) => !(next.options ?? []).includes(option))
    ) {
      return `Existing choices for "${current.label}" cannot be removed after records exist.`;
    }
  }
  if (nextFields.some((field) => !currentFields.some((current) => current.key === field.key) && field.required)) {
    return "New fields must be optional after records exist.";
  }
  return null;
}

function validateRecordData(
  fields: OrgCustomAppField[],
  value: unknown,
): { data?: Record<string, unknown>; error?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Record data must be an object" };
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { error: "Record data is not valid JSON" };
  }
  if (serialized.length > MAX_RECORD_BYTES) {
    return { error: "Record data is too large" };
  }

  const input = value as Record<string, unknown>;
  const fieldKeys = new Set(fields.map((field) => field.key));
  if (Object.keys(input).some((key) => !fieldKeys.has(key))) {
    return { error: "Record contains a field that is not part of this page" };
  }

  const data: Record<string, unknown> = {};
  for (const field of fields) {
    const fieldValue = input[field.key];
    if (field.type === "checkbox" && field.required && fieldValue !== true) {
      return { error: `${field.label} must be checked` };
    }
    if (
      field.required &&
      (fieldValue === undefined ||
        fieldValue === "" ||
        (typeof fieldValue === "string" && fieldValue.trim() === ""))
    ) {
      return { error: `${field.label} is required` };
    }
    if (fieldValue === undefined || fieldValue === "") {
      continue;
    }

    switch (field.type) {
      case "text":
      case "textarea":
        if (typeof fieldValue !== "string" || fieldValue.length > 5000) {
          return { error: `${field.label} must be text up to 5,000 characters` };
        }
        break;
      case "number":
        if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue)) {
          return { error: `${field.label} must be a number` };
        }
        break;
      case "date": {
        const dateValue = typeof fieldValue === "string" ? fieldValue : "";
        const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
          ? new Date(`${dateValue}T00:00:00.000Z`)
          : null;
        if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== dateValue) {
          return { error: `${field.label} must be a valid date` };
        }
        break;
      }
      case "select":
        if (typeof fieldValue !== "string" || !(field.options ?? []).includes(fieldValue)) {
          return { error: `Choose a listed option for ${field.label}` };
        }
        break;
      case "checkbox":
        if (typeof fieldValue !== "boolean") {
          return { error: `${field.label} must be checked or unchecked` };
        }
        break;
    }
    data[field.key] = fieldValue;
  }
  return { data };
}

async function findApp(orgId: number, appSlug: string) {
  const [app] = await db
    .select()
    .from(orgCustomAppsTable)
    .where(and(
      eq(orgCustomAppsTable.orgId, orgId),
      eq(orgCustomAppsTable.slug, appSlug),
    ))
    .limit(1);
  return app ?? null;
}

async function allowPublishedOrManager(
  context: RequestContext,
  app: typeof orgCustomAppsTable.$inferSelect,
  res: Response,
): Promise<boolean> {
  if (app.status === "published") return true;
  const canManage = await canDoInOrg(context.userId, context.orgId, "custom_apps.manage");
  if (canManage.allowed) return true;
  res.status(404).json({ error: "Page not found in the active organization" });
  return false;
}

function recordDto(record: typeof orgCustomAppRecordsTable.$inferSelect) {
  return {
    id: record.id,
    data: record.data,
    createdByUserId: record.createdByUserId,
    updatedByUserId: record.updatedByUserId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

router.get("/orgs/current/custom-apps", async (req, res): Promise<void> => {
  const context = await requestContext(req, res);
  if (!context) return;
  const permissions = await appPermissions(context);
  if (!permissions.canView && !permissions.canManageApps) {
    res.status(403).json({ error: "Requires custom_apps.view permission" });
    return;
  }

  const visibility = permissions.canManageApps
    ? undefined
    : eq(orgCustomAppsTable.status, "published");
  const rows = await db
    .select()
    .from(orgCustomAppsTable)
    .where(visibility
      ? and(eq(orgCustomAppsTable.orgId, context.orgId), visibility)
      : eq(orgCustomAppsTable.orgId, context.orgId))
    .orderBy(orgCustomAppsTable.name);

  res.json(ListOrganizationCustomAppsResponse.parse({
    items: rows.map(appDto),
    permissions: {
      canEditRecords: permissions.canEditRecords,
      canManageApps: permissions.canManageApps,
    },
  }));
});

router.post("/orgs/current/custom-apps", async (req, res): Promise<void> => {
  const context = await requestContext(req, res);
  if (!context || !(await permission(context, "custom_apps.manage", res))) return;

  const parsed = CreateOrganizationCustomAppBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const fields = normalizeFields(parsed.data.fields as OrgCustomAppField[]);
  const fieldError = validateFields(fields);
  if (fieldError) {
    res.status(400).json({ error: fieldError });
    return;
  }
  const slug = `${slugBase(parsed.data.name)}-${randomUUID().slice(0, 8)}`;
  const [app] = await db
    .insert(orgCustomAppsTable)
    .values({
      orgId: context.orgId,
      slug,
      name: parsed.data.name.trim(),
      description: parsed.data.description.trim(),
      fields,
      status: "draft",
      createdByUserId: context.userId,
      updatedByUserId: context.userId,
    })
    .returning();
  if (!app) {
    res.status(500).json({ error: "Could not create the page" });
    return;
  }
  const permissions = await appPermissions(context);
  res.status(201).json(appResponse(app, {
    canEditRecords: permissions.canEditRecords,
    canManageApps: permissions.canManageApps,
  }));
});

router.get("/orgs/current/custom-apps/:appSlug", async (req, res): Promise<void> => {
  const context = await requestContext(req, res);
  if (!context) return;
  const permissions = await appPermissions(context);
  if (!permissions.canView && !permissions.canManageApps) {
    res.status(403).json({ error: "Requires custom_apps.view permission" });
    return;
  }
  const appSlug = routeParam(req, res, "appSlug", /^[a-z0-9-]{1,100}$/, "app slug");
  if (!appSlug) return;
  const app = await findApp(context.orgId, appSlug);
  if (!app || !(await allowPublishedOrManager(context, app, res))) {
    if (!app) res.status(404).json({ error: "Page not found in the active organization" });
    return;
  }
  res.json(appResponse(app, {
    canEditRecords: permissions.canEditRecords,
    canManageApps: permissions.canManageApps,
  }));
});

router.put("/orgs/current/custom-apps/:appSlug", async (req, res): Promise<void> => {
  const context = await requestContext(req, res);
  if (!context || !(await permission(context, "custom_apps.manage", res))) return;

  const appSlug = routeParam(req, res, "appSlug", /^[a-z0-9-]{1,100}$/, "app slug");
  if (!appSlug) return;
  const parsed = UpdateOrganizationCustomAppBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const fields = normalizeFields(parsed.data.fields as OrgCustomAppField[]);
  const fieldError = validateFields(fields);
  if (fieldError) {
    res.status(400).json({ error: fieldError });
    return;
  }
  const [currentApp] = await db
    .select()
    .from(orgCustomAppsTable)
    .where(and(
      eq(orgCustomAppsTable.orgId, context.orgId),
      eq(orgCustomAppsTable.slug, appSlug),
    ))
    .limit(1);
  if (!currentApp) {
    res.status(404).json({ error: "Page not found in the active organization" });
    return;
  }
  const [existingRecord] = await db
    .select({ id: orgCustomAppRecordsTable.id })
    .from(orgCustomAppRecordsTable)
    .where(and(
      eq(orgCustomAppRecordsTable.orgId, context.orgId),
      eq(orgCustomAppRecordsTable.appId, currentApp.id),
    ))
    .limit(1);
  if (existingRecord) {
    const schemaError = validateSchemaUpdate(currentApp.fields, fields);
    if (schemaError) {
      res.status(409).json({ error: schemaError });
      return;
    }
  }
  const [app] = await db
    .update(orgCustomAppsTable)
    .set({
      name: parsed.data.name.trim(),
      description: parsed.data.description.trim(),
      fields,
      updatedByUserId: context.userId,
      updatedAt: new Date(),
    })
    .where(and(
      eq(orgCustomAppsTable.orgId, context.orgId),
      eq(orgCustomAppsTable.slug, appSlug),
    ))
    .returning();
  if (!app) {
    res.status(404).json({ error: "Page not found in the active organization" });
    return;
  }
  const permissions = await appPermissions(context);
  res.json(appResponse(app, {
    canEditRecords: permissions.canEditRecords,
    canManageApps: permissions.canManageApps,
  }));
});

router.patch("/orgs/current/custom-apps/:appSlug/status", async (req, res): Promise<void> => {
  const context = await requestContext(req, res);
  if (!context || !(await permission(context, "custom_apps.manage", res))) return;
  const appSlug = routeParam(req, res, "appSlug", /^[a-z0-9-]{1,100}$/, "app slug");
  if (!appSlug) return;
  const parsed = SetOrganizationCustomAppStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [app] = await db
    .update(orgCustomAppsTable)
    .set({
      status: parsed.data.status,
      updatedByUserId: context.userId,
      updatedAt: new Date(),
    })
    .where(and(
      eq(orgCustomAppsTable.orgId, context.orgId),
      eq(orgCustomAppsTable.slug, appSlug),
    ))
    .returning();
  if (!app) {
    res.status(404).json({ error: "Page not found in the active organization" });
    return;
  }
  const permissions = await appPermissions(context);
  res.json(appResponse(app, {
    canEditRecords: permissions.canEditRecords,
    canManageApps: permissions.canManageApps,
  }));
});

router.delete("/orgs/current/custom-apps/:appSlug", async (req, res): Promise<void> => {
  const context = await requestContext(req, res);
  if (!context || !(await permission(context, "custom_apps.manage", res))) return;
  const appSlug = routeParam(req, res, "appSlug", /^[a-z0-9-]{1,100}$/, "app slug");
  if (!appSlug) return;
  const [app] = await db
    .delete(orgCustomAppsTable)
    .where(and(
      eq(orgCustomAppsTable.orgId, context.orgId),
      eq(orgCustomAppsTable.slug, appSlug),
    ))
    .returning({ id: orgCustomAppsTable.id });
  if (!app) {
    res.status(404).json({ error: "Page not found in the active organization" });
    return;
  }
  res.sendStatus(204);
});

router.get("/orgs/current/custom-apps/:appSlug/records/page/:offset", async (req, res): Promise<void> => {
  const context = await requestContext(req, res);
  if (!context || !(await permission(context, "custom_apps.view", res))) return;
  const appSlug = routeParam(req, res, "appSlug", /^[a-z0-9-]{1,100}$/, "app slug");
  const rawOffset = routeParam(req, res, "offset", /^\d{1,7}$/, "record page offset");
  if (!appSlug || !rawOffset) return;
  const offset = Number(rawOffset);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) {
    res.status(400).json({ error: "Invalid record page offset" });
    return;
  }
  const app = await findApp(context.orgId, appSlug);
  if (!app || !(await allowPublishedOrManager(context, app, res))) {
    if (!app) res.status(404).json({ error: "Page not found in the active organization" });
    return;
  }
  const rows = await db
    .select()
    .from(orgCustomAppRecordsTable)
    .where(and(
      eq(orgCustomAppRecordsTable.orgId, context.orgId),
      eq(orgCustomAppRecordsTable.appId, app.id),
    ))
    .orderBy(desc(orgCustomAppRecordsTable.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset(offset);
  res.json(ListOrganizationCustomAppRecordsResponse.parse({
    items: rows.slice(0, PAGE_SIZE).map(recordDto),
    hasMore: rows.length > PAGE_SIZE,
  }));
});

router.post("/orgs/current/custom-apps/:appSlug/records", async (req, res): Promise<void> => {
  const context = await requestContext(req, res);
  if (!context) return;
  const appSlug = routeParam(req, res, "appSlug", /^[a-z0-9-]{1,100}$/, "app slug");
  if (!appSlug) return;
  const [canView, canEdit] = await Promise.all([
    canDoInOrg(context.userId, context.orgId, "custom_apps.view"),
    canDoInOrg(context.userId, context.orgId, "custom_apps.edit"),
  ]);
  if (!canView.allowed || !canEdit.allowed) {
    res.status(403).json({ error: "Requires custom_apps.view and custom_apps.edit permissions" });
    return;
  }
  const app = await findApp(context.orgId, appSlug);
  if (!app || !(await allowPublishedOrManager(context, app, res))) {
    if (!app) res.status(404).json({ error: "Page not found in the active organization" });
    return;
  }
  const parsed = CreateOrganizationCustomAppRecordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const validation = validateRecordData(app.fields, parsed.data.data);
  if (validation.error) {
    res.status(400).json({ error: validation.error });
    return;
  }
  const [record] = await db
    .insert(orgCustomAppRecordsTable)
    .values({
      orgId: context.orgId,
      appId: app.id,
      data: validation.data!,
      createdByUserId: context.userId,
      updatedByUserId: context.userId,
    })
    .returning();
  if (!record) {
    res.status(500).json({ error: "Could not save the record" });
    return;
  }
  res.status(201).json(CreateOrganizationCustomAppRecordResponse.parse(recordDto(record)));
});

router.put("/orgs/current/custom-apps/:appSlug/records/:recordId", async (req, res): Promise<void> => {
  const context = await requestContext(req, res);
  if (!context) return;
  const appSlug = routeParam(req, res, "appSlug", /^[a-z0-9-]{1,100}$/, "app slug");
  const recordId = routeParam(
    req,
    res,
    "recordId",
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "record id",
  );
  if (!appSlug || !recordId) return;
  const [canView, canEdit] = await Promise.all([
    canDoInOrg(context.userId, context.orgId, "custom_apps.view"),
    canDoInOrg(context.userId, context.orgId, "custom_apps.edit"),
  ]);
  if (!canView.allowed || !canEdit.allowed) {
    res.status(403).json({ error: "Requires custom_apps.view and custom_apps.edit permissions" });
    return;
  }
  const app = await findApp(context.orgId, appSlug);
  if (!app || !(await allowPublishedOrManager(context, app, res))) {
    if (!app) res.status(404).json({ error: "Page not found in the active organization" });
    return;
  }
  const parsed = UpdateOrganizationCustomAppRecordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const validation = validateRecordData(app.fields, parsed.data.data);
  if (validation.error) {
    res.status(400).json({ error: validation.error });
    return;
  }
  const [record] = await db
    .update(orgCustomAppRecordsTable)
    .set({
      data: validation.data!,
      updatedByUserId: context.userId,
      updatedAt: new Date(),
    })
    .where(and(
      eq(orgCustomAppRecordsTable.id, recordId),
      eq(orgCustomAppRecordsTable.orgId, context.orgId),
      eq(orgCustomAppRecordsTable.appId, app.id),
    ))
    .returning();
  if (!record) {
    res.status(404).json({ error: "Record not found in the active organization" });
    return;
  }
  res.json(UpdateOrganizationCustomAppRecordResponse.parse(recordDto(record)));
});

router.delete("/orgs/current/custom-apps/:appSlug/records/:recordId", async (req, res): Promise<void> => {
  const context = await requestContext(req, res);
  if (!context) return;
  const appSlug = routeParam(req, res, "appSlug", /^[a-z0-9-]{1,100}$/, "app slug");
  const recordId = routeParam(
    req,
    res,
    "recordId",
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "record id",
  );
  if (!appSlug || !recordId) return;
  const [canView, canEdit] = await Promise.all([
    canDoInOrg(context.userId, context.orgId, "custom_apps.view"),
    canDoInOrg(context.userId, context.orgId, "custom_apps.edit"),
  ]);
  if (!canView.allowed || !canEdit.allowed) {
    res.status(403).json({ error: "Requires custom_apps.view and custom_apps.edit permissions" });
    return;
  }
  const app = await findApp(context.orgId, appSlug);
  if (!app || !(await allowPublishedOrManager(context, app, res))) {
    if (!app) res.status(404).json({ error: "Page not found in the active organization" });
    return;
  }
  const [record] = await db
    .delete(orgCustomAppRecordsTable)
    .where(and(
      eq(orgCustomAppRecordsTable.id, recordId),
      eq(orgCustomAppRecordsTable.orgId, context.orgId),
      eq(orgCustomAppRecordsTable.appId, app.id),
    ))
    .returning({ id: orgCustomAppRecordsTable.id });
  if (!record) {
    res.status(404).json({ error: "Record not found in the active organization" });
    return;
  }
  res.sendStatus(204);
});

export default router;
