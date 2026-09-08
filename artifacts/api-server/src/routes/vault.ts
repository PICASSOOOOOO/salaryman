import { Router, type Request, type Response } from "express";
import { db, vaultEntriesTable, vaultConnectionsTable } from "@workspace/db";
import { eq, and, or, desc, ilike, sql } from "drizzle-orm";

const router = Router();

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

router.post("/vault/entries", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const { title, content, entryType, tags, color, folder, frontmatter } = req.body;
  if (!title || typeof title !== "string") return res.status(400).json({ error: "title required" });

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

  const { title, content, entryType, tags, color, folder, frontmatter } = req.body;
  const updates: Record<string, any> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title.trim();
  if (content !== undefined) updates.content = content;
  if (entryType !== undefined) updates.entryType = entryType;
  if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags : [];
  if (color !== undefined) updates.color = color;
  if (folder !== undefined) updates.folder = folder;
  if (frontmatter !== undefined) updates.frontmatter = frontmatter;

  const [entry] = await db.update(vaultEntriesTable).set(updates)
    .where(and(eq(vaultEntriesTable.id, id), eq(vaultEntriesTable.userId, req.user!.id)))
    .returning();
  if (!entry) return res.status(404).json({ error: "Not found" });

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
