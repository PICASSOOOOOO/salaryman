import { Router, type Request, type Response } from "express";
import { Readable } from "node:stream";
import { and, desc, eq, ilike, isNull, lt, or } from "drizzle-orm";
import {
  businessActivitiesTable,
  businessAuditEventsTable,
  businessContactPointsTable,
  businessEntitiesTable,
  businessFileLinksTable,
  businessFilesTable,
  db,
  BUSINESS_CONTACT_POINT_TYPES,
  BUSINESS_ENTITY_TYPES,
  BUSINESS_FILE_KINDS,
} from "@workspace/db";
import { canDoInOrg, resolveCurrentOrgId } from "../lib/org-permissions";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorage = new ObjectStorageService();
const MAX_PAGE_SIZE = 100;
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;

function requireUser(req: Request, res: Response): string | null {
  if (!req.isAuthenticated?.() || !req.user?.id) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return String(req.user.id);
}

async function resolveOrgAccess(userId: string, permission: "crm.view" | "crm.edit") {
  const orgId = await resolveCurrentOrgId(userId);
  if (!orgId) return { orgId: null, allowed: false as const };
  const gate = await canDoInOrg(userId, orgId, permission);
  return { orgId, allowed: gate.allowed };
}

function safeLimit(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(MAX_PAGE_SIZE, parsed)) : 50;
}

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizedContactValue(kind: string, value: string): string {
  if (kind === "email") return value.trim().toLowerCase();
  if (kind === "phone") return value.replace(/[^\d+]/g, "");
  return value.trim().toLowerCase();
}

function fileKind(contentType: string, requested: unknown): string {
  if (typeof requested === "string" && (BUSINESS_FILE_KINDS as readonly string[]).includes(requested)) return requested;
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.includes("pdf") || contentType.startsWith("text/")) return "document";
  if (contentType.includes("sheet") || contentType.includes("excel")) return "spreadsheet";
  return "other";
}

router.get("/business-data/entities", async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const access = await resolveOrgAccess(userId, "crm.view");
  if (!access.orgId) { res.status(403).json({ error: "Organization required" }); return; }
  if (!access.allowed) { res.status(403).json({ error: "CRM permission required" }); return; }

  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
  const entityType = typeof req.query.entityType === "string" ? req.query.entityType : "";
  const before = typeof req.query.before === "string" ? new Date(req.query.before) : null;
  const conditions = [
    eq(businessEntitiesTable.orgId, access.orgId),
    isNull(businessEntitiesTable.deletedAt),
    ...(entityType && (BUSINESS_ENTITY_TYPES as readonly string[]).includes(entityType)
      ? [eq(businessEntitiesTable.entityType, entityType)]
      : []),
    ...(query ? [or(ilike(businessEntitiesTable.displayName, `%${query}%`), ilike(businessEntitiesTable.searchText, `%${query}%`))!] : []),
    ...(before && !Number.isNaN(before.getTime()) ? [lt(businessEntitiesTable.updatedAt, before)] : []),
  ];
  const rows = await db.select().from(businessEntitiesTable)
    .where(and(...conditions))
    .orderBy(desc(businessEntitiesTable.updatedAt))
    .limit(safeLimit(req.query.limit));
  res.json({ entities: rows, nextBefore: rows.length ? rows[rows.length - 1].updatedAt : null });
});

