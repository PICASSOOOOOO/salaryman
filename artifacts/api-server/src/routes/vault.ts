import { Router, type Request, type Response } from "express";
import { Readable } from "stream";
import { db, vaultEntriesTable, vaultConnectionsTable } from "@workspace/db";
import { eq, and, or, desc, ilike, sql } from "drizzle-orm";
import { parseNineteenNinetyNineProject } from "../lib/1999-project";
import { getObjectAclPolicy } from "../lib/objectAcl";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorageService = new ObjectStorageService();
const MAX_EMULATOR_SAVE_BYTES = 16 * 1024 * 1024;
type EmulatorMachineId = "fm1" | "smk37";

function isEmulatorMachineId(value: string): value is EmulatorMachineId {
  return value === "fm1" || value === "smk37";
}

function emulatorSaveObjectId(objectPath: unknown): string | null {
  if (typeof objectPath !== "string") return null;
  return objectPath.match(
    /^\/objects\/1999-emulator-saves\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
  )?.[1] ?? null;
}

function isValidEmulatorSaveMetadata(filename: unknown, sizeBytes: unknown): filename is string {
  return typeof filename === "string"
    && filename.length > 0
    && filename.length <= 120
    && !/[\u0000-\u001f]/.test(filename)
    && /\.fm1save$/i.test(filename)
    && Number.isInteger(sizeBytes)
    && Number(sizeBytes) >= 1
    && Number(sizeBytes) <= MAX_EMULATOR_SAVE_BYTES;
}

function requireAuth(req: Request, res: Response): req is Request & { user: Express.User } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

function extractWikiLinks(content: string): string[] {
  const matches = content.match(/\[\[([^\]]+)\]\]/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.slice(2, -2).split("|")[0].trim()))];
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, any>; content: string } {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) return { frontmatter: {}, content: raw };
  const fmBlock = fmMatch[1];
  const body = fmMatch[2];
  const frontmatter: Record<string, any> = {};
  for (const line of fmBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let val: any = line.slice(colonIdx + 1).trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      val = val.slice(1, -1).split(",").map((s: string) => s.trim().replace(/^["']|["']$/g, ""));
    } else if (val === "true") val = true;
    else if (val === "false") val = false;
    else if (!isNaN(Number(val)) && val !== "") val = Number(val);
    frontmatter[key] = val;
  }
  return { frontmatter, content: body };
}

function generateFrontmatter(entry: any): string {
  const fm: Record<string, any> = {
    title: entry.title,
    type: entry.entryType,
    tags: entry.tags || [],
    created: entry.createdAt,
    updated: entry.updatedAt,
  };
  if (entry.color) fm.color = entry.color;
  if (entry.folder && entry.folder !== "/") fm.folder = entry.folder;
  const fmData = entry.frontmatter && typeof entry.frontmatter === "object" ? entry.frontmatter : {};
  Object.assign(fm, fmData);

  let yaml = "---\n";
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) {
      yaml += `${k}: [${v.map((s: any) => `"${s}"`).join(", ")}]\n`;
    } else if (v instanceof Date) {
      yaml += `${k}: ${v.toISOString()}\n`;
    } else if (typeof v === "string" && v.includes(":")) {
      yaml += `${k}: "${v}"\n`;
    } else {
      yaml += `${k}: ${v}\n`;
    }
  }
  yaml += "---\n\n";
  return yaml;
}

