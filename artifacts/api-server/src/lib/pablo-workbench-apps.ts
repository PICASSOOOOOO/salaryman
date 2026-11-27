import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  orgCustomAppsTable,
  orgCustomAppRecordsTable,
  type OrgCustomApp,
  type OrgCustomAppField,
} from "@workspace/db";
import {
  CreateOrganizationCustomAppBody,
  SetOrganizationCustomAppStatusBody,
  UpdateOrganizationCustomAppBody,
} from "@workspace/api-zod";
import { canDoInOrg, resolveCurrentOrgId } from "./org-permissions";
import {
  normalizeFields,
  slugBase,
  validateFields,
  validateSchemaUpdate,
} from "./org-custom-apps-validation";

export interface PabloWorkbenchResult {
  message: string;
  navigateTo?: string;
  data?: unknown;
}

function publicApp(app: OrgCustomApp) {
  return {
    slug: app.slug,
    name: app.name,
    description: app.description,
    fields: app.fields,
    status: app.status,
    updatedAt: app.updatedAt,
  };
}

async function getManageableOrg(userId: string) {
  const orgId = await resolveCurrentOrgId(userId);
  if (!orgId) return { error: "There is no active organization." } as const;
  const permission = await canDoInOrg(userId, orgId, "custom_apps.manage");
  if (!permission.allowed) return { error: "You need My Apps manager permission in the active organization." } as const;
  return { orgId } as const;
}

async function findApp(orgId: number, identifier: string): Promise<OrgCustomApp | null> {
  const normalized = identifier.trim();
  if (!normalized) return null;
  const [bySlug] = await db.select().from(orgCustomAppsTable).where(and(
    eq(orgCustomAppsTable.orgId, orgId),
    eq(orgCustomAppsTable.slug, normalized),
  )).limit(1);
  if (bySlug) return bySlug;
  const matches = await db.select().from(orgCustomAppsTable).where(and(
    eq(orgCustomAppsTable.orgId, orgId),
    sql`lower(${orgCustomAppsTable.name}) = ${normalized.toLowerCase()}`,
  )).limit(2);
  return matches.length === 1 ? matches[0] : null;
}

export async function listPabloMyApps(userId: string): Promise<PabloWorkbenchResult> {
  const orgId = await resolveCurrentOrgId(userId);
  if (!orgId) return { message: "There is no active organization to list My Apps for." };
  const [canView, canManage] = await Promise.all([
    canDoInOrg(userId, orgId, "custom_apps.view"),
    canDoInOrg(userId, orgId, "custom_apps.manage"),
  ]);
  if (!canView.allowed && !canManage.allowed) {
    return { message: "You need My Apps view permission in the active organization." };
  }
  const rows = await db.select().from(orgCustomAppsTable).where(
    canManage.allowed
      ? eq(orgCustomAppsTable.orgId, orgId)
      : and(eq(orgCustomAppsTable.orgId, orgId), eq(orgCustomAppsTable.status, "published")),
  ).orderBy(orgCustomAppsTable.name);
  return {
    message: rows.length
      ? `Found ${rows.length} organization page${rows.length === 1 ? "" : "s"}${rows.length > 100 ? "; showing the first 100." : "."}`
      : "There are no My Apps pages in this organization yet.",
    data: {
      totalCount: rows.length,
      truncated: rows.length > 100,
      items: rows.slice(0, 100).map((app) => ({
        slug: app.slug,
        name: app.name,
        description: app.description,
        status: app.status,
        updatedAt: app.updatedAt,
      })),
    },
  };
}

