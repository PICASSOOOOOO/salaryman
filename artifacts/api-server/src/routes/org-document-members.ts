import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import {
  db,
  orgDocumentsTable,
  orgDocumentUploadIntentsTable,
} from "@workspace/db";
import { resolveCurrentOrgId } from "../lib/org-permissions";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const storage = new ObjectStorageService();
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg", "image/png", "image/webp", "text/plain",
]);
const fields = {
  id: orgDocumentsTable.id,
  name: orgDocumentsTable.name,
  parentId: orgDocumentsTable.parentId,
  isFolder: orgDocumentsTable.isFolder,
  mimeType: orgDocumentsTable.mimeType,
  fileSize: orgDocumentsTable.fileSize,
  createdAt: orgDocumentsTable.createdAt,
  updatedAt: orgDocumentsTable.updatedAt,
};

async function context(req: Request, res: Response) {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  const userId = String((req.user as { id: string }).id);
  const orgId = await resolveCurrentOrgId(userId);
  if (!orgId) {
    res.status(404).json({ error: "No active organization found" });
    return null;
  }
  return { userId, orgId };
}

function validName(value: unknown): value is string {
  return typeof value === "string" && !!value.trim() && value.trim().length <= 300 &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

async function folderExists(orgId: number, parentId: number | null) {
  if (parentId === null) return true;
  const [folder] = await db.select({ id: orgDocumentsTable.id }).from(orgDocumentsTable)
    .where(and(eq(orgDocumentsTable.id, parentId), eq(orgDocumentsTable.orgId, orgId), eq(orgDocumentsTable.isFolder, true))).limit(1);
  return !!folder;
}

router.get("/org/documents", async (req, res) => {
  const user = await context(req, res);
  if (!user) return;
  const parentId = req.query.parentId === undefined ? null : Number(req.query.parentId);
  if (parentId !== null && (!Number.isSafeInteger(parentId) || parentId <= 0)) {
    res.status(400).json({ error: "Invalid parentId" }); return;
  }
  if (!(await folderExists(user.orgId, parentId))) {
    res.status(404).json({ error: "Folder not found" }); return;
  }
  const documents = await db.select(fields).from(orgDocumentsTable).where(and(
    eq(orgDocumentsTable.orgId, user.orgId),
    parentId === null ? isNull(orgDocumentsTable.parentId) : eq(orgDocumentsTable.parentId, parentId),
  )).orderBy(desc(orgDocumentsTable.isFolder), desc(orgDocumentsTable.updatedAt), desc(orgDocumentsTable.id)).limit(200);
  res.json({ documents });
});

router.post("/org/documents/folders", async (req, res) => {
  const user = await context(req, res);
  if (!user) return;
  const { name, parentId: rawParentId } = req.body ?? {};
  const parentId = rawParentId === undefined || rawParentId === null ? null : Number(rawParentId);
  if (!validName(name) || (parentId !== null && (!Number.isSafeInteger(parentId) || parentId <= 0))) {
    res.status(400).json({ error: "Invalid folder name or parentId" }); return;
  }
  if (!(await folderExists(user.orgId, parentId))) {
    res.status(404).json({ error: "Folder not found" }); return;
  }
  const [folder] = await db.insert(orgDocumentsTable).values({
    orgId: user.orgId, name: name.trim(), parentId, isFolder: true,
  }).returning(fields);
  res.status(201).json({ document: folder });
});

router.post("/org/documents/uploads", async (req, res) => {
  const user = await context(req, res);
  if (!user) return;
  const { name, contentType, size, parentId: rawParentId } = req.body ?? {};
  const parentId = rawParentId === undefined || rawParentId === null ? null : Number(rawParentId);
  const mimeType = typeof contentType === "string" ? contentType.toLowerCase() : "";
  if (!validName(name) || !ALLOWED_TYPES.has(mimeType) || !Number.isSafeInteger(size) || size <= 0 || size > MAX_FILE_SIZE ||
      (parentId !== null && (!Number.isSafeInteger(parentId) || parentId <= 0))) {
    res.status(400).json({ error: "Invalid file metadata" }); return;
  }
  if (!(await folderExists(user.orgId, parentId))) {
    res.status(404).json({ error: "Folder not found" }); return;
  }
  const id = randomUUID();
  const uploadURL = await storage.getObjectEntityUploadURL(id, "organization-document-staging");
  const objectPath = storage.normalizeObjectEntityPath(uploadURL);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await db.insert(orgDocumentUploadIntentsTable).values({
    id, orgId: user.orgId, connectionId: null, uploadedByUserId: user.userId,
    idempotencyKey: `member:${id}`, name: name.trim(), parentId, mimeType,
    expectedFileSize: size, objectPath, expiresAt,
  });
  res.status(201).json({ uploadId: id, uploadURL, expiresAt: new Date(Math.min(expiresAt.getTime(), Date.now() + 15 * 60 * 1000)) });
});

router.post("/org/documents/uploads/:uploadId/complete", async (req, res) => {
  const user = await context(req, res);
  if (!user) return;
  const [intent] = await db.select().from(orgDocumentUploadIntentsTable).where(and(
    eq(orgDocumentUploadIntentsTable.id, req.params.uploadId),
    eq(orgDocumentUploadIntentsTable.orgId, user.orgId),
    eq(orgDocumentUploadIntentsTable.uploadedByUserId, user.userId),
    isNull(orgDocumentUploadIntentsTable.connectionId),
  )).limit(1);
  if (!intent) { res.status(404).json({ error: "Upload intent not found" }); return; }
  if (intent.status === "completed" && intent.documentId) {
    const [document] = await db.select(fields).from(orgDocumentsTable).where(and(
      eq(orgDocumentsTable.id, intent.documentId), eq(orgDocumentsTable.orgId, user.orgId),
    )).limit(1);
    if (document) { res.json({ document }); return; }
  }
  if (intent.status !== "pending" || intent.expiresAt <= new Date()) {
    res.status(409).json({ error: "Upload intent is expired or no longer active" }); return;
  }
  try {
    const file = await storage.getObjectEntityFile(intent.objectPath);
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) !== intent.expectedFileSize || metadata.contentType !== intent.mimeType) {
      await storage.deleteObject(intent.objectPath);
      await db.update(orgDocumentUploadIntentsTable).set({ status: "rejected" })
        .where(eq(orgDocumentUploadIntentsTable.id, intent.id));
      res.status(400).json({ error: "Uploaded object does not match the declared metadata" }); return;
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) { res.status(409).json({ error: "Uploaded object not found" }); return; }
    throw error;
  }
  const canonicalPath = await storage.copyUploadToOrganizationDocument(intent.objectPath, intent.id);
  const document = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(orgDocumentUploadIntentsTable).where(and(
      eq(orgDocumentUploadIntentsTable.id, intent.id),
      eq(orgDocumentUploadIntentsTable.status, "pending"),
      eq(orgDocumentUploadIntentsTable.uploadedByUserId, user.userId),
    )).for("update").limit(1);
    if (!locked || locked.expiresAt <= new Date()) return null;
    if (locked.parentId !== null) {
      const [parent] = await tx.select({ id: orgDocumentsTable.id }).from(orgDocumentsTable).where(and(
        eq(orgDocumentsTable.id, locked.parentId), eq(orgDocumentsTable.orgId, user.orgId), eq(orgDocumentsTable.isFolder, true),
      )).limit(1);
      if (!parent) return null;
    }
    const [created] = await tx.insert(orgDocumentsTable).values({
      orgId: user.orgId, name: locked.name, parentId: locked.parentId, isFolder: false,
      objectPath: canonicalPath, mimeType: locked.mimeType, fileSize: locked.expectedFileSize,
      uploadedByUserId: user.userId,
    }).returning(fields);
    await tx.update(orgDocumentUploadIntentsTable).set({ status: "completed", documentId: created.id })
      .where(eq(orgDocumentUploadIntentsTable.id, locked.id));
    return created;
  });
  if (!document) {
    await storage.deleteObject(canonicalPath);
    res.status(409).json({ error: "Upload intent is no longer active" }); return;
  }
  await storage.deleteObject(intent.objectPath);
  res.status(201).json({ document });
});