async function syncWikiLinks(userId: string, entryId: number, content: string) {
  const linkedTitles = extractWikiLinks(content);

  const allEntries = await db.select({ id: vaultEntriesTable.id, title: vaultEntriesTable.title })
    .from(vaultEntriesTable)
    .where(eq(vaultEntriesTable.userId, userId));

  const titleMap = new Map(allEntries.map(e => [e.title.toLowerCase(), e.id]));

  const desiredTargets = new Set<number>();
  for (const title of linkedTitles) {
    const targetId = titleMap.get(title.toLowerCase());
    if (targetId && targetId !== entryId) desiredTargets.add(targetId);
  }

  const existingWikiConns = await db.select().from(vaultConnectionsTable)
    .where(and(
      eq(vaultConnectionsTable.userId, userId),
      eq(vaultConnectionsTable.sourceId, entryId),
      eq(vaultConnectionsTable.label, "wiki-link")
    ));

  const existingTargets = new Set(existingWikiConns.map(c => c.targetId));

  const toDelete = existingWikiConns.filter(c => !desiredTargets.has(c.targetId));
  for (const conn of toDelete) {
    await db.delete(vaultConnectionsTable).where(eq(vaultConnectionsTable.id, conn.id));
  }

  for (const targetId of desiredTargets) {
    if (existingTargets.has(targetId)) continue;
    await db.insert(vaultConnectionsTable).values({
      userId,
      sourceId: entryId,
      targetId,
      label: "wiki-link",
      strength: 1,
    });
  }
}

router.get("/vault/entries", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const q = (req.query.q as string)?.trim();
  const folder = (req.query.folder as string)?.trim();

  let rows;
  const conditions = [eq(vaultEntriesTable.userId, userId)];
  if (q) {
    conditions.push(or(
      ilike(vaultEntriesTable.title, `%${q}%`),
      ilike(vaultEntriesTable.content, `%${q}%`)
    )!);
  }
  if (folder) {
    conditions.push(eq(vaultEntriesTable.folder, folder));
  }

  rows = await db.select().from(vaultEntriesTable)
    .where(and(...conditions))
    .orderBy(desc(vaultEntriesTable.updatedAt))
    .limit(200);

  return res.json({ entries: rows });
});

router.get("/vault/folders", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const rows = await db.selectDistinct({ folder: vaultEntriesTable.folder })
    .from(vaultEntriesTable)
    .where(eq(vaultEntriesTable.userId, userId))
    .orderBy(vaultEntriesTable.folder);
  return res.json({ folders: rows.map(r => r.folder) });
});

router.get("/vault/entries/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  const [entry] = await db.select().from(vaultEntriesTable)
    .where(and(eq(vaultEntriesTable.id, id), eq(vaultEntriesTable.userId, req.user!.id)));
  if (!entry) return res.status(404).json({ error: "Not found" });

  const connections = await db.select().from(vaultConnectionsTable)
    .where(and(
      eq(vaultConnectionsTable.userId, req.user!.id),
      or(eq(vaultConnectionsTable.sourceId, id), eq(vaultConnectionsTable.targetId, id))
    ));

  const backlinks = await db.select({
    id: vaultEntriesTable.id,
    title: vaultEntriesTable.title,
    entryType: vaultEntriesTable.entryType,
  }).from(vaultEntriesTable)
    .innerJoin(vaultConnectionsTable, and(
      eq(vaultConnectionsTable.sourceId, vaultEntriesTable.id),
      eq(vaultConnectionsTable.targetId, id)
    ))
    .where(eq(vaultEntriesTable.userId, req.user!.id));

  return res.json({ entry, connections, backlinks });
});

router.post("/vault/entries/:id/emulator-save/:machine/upload-url", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = Number.parseInt(req.params.id as string, 10);
  const machine = String(req.params.machine);
  const { filename, sizeBytes } = req.body ?? {};
  if (!Number.isInteger(id) || id <= 0 || !isEmulatorMachineId(machine)) {
    return res.status(400).json({ error: "Invalid project or emulator." });
  }
  if (!isValidEmulatorSaveMetadata(filename, sizeBytes)) {
    return res.status(400).json({ error: "Choose a valid .fm1save file under 16 MB." });
  }

  const [entry] = await db.select().from(vaultEntriesTable)
    .where(and(eq(vaultEntriesTable.id, id), eq(vaultEntriesTable.userId, req.user!.id)));
  if (!entry || entry.entryType !== "1999_project" || entry.folder !== "/1999") {
    return res.status(404).json({ error: "Project not found." });
  }
  const project = parseNineteenNinetyNineProject(entry.content);
  if (!project) return res.status(400).json({ error: "Project data is invalid." });

  let objectId: string | undefined;
  const existingPath = project.emulatorState?.patchSaves?.[machine]?.objectPath;
  const existingObjectId = emulatorSaveObjectId(existingPath);
  if (existingObjectId && existingPath) {
    try {
      const file = await objectStorageService.getObjectEntityFile(existingPath);
      const policy = await getObjectAclPolicy(file);
      if (policy?.visibility === "private" && policy.owner === req.user!.id) {
        objectId = existingObjectId;
      }
    } catch {
      // A missing or unowned old object gets a fresh private object path.
    }
  }

  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL(objectId, "1999-emulator-saves");
    const objectPath = objectId
      ? `/objects/1999-emulator-saves/${objectId}`
      : objectStorageService.normalizeObjectEntityPath(uploadURL);
    return res.json({ uploadURL, objectPath });
  } catch (error) {
    console.error("Error preparing 1999 emulator save upload:", error);
    return res.status(500).json({ error: "Could not prepare the private patch-save upload." });
  }
});

