import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import {
  db,
  orgDocumentsTable,
  orgDocumentUploadIntentsTable,
  orgConnectorActivityTable,
  type OrgConnectorScope,
} from "@workspace/db";
import {
  authenticateOrgConnectorToken,
  parseOrgConnectorBearer,
} from "../lib/org-connector-auth";
import { hasOrgConnectorScope } from "../lib/org-connectors";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const storage = new ObjectStorageService();
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_PAGE_SIZE = 200;
const UPLOAD_TTL_MS = 30 * 60 * 1000;
const SIGNED_UPLOAD_TTL_MS = 15 * 60 * 1000;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);
const PUBLIC_DOCUMENT_FIELDS = {
  id: orgDocumentsTable.id,
  name: orgDocumentsTable.name,
  parentId: orgDocumentsTable.parentId,
  isFolder: orgDocumentsTable.isFolder,
  mimeType: orgDocumentsTable.mimeType,
  fileSize: orgDocumentsTable.fileSize,
  createdAt: orgDocumentsTable.createdAt,
  updatedAt: orgDocumentsTable.updatedAt,
};

type Principal = NonNullable<Awaited<ReturnType<typeof authenticateOrgConnectorToken>>>;

async function requireScope(req: Request, res: Response, scope: OrgConnectorScope): Promise<Principal | null> {
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

function parsePage(value: unknown, fallback: number, max: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 && n <= max ? n : null;
}

function safeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length > 0 && name.length <= 300 && !/[\u0000-\u001f\u007f]/.test(name) ? name : null;
}

function signedUploadExpiry(intentExpiry: Date): Date {
  return new Date(Math.min(intentExpiry.getTime(), Date.now() + SIGNED_UPLOAD_TTL_MS));
}

async function getFolder(orgId: number, parentId: number | null) {
  if (parentId === null) return true;
  const [folder] = await db.select({ id: orgDocumentsTable.id })
    .from(orgDocumentsTable)
    .where(and(
      eq(orgDocumentsTable.id, parentId),
      eq(orgDocumentsTable.orgId, orgId),
      eq(orgDocumentsTable.isFolder, true),
    ))
    .limit(1);
  return !!folder;
}

router.get("/connectors/v1/documents", async (req, res) => {
  const principal = await requireScope(req, res, "documents:read");
  if (!principal) return;
  const limit = parsePage(req.query.limit, 100, MAX_PAGE_SIZE);
  const offset = parsePage(req.query.offset, 0, 10_000);
  const parentId = req.query.parentId === undefined
    ? null
    : parsePage(req.query.parentId, -1, Number.MAX_SAFE_INTEGER);
  if (limit === null || limit < 1 || offset === null || parentId === -1) {
    res.status(400).json({ error: "Invalid pagination or parentId" });
    return;
  }
  const rows = await db.select(PUBLIC_DOCUMENT_FIELDS).from(orgDocumentsTable)
    .where(and(
      eq(orgDocumentsTable.orgId, principal.orgId),
      parentId === null ? isNull(orgDocumentsTable.parentId) : eq(orgDocumentsTable.parentId, parentId),
    ))
    .orderBy(desc(orgDocumentsTable.createdAt), desc(orgDocumentsTable.id))
    .limit(limit)
    .offset(offset);
  res.json({ documents: rows, limit, offset });
});

router.get("/connectors/v1/documents/:id", async (req, res) => {
  const principal = await requireScope(req, res, "documents:read");
  if (!principal) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }
  const [document] = await db.select(PUBLIC_DOCUMENT_FIELDS).from(orgDocumentsTable)
    .where(and(eq(orgDocumentsTable.id, id), eq(orgDocumentsTable.orgId, principal.orgId)))
    .limit(1);
  if (!document) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json({ document });
});

