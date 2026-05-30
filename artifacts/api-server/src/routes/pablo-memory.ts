import { Router, type IRouter, type Request, type Response } from "express";
import { db, pabloMemoriesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated?.()) { res.status(401).json({ error: "Login required" }); return null; }
  return req.user?.id ?? null;
}

const KINDS = new Set(["lesson", "preference", "fact", "decision"]);

// Pablo's persistent memory — discrete, per-entry lessons/decisions that survive
// across sessions (the compound-engineering idea: every interaction can leave a
// durable lesson Pablo recalls later). Distinct from the generic user_memory blob.
router.get("/pablo/memory", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const rows = await db.select().from(pabloMemoriesTable)
      .where(eq(pabloMemoriesTable.userId, userId))
      .orderBy(sql`${pabloMemoriesTable.weight} DESC`, sql`${pabloMemoriesTable.createdAt} DESC`)
      .limit(200);
    res.json({ memories: rows });
  } catch { res.status(500).json({ error: "Failed to fetch memory" }); }
});

router.post("/pablo/memory", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const { content, kind, source, weight } = req.body ?? {};
  if (!content || typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "content required" }); return;
  }
  try {
    const [row] = await db.insert(pabloMemoriesTable).values({
      userId,
      content: content.trim().slice(0, 2000),
      kind: typeof kind === "string" && KINDS.has(kind) ? kind : "lesson",
      source: typeof source === "string" ? source.slice(0, 40) : "user",
      weight: Number.isFinite(Number(weight)) ? Math.max(1, Math.min(10, Math.round(Number(weight)))) : 1,
    }).returning();
    res.status(201).json({ memory: row });
  } catch { res.status(500).json({ error: "Failed to save memory" }); }
});

router.delete("/pablo/memory/:id", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  try {
    await db.delete(pabloMemoriesTable)
      .where(and(eq(pabloMemoriesTable.id, id), eq(pabloMemoriesTable.userId, userId)));
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Failed to delete memory" }); }
});

export default router;