router.post("/vault/entries/:id/emulator-save/:machine/complete", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = Number.parseInt(req.params.id as string, 10);
  const machine = String(req.params.machine);
  const { objectPath, filename, sizeBytes } = req.body ?? {};
  if (!Number.isInteger(id) || id <= 0 || !isEmulatorMachineId(machine)
    || !emulatorSaveObjectId(objectPath)
    || !isValidEmulatorSaveMetadata(filename, sizeBytes)) {
    return res.status(400).json({ error: "Invalid emulator save metadata." });
  }

  const [entry] = await db.select({ id: vaultEntriesTable.id, entryType: vaultEntriesTable.entryType, folder: vaultEntriesTable.folder })
    .from(vaultEntriesTable)
    .where(and(eq(vaultEntriesTable.id, id), eq(vaultEntriesTable.userId, req.user!.id)));
  if (!entry || entry.entryType !== "1999_project" || entry.folder !== "/1999") {
    return res.status(404).json({ error: "Project not found." });
  }

  try {
    const file = await objectStorageService.getObjectEntityFile(objectPath);
    const policy = await getObjectAclPolicy(file);
    if (policy && policy.owner !== req.user!.id) {
      return res.status(403).json({ error: "This patch file belongs to another account." });
    }
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) !== Number(sizeBytes)) {
      return res.status(400).json({ error: "Uploaded patch size did not match." });
    }
    await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
      owner: req.user!.id,
      visibility: "private",
    });
    return res.json({ ok: true });
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      return res.status(404).json({ error: "Uploaded patch file was not found." });
    }
    console.error("Error securing 1999 emulator save:", error);
    return res.status(500).json({ error: "Could not secure the uploaded patch file." });
  }
});