router.get("/connectors/v1/documents/:id/content", async (req, res) => {
  const principal = await requireScope(req, res, "documents:read");
  if (!principal) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }
  const [document] = await db.select({
    name: orgDocumentsTable.name,
    mimeType: orgDocumentsTable.mimeType,
    isFolder: orgDocumentsTable.isFolder,
    objectPath: orgDocumentsTable.objectPath,
  }).from(orgDocumentsTable)
    .where(and(eq(orgDocumentsTable.id, id), eq(orgDocumentsTable.orgId, principal.orgId)))
    .limit(1);
  if (!document || document.isFolder || !document.objectPath) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  try {
    const file = await storage.getObjectEntityFile(document.objectPath);
    res.setHeader("Content-Type", document.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    file.createReadStream().on("error", () => {
      if (!res.headersSent) res.status(404).json({ error: "Document content unavailable" });
      else res.destroy();
    }).pipe(res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Document content unavailable" });
      return;
    }
    throw error;
  }
});

router.post("/connectors/v1/documents/uploads", async (req, res) => {
  const principal = await requireScope(req, res, "documents:write");
  if (!principal) return;
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const allowed = ["name", "contentType", "size", "parentId"];
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    res.status(400).json({ error: "Unsupported upload field" });
    return;
  }
  const name = safeName(body.name);
  const contentType = typeof body.contentType === "string" ? body.contentType.toLowerCase() : "";
  const size = body.size;
  const parentId = body.parentId === undefined || body.parentId === null ? null : Number(body.parentId);
  const idempotencyKey = req.get("Idempotency-Key");
  if (!name || !ALLOWED_MIME_TYPES.has(contentType) || !Number.isSafeInteger(size) || size <= 0 || size > MAX_FILE_SIZE ||
      (parentId !== null && (!Number.isSafeInteger(parentId) || parentId <= 0)) ||
      !idempotencyKey || !/^[\w.:-]{1,128}$/.test(idempotencyKey)) {
    res.status(400).json({ error: "Invalid file metadata or Idempotency-Key" });
    return;
  }
  if (!(await getFolder(principal.orgId, parentId))) {
    res.status(404).json({ error: "Folder not found" });
    return;
  }

  let [intent] = await db.select().from(orgDocumentUploadIntentsTable)
    .where(and(
      eq(orgDocumentUploadIntentsTable.connectionId, principal.connectionId),
      eq(orgDocumentUploadIntentsTable.idempotencyKey, idempotencyKey),
    )).limit(1);
  if (intent) {
    if (intent.name !== name || intent.mimeType !== contentType || intent.expectedFileSize !== size || intent.parentId !== parentId) {
      res.status(409).json({ error: "Idempotency-Key was already used with different upload metadata" });
      return;
    }
    if (intent.status !== "pending" || intent.expiresAt <= new Date()) {
      res.status(409).json({ error: "Upload intent is no longer active" });
      return;
    }
  } else {
    const id = randomUUID();
    let uploadURL = await storage.getObjectEntityUploadURL(id, "organization-document-staging");
    let responseStatus = 201;
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);
    const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS);
    try {
      [intent] = await db.insert(orgDocumentUploadIntentsTable).values({
        id,
        orgId: principal.orgId,
        connectionId: principal.connectionId,
        idempotencyKey,
        name,
        parentId,
        mimeType: contentType,
        expectedFileSize: size,
        objectPath,
        expiresAt,
      }).returning();
    } catch (error) {
      if ((error as { code?: string })?.code !== "23505") throw error;
      [intent] = await db.select().from(orgDocumentUploadIntentsTable)
        .where(and(
          eq(orgDocumentUploadIntentsTable.connectionId, principal.connectionId),
          eq(orgDocumentUploadIntentsTable.idempotencyKey, idempotencyKey),
        )).limit(1);
      if (!intent || intent.name !== name || intent.mimeType !== contentType || intent.expectedFileSize !== size || intent.parentId !== parentId) {
        res.status(409).json({ error: "Idempotency-Key conflict" });
        return;
      }
      uploadURL = await storage.getObjectEntityUploadURL(intent.id, "organization-document-staging");
      responseStatus = 200;
    }
    if (!intent) throw new Error("Upload intent insert returned no row");
    if (intent.status !== "pending" || intent.expiresAt <= new Date()) {
      res.status(409).json({ error: "Upload intent is no longer active" });
      return;
    }
    res.status(responseStatus).json({
      uploadId: intent.id,
      uploadURL,
      expiresAt: signedUploadExpiry(intent.expiresAt),
    });
    return;
  }
  const objectId = intent.id;
  const uploadURL = await storage.getObjectEntityUploadURL(objectId, "organization-document-staging");
  res.status(200).json({ uploadId: intent.id, uploadURL, expiresAt: signedUploadExpiry(intent.expiresAt) });
});

