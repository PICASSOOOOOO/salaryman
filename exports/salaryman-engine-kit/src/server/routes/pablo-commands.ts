import { Router, type IRouter, type Request, type Response } from "express";
import { db, pabloCommandsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated?.()) { res.status(401).json({ error: "Login required" }); return null; }
  return req.user?.id ?? null;
}

const KINDS = new Set(["agent", "navigate", "prompt"]);

// The deck command registry (cursor/plugins + ECC idea): the Pablo Deck's buttons
// are not hardcoded — they live server-side and are user-extensible. Each command
// is either an agent goal, an app navigation, or a one-shot Pablo prompt.
const DEFAULT_COMMANDS: Array<{ label: string; description: string; kind: string; payload: string; icon: string; sortOrder: number }> = [
  { label: "Size up the pipeline", description: "Pablo reviews every open deal and tells you what to chase.", kind: "agent", payload: "Review my deal pipeline and tell me which deals to push and which to drop.", icon: "TrendingUp", sortOrder: 10 },
  { label: "Log a new lead", description: "Capture a lead straight into the pipeline.", kind: "agent", payload: "Add a new lead deal to my pipeline based on what I tell you.", icon: "Briefcase", sortOrder: 20 },
  { label: "What did I learn?", description: "Pablo recalls the lessons he's saved for you.", kind: "agent", payload: "Recall what you've learned about me and my business and summarize it.", icon: "Brain", sortOrder: 40 },
];

async function ensureSeeded(userId: string) {
  // Serialize per-user seeding with a transaction-scoped advisory lock so two
  // concurrent first-loads of the deck can't both pass the count===0 check and
  // double-insert the defaults. The lock auto-releases at transaction end.
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"pablo_cmd_seed:" + userId}))`);
    // Defaults are persisted per user, so remove the retired command for
    // previously seeded palettes as well as omitting it for new users.
    await tx.delete(pabloCommandsTable).where(and(
      eq(pabloCommandsTable.userId, userId),
      eq(pabloCommandsTable.label, "Open the war room"),
      eq(pabloCommandsTable.kind, "navigate"),
      eq(pabloCommandsTable.payload, "/console/agents"),
    ));
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` })
      .from(pabloCommandsTable)
      .where(eq(pabloCommandsTable.userId, userId));
    if (count > 0) return;
    await tx.insert(pabloCommandsTable).values(
      DEFAULT_COMMANDS.map((c) => ({ ...c, userId })),
    );
  });
}

router.get("/pablo/commands", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    await ensureSeeded(userId);
    const rows = await db.select().from(pabloCommandsTable)
      .where(eq(pabloCommandsTable.userId, userId))
      .orderBy(sql`${pabloCommandsTable.sortOrder} ASC`, sql`${pabloCommandsTable.id} ASC`);
    res.json({ commands: rows });
  } catch { res.status(500).json({ error: "Failed to fetch commands" }); }
});

router.post("/pablo/commands", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const { label, description, kind, payload, icon, sortOrder } = req.body ?? {};
  if (!label || typeof label !== "string" || !label.trim()) {
    res.status(400).json({ error: "label required" }); return;
  }
  try {
    const [row] = await db.insert(pabloCommandsTable).values({
      userId,
      label: label.trim().slice(0, 120),
      description: typeof description === "string" ? description.slice(0, 300) : "",
      kind: typeof kind === "string" && KINDS.has(kind) ? kind : "agent",
      payload: typeof payload === "string" ? payload.slice(0, 2000) : "",
      icon: typeof icon === "string" ? icon.slice(0, 40) : "Command",
      sortOrder: Number.isFinite(Number(sortOrder)) ? Math.round(Number(sortOrder)) : 100,
    }).returning();
    res.status(201).json({ command: row });
  } catch { res.status(500).json({ error: "Failed to create command" }); }
});

router.put("/pablo/commands/:id", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  const { label, description, kind, payload, icon, sortOrder, enabled } = req.body ?? {};
  try {
    const updates: Record<string, unknown> = {};
    if (label !== undefined) updates.label = String(label).trim().slice(0, 120);
    if (description !== undefined) updates.description = String(description).slice(0, 300);
    if (kind !== undefined && KINDS.has(String(kind))) updates.kind = kind;
    if (payload !== undefined) updates.payload = String(payload).slice(0, 2000);
    if (icon !== undefined) updates.icon = String(icon).slice(0, 40);
    if (sortOrder !== undefined && Number.isFinite(Number(sortOrder))) updates.sortOrder = Math.round(Number(sortOrder));
    if (enabled !== undefined) updates.enabled = Boolean(enabled);
    if (Object.keys(updates).length === 0) { res.status(400).json({ error: "no updates" }); return; }
    const [row] = await db.update(pabloCommandsTable).set(updates)
      .where(and(eq(pabloCommandsTable.id, id), eq(pabloCommandsTable.userId, userId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Command not found" }); return; }
    res.json({ command: row });
  } catch { res.status(500).json({ error: "Failed to update command" }); }
});

router.delete("/pablo/commands/:id", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  try {
    await db.delete(pabloCommandsTable)
      .where(and(eq(pabloCommandsTable.id, id), eq(pabloCommandsTable.userId, userId)));
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Failed to delete command" }); }
});

export default router;