router.get("/vault/entries/:id/emulator-save/:machine", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = Number.parseInt(req.params.id as string, 10);
  const machine = String(req.params.machine);
  if (!Number.isInteger(id) || id <= 0 || !isEmulatorMachineId(machine)) {
    return res.status(400).json({ error: "Invalid project or emulator." });
  }

  const [entry] = await db.select().from(vaultEntriesTable)
    .where(and(eq(vaultEntriesTable.id, id), eq(vaultEntriesTable.userId, req.user!.id)));
  if (!entry || entry.entryType !== "1999_project" || entry.folder !== "/1999") {
    return res.status(404).json({ error: "Project not found." });
  }
  const project = parseNineteenNinetyNineProject(entry.content);
  const save = project?.emulatorState?.patchSaves?.[machine];
  if (!save || !emulatorSaveObjectId(save.objectPath)) {
    return res.status(404).json({ error: "No saved patch for this machine." });
  }

  try {
    const file = await objectStorageService.getObjectEntityFile(save.objectPath);
    const policy = await getObjectAclPolicy(file);
    if (!policy || policy.visibility !== "private" || policy.owner !== req.user!.id) {
      return res.status(403).json({ error: "Patch file is not owned by this account." });
    }
    const response = await objectStorageService.downloadObject(file, 0);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    const safeName = save.filename.replace(/[^a-z0-9._-]/gi, "_");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(save.filename)}`);
    res.setHeader("Cache-Control", "private, no-store");
    if (response.body) {
      return Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    }
    return res.end();
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      return res.status(404).json({ error: "Saved patch file is missing." });
    }
    console.error("Error downloading 1999 emulator save:", error);
    return res.status(500).json({ error: "Could not download the saved patch." });
  }
});

router.post("/vault/entries", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const { title, content, entryType, tags, color, folder, frontmatter } = req.body;
  if (!title || typeof title !== "string") return res.status(400).json({ error: "title required" });
  if (entryType === "1999_project") {
    if (folder !== "/1999" || !parseNineteenNinetyNineProject(content)) {
      res.status(400).json({ error: "Invalid 1999 project data" });
      return;
    }
  }

  const [entry] = await db.insert(vaultEntriesTable).values({
    userId: req.user!.id,
    title: title.trim(),
    content: content || "",
    entryType: entryType || "note",
    tags: Array.isArray(tags) ? tags : [],
    color: color || null,
    folder: folder || "/",
    frontmatter: frontmatter || {},
  }).returning();

  await syncWikiLinks(req.user!.id, entry.id, entry.content);
  return res.json({ entry });
});

router.put("/vault/entries/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  const { title, content, entryType, tags, color, folder, frontmatter, expectedUpdatedAt } = req.body;
  const [current] = await db.select().from(vaultEntriesTable)
    .where(and(eq(vaultEntriesTable.id, id), eq(vaultEntriesTable.userId, req.user!.id)));
  if (!current) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const targetType = entryType ?? current.entryType;
  const targetFolder = folder ?? current.folder;
  const targetContent = content ?? current.content;
  if (current.entryType === "1999_project" && entryType !== undefined && entryType !== "1999_project") {
    res.status(400).json({ error: "1999 project type cannot be changed" });
    return;
  }
  if (targetType === "1999_project"
    && (targetFolder !== "/1999" || !parseNineteenNinetyNineProject(targetContent))) {
    res.status(400).json({ error: "Invalid 1999 project data" });
    return;
  }

  let expectedDate: Date | undefined;
  if (expectedUpdatedAt !== undefined) {
    if (typeof expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
      res.status(400).json({ error: "Invalid expectedUpdatedAt" });
      return;
    }
    expectedDate = new Date(expectedUpdatedAt);
  }

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title.trim();
  if (content !== undefined) updates.content = content;
  if (entryType !== undefined) updates.entryType = entryType;
  if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags : [];
  if (color !== undefined) updates.color = color;
  if (folder !== undefined) updates.folder = folder;
  if (frontmatter !== undefined) updates.frontmatter = frontmatter;
  if (expectedDate) {
    updates.updatedAt = new Date(Math.max(Date.now(), expectedDate.getTime() + 1));
  }

  const conditions = [
    eq(vaultEntriesTable.id, id),
    eq(vaultEntriesTable.userId, req.user!.id),
  ];
  if (expectedDate) {
    // API JSON dates have millisecond precision; truncate the database value
    // so default timestamps with sub-millisecond precision still round-trip.
    conditions.push(sql`date_trunc('milliseconds', ${vaultEntriesTable.updatedAt}) = ${expectedDate}`);
  }
  const [entry] = await db.update(vaultEntriesTable).set(updates)
    .where(and(...conditions))
    .returning();
  if (!entry) {
    if (expectedDate) {
      const [latest] = await db.select().from(vaultEntriesTable)
        .where(and(eq(vaultEntriesTable.id, id), eq(vaultEntriesTable.userId, req.user!.id)));
      if (latest) {
        res.status(409).json({ error: "Project changed in another session", entry: latest });
        return;
      }
    }
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (content !== undefined) {
    await syncWikiLinks(req.user!.id, id, content);
  }

  return res.json({ entry });
});

router.delete("/vault/entries/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  const [entry] = await db.delete(vaultEntriesTable)
    .where(and(eq(vaultEntriesTable.id, id), eq(vaultEntriesTable.userId, req.user!.id)))
    .returning();
  if (!entry) return res.status(404).json({ error: "Not found" });
  if (entry.entryType === "1999_project") {
    const project = parseNineteenNinetyNineProject(entry.content);
    const saves = Object.values(project?.emulatorState?.patchSaves ?? {});
    await Promise.all(saves.map(async save => {
      if (!save) return;
      try {
        const file = await objectStorageService.getObjectEntityFile(save.objectPath);
        const policy = await getObjectAclPolicy(file);
        if (policy?.owner === req.user!.id) await objectStorageService.deleteObject(save.objectPath);
      } catch {
        // A missing attachment does not prevent deletion of its project.
      }
    }));
  }
  return res.json({ ok: true });
});

router.get("/vault/connections", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const rows = await db.select().from(vaultConnectionsTable)
    .where(eq(vaultConnectionsTable.userId, req.user!.id));
  return res.json({ connections: rows });
});

router.post("/vault/connections", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const { sourceId, targetId, label, strength } = req.body;
  if (!sourceId || !targetId) return res.status(400).json({ error: "sourceId and targetId required" });
  if (sourceId === targetId) return res.status(400).json({ error: "Cannot connect entry to itself" });

  const sources = await db.select({ id: vaultEntriesTable.id }).from(vaultEntriesTable)
    .where(and(eq(vaultEntriesTable.id, sourceId), eq(vaultEntriesTable.userId, req.user!.id)));
  const targets = await db.select({ id: vaultEntriesTable.id }).from(vaultEntriesTable)
    .where(and(eq(vaultEntriesTable.id, targetId), eq(vaultEntriesTable.userId, req.user!.id)));
  if (sources.length === 0 || targets.length === 0) return res.status(404).json({ error: "Entry not found" });

  const existing = await db.select({ id: vaultConnectionsTable.id }).from(vaultConnectionsTable)
    .where(and(
      eq(vaultConnectionsTable.userId, req.user!.id),
      or(
        and(eq(vaultConnectionsTable.sourceId, sourceId), eq(vaultConnectionsTable.targetId, targetId)),
        and(eq(vaultConnectionsTable.sourceId, targetId), eq(vaultConnectionsTable.targetId, sourceId))
      )
    ));
  if (existing.length > 0) return res.status(409).json({ error: "Connection already exists" });

  const [conn] = await db.insert(vaultConnectionsTable).values({
    userId: req.user!.id,
    sourceId,
    targetId,
    label: label || null,
    strength: strength || 1,
  }).returning();

  return res.json({ connection: conn });
});

router.delete("/vault/connections/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  const [conn] = await db.delete(vaultConnectionsTable)
    .where(and(eq(vaultConnectionsTable.id, id), eq(vaultConnectionsTable.userId, req.user!.id)))
    .returning();
  if (!conn) return res.status(404).json({ error: "Not found" });
  return res.json({ ok: true });
});

router.get("/vault/graph", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;

  const entries = await db.select({
    id: vaultEntriesTable.id,
    title: vaultEntriesTable.title,
    entryType: vaultEntriesTable.entryType,
    tags: vaultEntriesTable.tags,
    color: vaultEntriesTable.color,
    folder: vaultEntriesTable.folder,
    updatedAt: vaultEntriesTable.updatedAt,
  }).from(vaultEntriesTable)
    .where(eq(vaultEntriesTable.userId, userId))
    .orderBy(desc(vaultEntriesTable.updatedAt));

  const connections = await db.select().from(vaultConnectionsTable)
    .where(eq(vaultConnectionsTable.userId, userId));

  const nodes = entries.map(e => ({
    id: e.id,
    title: e.title,
    type: e.entryType,
    tags: e.tags,
    color: e.color,
    folder: e.folder,
    updatedAt: e.updatedAt,
    connectionCount: connections.filter(c => c.sourceId === e.id || c.targetId === e.id).length,
  }));

  const edges = connections.map(c => ({
    id: c.id,
    source: c.sourceId,
    target: c.targetId,
    label: c.label,
    strength: c.strength,
  }));

  return res.json({ nodes, edges });
});

router.post("/vault/import", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const { files } = req.body;
  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: "files array required" });
  }

  const imported: any[] = [];
  const entryKey = (folder: string, title: string) => `${folder.toLowerCase()}::${title.toLowerCase()}`;
  const keyToId = new Map<string, number>();

  const existing = await db.select({ id: vaultEntriesTable.id, title: vaultEntriesTable.title, folder: vaultEntriesTable.folder })
    .from(vaultEntriesTable)
    .where(eq(vaultEntriesTable.userId, userId));
  existing.forEach(e => keyToId.set(entryKey(e.folder, e.title), e.id));

  for (const file of files) {
    const { filename, raw } = file;
    if (!filename || !raw) continue;

    const title = filename.replace(/\.md$/i, "").split("/").pop() || filename;
    const folderPath = filename.includes("/")
      ? "/" + filename.split("/").slice(0, -1).join("/")
      : "/";

    const { frontmatter, content } = parseFrontmatter(raw);
    const tags = frontmatter.tags || [];
    const entryType = frontmatter.type || "note";
    const color = frontmatter.color || null;

    const existingId = keyToId.get(entryKey(folderPath, title));
    if (existingId) {
      const [updated] = await db.update(vaultEntriesTable).set({
        content,
        entryType,
        tags: Array.isArray(tags) ? tags : [],
        color,
        folder: folderPath,
        frontmatter,
        updatedAt: new Date(),
      }).where(and(eq(vaultEntriesTable.id, existingId), eq(vaultEntriesTable.userId, userId)))
        .returning();
      if (updated) imported.push(updated);
    } else {
      const [entry] = await db.insert(vaultEntriesTable).values({
        userId,
        title,
        content,
        entryType,
        tags: Array.isArray(tags) ? tags : [],
        color,
        folder: folderPath,
        frontmatter,
      }).returning();
      keyToId.set(entryKey(folderPath, title), entry.id);
      imported.push(entry);
    }
  }

  for (const entry of imported) {
    await syncWikiLinks(userId, entry.id, entry.content);
  }

  return res.json({ imported: imported.length, entries: imported });
});

router.get("/vault/export", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;

  const entries = await db.select().from(vaultEntriesTable)
    .where(eq(vaultEntriesTable.userId, userId))
    .orderBy(vaultEntriesTable.folder, vaultEntriesTable.title);

  const files = entries.map(entry => {
    const fm = generateFrontmatter(entry);
    const folder = entry.folder === "/" ? "" : entry.folder.replace(/^\//, "") + "/";
    return {
      filename: `${folder}${entry.title}.md`,
      content: fm + entry.content,
    };
  });

  return res.json({ files, count: files.length });
});

router.post("/vault/search-memory", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const { query, limit: maxResults } = req.body;
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "query required" });
  }

  const cap = Math.min(maxResults || 10, 50);
  const terms = query.split(/\s+/).filter(t => t.length > 2);
  if (terms.length === 0) return res.json({ results: [] });

  const searchPattern = terms.map(t => `%${t}%`);
  const conditions = searchPattern.map(p =>
    or(ilike(vaultEntriesTable.title, p), ilike(vaultEntriesTable.content, p))
  );

  const entries = await db.select({
    id: vaultEntriesTable.id,
    title: vaultEntriesTable.title,
    content: vaultEntriesTable.content,
    entryType: vaultEntriesTable.entryType,
    tags: vaultEntriesTable.tags,
    folder: vaultEntriesTable.folder,
    updatedAt: vaultEntriesTable.updatedAt,
  }).from(vaultEntriesTable)
    .where(and(
      eq(vaultEntriesTable.userId, userId),
      or(...conditions.filter(Boolean) as any)
    ))
    .orderBy(desc(vaultEntriesTable.updatedAt))
    .limit(cap);

  const results = entries.map(e => ({
    id: e.id,
    title: e.title,
    snippet: e.content.length > 500 ? e.content.slice(0, 500) + "…" : e.content,
    type: e.entryType,
    tags: e.tags,
    folder: e.folder,
    updatedAt: e.updatedAt,
  }));

  return res.json({ results, query });
});

export default router;