router.post("/connectors/v1/documents/uploads/:uploadId/complete", async (req, res) => {
  const principal = await requireScope(req, res, "documents:write");
  if (!principal) return;
  const [intent] = await db.select().from(orgDocumentUploadIntentsTable)
    .where(and(
      eq(orgDocumentUploadIntentsTable.id, req.params.uploadId),
      eq(orgDocumentUploadIntentsTable.orgId, principal.orgId),
      eq(orgDocumentUploadIntentsTable.connectionId, principal.connectionId),
    )).limit(1);
  if (!intent) {
    res.status(404).json({ error: "Upload intent not found" });
    return;
  }
  if (intent.status === "completed" && intent.documentId) {
    const [document] = await db.select(PUBLIC_DOCUMENT_FIELDS).from(orgDocumentsTable)
      .where(and(eq(orgDocumentsTable.id, intent.documentId), eq(orgDocumentsTable.orgId, principal.orgId))).limit(1);
    if (document) { res.json({ document }); return; }
  }
  if (intent.status !== "pending" || intent.expiresAt <= new Date()) {
    res.status(409).json({ error: "Upload intent is expired or no longer active" });
    return;
  }
  try {
    const file = await storage.getObjectEntityFile(intent.objectPath);
    const [metadata] = await file.getMetadata();
    const actualSize = Number(metadata.size);
    if (!Number.isSafeInteger(actualSize) || actualSize !== intent.expectedFileSize || actualSize > MAX_FILE_SIZE ||
        metadata.contentType !== intent.mimeType) {
      await storage.deleteObject(intent.objectPath);
      await db.update(orgDocumentUploadIntentsTable).set({ status: "rejected" })
        .where(eq(orgDocumentUploadIntentsTable.id, intent.id));
      res.status(400).json({ error: "Uploaded object does not match the declared file metadata" });
      return;
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(409).json({ error: "Uploaded object not found" });
      return;
    }
    throw error;
  }

  const finalObjectPath = await storage.copyUploadToOrganizationDocument(intent.objectPath, intent.id);
  const result = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(orgDocumentUploadIntentsTable)
      .where(and(
        eq(orgDocumentUploadIntentsTable.id, intent.id),
        eq(orgDocumentUploadIntentsTable.orgId, principal.orgId),
        eq(orgDocumentUploadIntentsTable.connectionId, principal.connectionId),
        eq(orgDocumentUploadIntentsTable.status, "pending"),
      )).for("update").limit(1);
    if (!locked || locked.expiresAt <= new Date()) return null;
    if (locked.parentId !== null) {
      const [parent] = await tx.select({ id: orgDocumentsTable.id }).from(orgDocumentsTable)
        .where(and(
          eq(orgDocumentsTable.id, locked.parentId),
          eq(orgDocumentsTable.orgId, principal.orgId),
          eq(orgDocumentsTable.isFolder, true),
        )).limit(1);
      if (!parent) return null;
    }
    const [created] = await tx.insert(orgDocumentsTable).values({
      orgId: principal.orgId,
      name: locked.name,
      parentId: locked.parentId,
      isFolder: false,
      objectPath: finalObjectPath,
      mimeType: locked.mimeType,
      fileSize: locked.expectedFileSize,
    }).returning(PUBLIC_DOCUMENT_FIELDS);
    await tx.update(orgDocumentUploadIntentsTable).set({
      status: "completed",
      documentId: created.id,
    }).where(eq(orgDocumentUploadIntentsTable.id, locked.id));
    await tx.insert(orgConnectorActivityTable).values({
      orgId: principal.orgId,
      connectionId: principal.connectionId,
      appId: principal.appId,
      eventType: "org_document_uploaded",
      resourceType: "org_document",
      summary: `${principal.appName} uploaded an organization document.`,
    });
    return created;
  });
  if (!result) {
    const [latest] = await db.select({ status: orgDocumentUploadIntentsTable.status })
      .from(orgDocumentUploadIntentsTable)
      .where(eq(orgDocumentUploadIntentsTable.id, intent.id)).limit(1);
    if (latest?.status !== "completed") {
      await storage.deleteObject(finalObjectPath);
    }
    res.status(409).json({ error: "Upload intent is no longer active" });
    return;
  }
  await storage.deleteObject(intent.objectPath);
  res.status(201).json({ document: result });
});