router.get("/org/documents/:id/content", async (req, res) => {
  const user = await context(req, res);
  if (!user) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid document ID" }); return; }
  const [document] = await db.select({
    name: orgDocumentsTable.name, mimeType: orgDocumentsTable.mimeType,
    isFolder: orgDocumentsTable.isFolder, objectPath: orgDocumentsTable.objectPath,
  }).from(orgDocumentsTable).where(and(eq(orgDocumentsTable.id, id), eq(orgDocumentsTable.orgId, user.orgId))).limit(1);
  if (!document || document.isFolder || !document.objectPath) { res.status(404).json({ error: "Document not found" }); return; }
  try {
    const file = await storage.getObjectEntityFile(document.objectPath);
    res.setHeader("Content-Type", document.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    file.createReadStream().on("error", () => res.destroy()).pipe(res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) { res.status(404).json({ error: "Document content unavailable" }); return; }
    throw error;
  }
});

router.patch("/org/documents/:id", async (req, res) => {
  const user = await context(req, res);
  if (!user) return;
  const id = Number(req.params.id);
  const body = req.body ?? {};
  const hasName = Object.prototype.hasOwnProperty.call(body, "name");
  const hasParentId = Object.prototype.hasOwnProperty.call(body, "parentId");
  const parentId = body.parentId === null ? null : Number(body.parentId);
  if (!Number.isSafeInteger(id) || id <= 0 || (!hasName && !hasParentId) ||
      (hasName && !validName(body.name)) ||
      (hasParentId && parentId !== null && (!Number.isSafeInteger(parentId) || parentId <= 0))) {
    res.status(400).json({ error: "Invalid document ID, name, or parentId" }); return;
  }
  const result = await db.transaction(async (tx) => {
    // Serialize tree moves within an organization so simultaneous moves cannot
    // create a cycle by each validating against the other's old location.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(192837465, ${user.orgId})`);
    const [current] = await tx.select({
      id: orgDocumentsTable.id,
      parentId: orgDocumentsTable.parentId,
    }).from(orgDocumentsTable).where(and(
      eq(orgDocumentsTable.id, id),
      eq(orgDocumentsTable.orgId, user.orgId),
    )).for("update").limit(1);
    if (!current) return { kind: "not_found" as const };

    if (hasParentId && parentId !== null) {
      const visited = new Set<number>();
      let ancestorId: number | null = parentId;
      while (ancestorId !== null) {
        if (ancestorId === id || visited.has(ancestorId)) return { kind: "cycle" as const };
        visited.add(ancestorId);
        const [ancestor] = await tx.select({
          id: orgDocumentsTable.id,
          parentId: orgDocumentsTable.parentId,
          isFolder: orgDocumentsTable.isFolder,
        }).from(orgDocumentsTable).where(and(
          eq(orgDocumentsTable.id, ancestorId),
          eq(orgDocumentsTable.orgId, user.orgId),
        )).limit(1);
        if (!ancestor || !ancestor.isFolder) return { kind: "invalid_parent" as const };
        ancestorId = ancestor.parentId;
      }
    }

    const updates: { name?: string; parentId?: number | null; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (hasName) updates.name = body.name.trim();
    if (hasParentId) updates.parentId = parentId;
    const [document] = await tx.update(orgDocumentsTable).set(updates)
      .where(and(eq(orgDocumentsTable.id, id), eq(orgDocumentsTable.orgId, user.orgId)))
      .returning(fields);
    return { kind: "updated" as const, document };
  });
  if (result.kind === "not_found") { res.status(404).json({ error: "Document not found" }); return; }
  if (result.kind === "invalid_parent") { res.status(404).json({ error: "Destination folder not found" }); return; }
  if (result.kind === "cycle") { res.status(409).json({ error: "A folder cannot be moved into itself or a descendant" }); return; }
  res.json({ document: result.document });
});

router.delete("/org/documents/:id", async (req, res) => {
  const user = await context(req, res);
  if (!user) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid document ID" }); return; }
  const [document] = await db.select().from(orgDocumentsTable)
    .where(and(eq(orgDocumentsTable.id, id), eq(orgDocumentsTable.orgId, user.orgId))).limit(1);
  if (!document) { res.status(404).json({ error: "Document not found" }); return; }
  if (document.isFolder) { res.status(409).json({ error: "Folder deletion is not available yet" }); return; }
  await db.delete(orgDocumentsTable).where(and(eq(orgDocumentsTable.id, id), eq(orgDocumentsTable.orgId, user.orgId)));
  if (document.objectPath) await storage.deleteObject(document.objectPath);
  res.json({ ok: true });
});

export default router;
