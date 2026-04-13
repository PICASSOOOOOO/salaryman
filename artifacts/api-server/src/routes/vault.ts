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

router.get("/vault/entries", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const q = (req.query.q as string)?.trim();

  let rows;
  if (q) {
    rows = await db.select().from(vaultEntriesTable)
      .where(and(
        eq(vaultEntriesTable.userId, userId),
        or(
          ilike(vaultEntriesTable.title, `%${q}%`),
          ilike(vaultEntriesTable.content, `%${q}%`)
        )
      ))
      .orderBy(desc(vaultEntriesTable.updatedAt))
      .limit(200);
  } else {
    rows = await db.select().from(vaultEntriesTable)
      .where(eq(vaultEntriesTable.userId, userId))
      .orderBy(desc(vaultEntriesTable.updatedAt))
      .limit(200);
  }
  return res.json({ entries: rows });
});

router.get("/vault/entries/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  const [entry] = await db.select().from(vaultEntriesTable)
    .where(and(eq(vaultEntriesTable.id, id), eq(vaultEntriesTable.userId, req.user!.id)));
  if (!entry) return res.status(404).json({ error: "Not found" });

  const connections = await db.select().from(vaultConnectionsTable)
    .where(and(
      eq(vaultConnectionsTable.userId, req.user!.id),
      or(eq(vaultConnectionsTable.sourceId, id), eq(vaultConnectionsTable.targetId, id))
    ));

  return res.json({ entry, connections });
});

router.post("/vault/entries", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const { title, content, entryType, tags, color } = req.body;
  if (!title || typeof title !== "string") return res.status(400).json({ error: "title required" });

  const [entry] = await db.insert(vaultEntriesTable).values({
    userId: req.user!.id,
    title: title.trim(),
    content: content || "",
    entryType: entryType || "note",
    tags: Array.isArray(tags) ? tags : [],
    color: color || null,
  }).returning();

  return res.json({ entry });
});

router.put("/vault/entries/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  const { title, content, entryType, tags, color } = req.body;
  const updates: Record<string, any> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title.trim();
  if (content !== undefined) updates.content = content;
  if (entryType !== undefined) updates.entryType = entryType;
  if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags : [];
  if (color !== undefined) updates.color = color;

  const [entry] = await db.update(vaultEntriesTable).set(updates)
    .where(and(eq(vaultEntriesTable.id, id), eq(vaultEntriesTable.userId, req.user!.id)))
    .returning();
  if (!entry) return res.status(404).json({ error: "Not found" });
  return res.json({ entry });
});

router.delete("/vault/entries/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id);
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
  const id = parseInt(req.params.id);
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

export default router;