router.patch("/connectors/v1/documents/:id", async (req, res) => {
  const principal = await requireScope(req, res, "documents:write");
  if (!principal) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const keys = Object.keys(body);
  if (!keys.length || keys.some((key) => key !== "name" && key !== "parentId")) {
    res.status(400).json({ error: "Only name and parentId may be updated" });
    return;
  }
  const [existing] = await db.select().from(orgDocumentsTable)
    .where(and(eq(orgDocumentsTable.id, id), eq(orgDocumentsTable.orgId, principal.orgId))).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const updates: { name?: string; parentId?: number | null; updatedAt: Date } = { updatedAt: new Date() };
  if (body.name !== undefined) {
    const name = safeName(body.name);
    if (!name) { res.status(400).json({ error: "Invalid document name" }); return; }
    updates.name = name;
  }
  if (body.parentId !== undefined) {
    const parentId = body.parentId === null ? null : Number(body.parentId);
    if (parentId !== null && (!Number.isSafeInteger(parentId) || parentId <= 0)) {
      res.status(400).json({ error: "Invalid parentId" });
      return;
    }
    if (!existing.isFolder && parentId === existing.id) {
      res.status(400).json({ error: "A document cannot be its own parent" });
      return;
    }
    if (!(await getFolder(principal.orgId, parentId))) {
      res.status(404).json({ error: "Folder not found" });
      return;
    }
    if (existing.isFolder && parentId !== null) {
      let cursor: number | null = parentId;
      const seen = new Set<number>();
      for (let depth = 0; cursor !== null && depth < 1000; depth++) {
        if (cursor === existing.id) {
          res.status(400).json({ error: "A folder cannot be moved inside itself" });
          return;
        }
        if (seen.has(cursor)) break;
        seen.add(cursor);
        const [ancestor] = await db.select({ parentId: orgDocumentsTable.parentId })
          .from(orgDocumentsTable)
          .where(and(
            eq(orgDocumentsTable.id, cursor),
            eq(orgDocumentsTable.orgId, principal.orgId),
            eq(orgDocumentsTable.isFolder, true),
          )).limit(1);
        cursor = ancestor?.parentId ?? null;
      }
      if (cursor !== null) {
        res.status(400).json({ error: "Folder hierarchy is too deep or invalid" });
        return;
      }
    }
    updates.parentId = parentId;
  }
  const updated = await db.transaction(async (tx) => {
    const [record] = await tx.update(orgDocumentsTable).set(updates)
      .where(and(eq(orgDocumentsTable.id, id), eq(orgDocumentsTable.orgId, principal.orgId)))
      .returning(PUBLIC_DOCUMENT_FIELDS);
    if (record) {
      await tx.insert(orgConnectorActivityTable).values({
        orgId: principal.orgId,
        connectionId: principal.connectionId,
        appId: principal.appId,
        eventType: "org_document_updated",
        resourceType: "org_document",
        summary: `${principal.appName} updated an organization document.`,
      });
    }
    return record ?? null;
  });
  if (!updated) { res.status(404).json({ error: "Document not found" }); return; }
  res.json({ document: updated });
});

export default router;