router.post("/business-data/entities", async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const access = await resolveOrgAccess(userId, "crm.edit");
  if (!access.orgId) { res.status(403).json({ error: "Organization required" }); return; }
  if (!access.allowed) { res.status(403).json({ error: "CRM edit permission required" }); return; }

  const body = req.body ?? {};
  const entityType = typeof body.entityType === "string" ? body.entityType : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 300) : "";
  if (!(BUSINESS_ENTITY_TYPES as readonly string[]).includes(entityType) || !displayName) {
    res.status(400).json({ error: "entityType and displayName are required" });
    return;
  }
  const data = safeObject(body.data);
  const legalName = typeof body.legalName === "string" ? body.legalName.trim().slice(0, 300) : null;
  const searchText = [displayName, legalName ?? "", JSON.stringify(data)].join(" ").slice(0, 20_000);
  const entity = await db.transaction(async (tx) => {
    const [created] = await tx.insert(businessEntitiesTable).values({
      orgId: access.orgId!,
      entityType,
      displayName,
      legalName,
      status: typeof body.status === "string" ? body.status.slice(0, 40) : "active",
      ownerUserId: typeof body.ownerUserId === "string" ? body.ownerUserId.slice(0, 256) : null,
      externalKey: typeof body.externalKey === "string" ? body.externalKey.slice(0, 256) : null,
      searchText,
      data,
      createdByUserId: userId,
    }).returning();
    const points = Array.isArray(body.contactPoints) ? body.contactPoints.slice(0, 50) : [];
    for (const candidate of points) {
      const point = safeObject(candidate);
      const kind = typeof point.kind === "string" ? point.kind : "";
      const value = typeof point.value === "string" ? point.value.trim().slice(0, 1000) : "";
      if (!(BUSINESS_CONTACT_POINT_TYPES as readonly string[]).includes(kind) || !value) continue;
      await tx.insert(businessContactPointsTable).values({
        orgId: access.orgId!,
        entityId: created.id,
        kind,
        value,
        normalizedValue: normalizedContactValue(kind, value),
        label: typeof point.label === "string" ? point.label.slice(0, 80) : null,
        isPrimary: point.isPrimary === true,
        metadata: safeObject(point.metadata),
      }).onConflictDoNothing();
    }
    await tx.insert(businessAuditEventsTable).values({
      orgId: access.orgId!,
      actorUserId: userId,
      action: "entity.created",
      entityType,
      entityId: created.id,
      beforeData: null,
      afterData: { displayName, entityType },
    });
    return created;
  });
  res.status(201).json({ entity });
});

router.get("/business-data/entities/:id", async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const access = await resolveOrgAccess(userId, "crm.view");
  if (!access.orgId) { res.status(403).json({ error: "Organization required" }); return; }
  if (!access.allowed) { res.status(403).json({ error: "CRM permission required" }); return; }
  const [entity] = await db.select().from(businessEntitiesTable).where(and(
    eq(businessEntitiesTable.id, req.params.id),
    eq(businessEntitiesTable.orgId, access.orgId),
    isNull(businessEntitiesTable.deletedAt),
  )).limit(1);
  if (!entity) { res.status(404).json({ error: "Entity not found" }); return; }
  const [contactPoints, fileLinks, activities] = await Promise.all([
    db.select().from(businessContactPointsTable).where(eq(businessContactPointsTable.entityId, entity.id)),
    db.select({ file: businessFilesTable, label: businessFileLinksTable.label })
      .from(businessFileLinksTable)
      .innerJoin(businessFilesTable, eq(businessFilesTable.id, businessFileLinksTable.fileId))
      .where(and(eq(businessFileLinksTable.entityId, entity.id), isNull(businessFilesTable.deletedAt))),
    db.select().from(businessActivitiesTable).where(eq(businessActivitiesTable.entityId, entity.id))
      .orderBy(desc(businessActivitiesTable.occurredAt)).limit(100),
  ]);
  res.json({ entity, contactPoints, files: fileLinks, activities });
});

router.post("/business-data/files/uploads/request-url", async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const access = await resolveOrgAccess(userId, "crm.edit");
  if (!access.orgId) { res.status(403).json({ error: "Organization required" }); return; }
  if (!access.allowed) { res.status(403).json({ error: "CRM edit permission required" }); return; }
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 500) : "";
  const mimeType = typeof req.body?.contentType === "string" ? req.body.contentType.slice(0, 200) : "";
  const sizeBytes = Number(req.body?.size);
  if (!name || !mimeType || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > MAX_FILE_BYTES) {
    res.status(400).json({ error: "name, contentType, and a valid file size are required" });
    return;
  }
  const uploadURL = await objectStorage.getObjectEntityUploadURL();
  const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);
  const [file] = await db.insert(businessFilesTable).values({
    orgId: access.orgId,
    uploadedByUserId: userId,
    objectPath,
    name,
    kind: fileKind(mimeType, req.body?.kind),
    mimeType,
    sizeBytes,
    checksumSha256: typeof req.body?.checksumSha256 === "string" ? req.body.checksumSha256.slice(0, 64) : null,
    metadata: safeObject(req.body?.metadata),
  }).returning();
  res.status(201).json({ file, uploadURL });
});