export async function createPabloMyApp(
  userId: string,
  input: Record<string, unknown>,
): Promise<PabloWorkbenchResult> {
  const context = await getManageableOrg(userId);
  if ("error" in context) return { message: context.error ?? "Organization access is unavailable." };
  const parsed = CreateOrganizationCustomAppBody.safeParse(input);
  if (!parsed.success) return { message: `The page details are invalid: ${parsed.error.issues[0]?.message ?? "check the fields"}.` };
  const fields = normalizeFields(parsed.data.fields as OrgCustomAppField[]);
  const fieldError = validateFields(fields);
  if (fieldError) return { message: fieldError };
  const slug = `${slugBase(parsed.data.name)}-${randomUUID().slice(0, 8)}`;
  const [app] = await db.insert(orgCustomAppsTable).values({
    orgId: context.orgId,
    slug,
    name: parsed.data.name.trim(),
    description: parsed.data.description.trim(),
    fields,
    status: "draft",
    createdByUserId: userId,
    updatedByUserId: userId,
  }).returning();
  if (!app) return { message: "The page could not be created." };
  return {
    message: `Created “${app.name}” as a draft page. It is not published.`,
    navigateTo: `/my-apps/${app.slug}`,
    data: publicApp(app),
  };
}

export async function updatePabloMyApp(
  userId: string,
  input: Record<string, unknown>,
): Promise<PabloWorkbenchResult> {
  const context = await getManageableOrg(userId);
  if ("error" in context) return { message: context.error ?? "Organization access is unavailable." };
  const identifier = typeof input.app === "string" ? input.app : "";
  const currentApp = await findApp(context.orgId, identifier);
  if (!currentApp) {
    return { message: "I could not find one page with that exact name or slug. List My Apps first, then choose a page." };
  }

  const candidate = {
    name: input.name ?? currentApp.name,
    description: input.description ?? currentApp.description,
    fields: input.fields ?? currentApp.fields,
  };
  const parsed = UpdateOrganizationCustomAppBody.safeParse(candidate);
  if (!parsed.success) return { message: `The page details are invalid: ${parsed.error.issues[0]?.message ?? "check the fields"}.` };
  const fields = normalizeFields(parsed.data.fields as OrgCustomAppField[]);
  const fieldError = validateFields(fields);
  if (fieldError) return { message: fieldError };

  const [record] = await db.select({ id: orgCustomAppRecordsTable.id })
    .from(orgCustomAppRecordsTable)
    .where(and(
      eq(orgCustomAppRecordsTable.orgId, context.orgId),
      eq(orgCustomAppRecordsTable.appId, currentApp.id),
    ))
    .limit(1);
  if (record) {
    const schemaError = validateSchemaUpdate(currentApp.fields, fields);
    if (schemaError) return { message: schemaError };
  }

  const [updated] = await db.update(orgCustomAppsTable).set({
    name: parsed.data.name.trim(),
    description: parsed.data.description.trim(),
    fields,
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(and(
    eq(orgCustomAppsTable.orgId, context.orgId),
    eq(orgCustomAppsTable.slug, currentApp.slug),
  )).returning();
  if (!updated) return { message: "The page could not be updated." };
  return {
    message: `Updated “${updated.name}”.`,
    navigateTo: `/my-apps/${updated.slug}`,
    data: publicApp(updated),
  };
}

export async function setPabloMyAppStatus(
  userId: string,
  input: Record<string, unknown>,
): Promise<PabloWorkbenchResult> {
  const context = await getManageableOrg(userId);
  if ("error" in context) return { message: context.error ?? "Organization access is unavailable." };
  const identifier = typeof input.app === "string" ? input.app : "";
  const currentApp = await findApp(context.orgId, identifier);
  if (!currentApp) return { message: "I could not find one page with that exact name or slug." };
  const parsed = SetOrganizationCustomAppStatusBody.safeParse({ status: input.status });
  if (!parsed.success) return { message: "Choose either published or draft status." };
  const [updated] = await db.update(orgCustomAppsTable).set({
    status: parsed.data.status,
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(and(
    eq(orgCustomAppsTable.orgId, context.orgId),
    eq(orgCustomAppsTable.slug, currentApp.slug),
  )).returning();
  if (!updated) return { message: "The page status could not be changed." };
  return {
    message: parsed.data.status === "published"
      ? `Published “${updated.name}”.`
      : `Moved “${updated.name}” back to drafts.`,
    navigateTo: `/my-apps/${updated.slug}`,
    data: publicApp(updated),
  };
}