router.post("/business-data/files/:id/complete", async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const access = await resolveOrgAccess(userId, "crm.edit");
  if (!access.orgId) { res.status(403).json({ error: "Organization required" }); return; }
  if (!access.allowed) { res.status(403).json({ error: "CRM edit permission required" }); return; }
  const [file] = await db.select().from(businessFilesTable).where(and(
    eq(businessFilesTable.id, req.params.id),
    eq(businessFilesTable.orgId, access.orgId),
    isNull(businessFilesTable.deletedAt),
  )).limit(1);
  if (!file) { res.status(404).json({ error: "File not found" }); return; }
  try {
    const object = await objectStorage.getObjectEntityFile(file.objectPath);
    const [exists] = await object.exists();
    if (!exists) { res.status(409).json({ error: "Upload has not arrived in storage" }); return; }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) { res.status(409).json({ error: "Upload has not arrived in storage" }); return; }
    throw error;
  }
  const [updated] = await db.update(businessFilesTable).set({
    status: "ready",
    completedAt: new Date(),
  }).where(and(eq(businessFilesTable.id, file.id), eq(businessFilesTable.status, "pending"))).returning();
  res.json({ file: updated ?? file });
});

router.post("/business-data/files/:id/link", async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const access = await resolveOrgAccess(userId, "crm.edit");
  if (!access.orgId) { res.status(403).json({ error: "Organization required" }); return; }
  if (!access.allowed) { res.status(403).json({ error: "CRM edit permission required" }); return; }
  const entityId = typeof req.body?.entityId === "string" ? req.body.entityId : "";
  const [entity] = await db.select({ id: businessEntitiesTable.id }).from(businessEntitiesTable).where(and(
    eq(businessEntitiesTable.id, entityId), eq(businessEntitiesTable.orgId, access.orgId), isNull(businessEntitiesTable.deletedAt),
  )).limit(1);
  const [file] = await db.select({ id: businessFilesTable.id }).from(businessFilesTable).where(and(
    eq(businessFilesTable.id, req.params.id), eq(businessFilesTable.orgId, access.orgId), eq(businessFilesTable.status, "ready"), isNull(businessFilesTable.deletedAt),
  )).limit(1);
  if (!entity || !file) { res.status(404).json({ error: "Entity or ready file not found" }); return; }
  const [link] = await db.insert(businessFileLinksTable).values({
    orgId: access.orgId, fileId: file.id, entityId: entity.id, createdByUserId: userId,
    label: typeof req.body?.label === "string" ? req.body.label.slice(0, 80) : null,
  }).onConflictDoNothing().returning();
  res.status(link ? 201 : 200).json({ link: link ?? { fileId: file.id, entityId: entity.id } });
});

router.get("/business-data/files", async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const access = await resolveOrgAccess(userId, "crm.view");
  if (!access.orgId) { res.status(403).json({ error: "Organization required" }); return; }
  if (!access.allowed) { res.status(403).json({ error: "CRM permission required" }); return; }
  const rows = await db.select().from(businessFilesTable).where(and(
    eq(businessFilesTable.orgId, access.orgId),
    isNull(businessFilesTable.deletedAt),
    ...(typeof req.query.kind === "string" && (BUSINESS_FILE_KINDS as readonly string[]).includes(req.query.kind)
      ? [eq(businessFilesTable.kind, req.query.kind)] : []),
  )).orderBy(desc(businessFilesTable.createdAt)).limit(safeLimit(req.query.limit));
  res.json({ files: rows });
});

router.get("/business-data/files/:id/content", async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const access = await resolveOrgAccess(userId, "crm.view");
  if (!access.orgId) { res.status(403).json({ error: "Organization required" }); return; }
  if (!access.allowed) { res.status(403).json({ error: "CRM permission required" }); return; }
  const [file] = await db.select().from(businessFilesTable).where(and(
    eq(businessFilesTable.id, req.params.id),
    eq(businessFilesTable.orgId, access.orgId),
    eq(businessFilesTable.status, "ready"),
    isNull(businessFilesTable.deletedAt),
  )).limit(1);
  if (!file) { res.status(404).json({ error: "File not found" }); return; }
  try {
    const response = await objectStorage.downloadObject(await objectStorage.getObjectEntityFile(file.objectPath));
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    else res.end();
  } catch (error) {
    if (error instanceof ObjectNotFoundError) { res.status(404).json({ error: "Stored object not found" }); return; }
    throw error;
  }
});

export default router;