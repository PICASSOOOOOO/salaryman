import { Router } from "express";
import { db, projectsTable, notesTable, brandKitTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

// ── Auth guard helper ───────────────────────────────────────────────────────
function requireAuth(req: any, res: any): string | null {
  if (!req.isAuthenticated?.()) { res.status(401).json({ error: "Login required" }); return null; }
  return req.user?.id ?? null;
}

// ══════════════════════════════════════════════════════════════════════════════
// PROJECTS
// ══════════════════════════════════════════════════════════════════════════════

// GET all projects
router.get("/workspace/projects", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const rows = await db.select().from(projectsTable).where(eq(projectsTable.userId, userId)).orderBy(desc(projectsTable.updatedAt));
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch projects" }); }
});

// POST create project
router.post("/workspace/projects", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const { name, type = "general", description = "" } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: "Name required" }); return; }
  try {
    const [row] = await db.insert(projectsTable).values({ userId, name: name.trim(), type, description }).returning();
    res.json(row);
  } catch (e) { res.status(500).json({ error: "Failed to create project" }); }
});

// PUT update project
router.put("/workspace/projects/:id", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const id = parseInt(req.params.id);
  const { name, type, description } = req.body;
  try {
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (type !== undefined) updates.type = type;
    if (description !== undefined) updates.description = description;
    const [row] = await db.update(projectsTable).set(updates).where(and(eq(projectsTable.id, id), eq(projectsTable.userId, userId))).returning();
    res.json(row ?? { error: "Not found" });
  } catch (e) { res.status(500).json({ error: "Failed to update project" }); }
});

// DELETE project (also deletes its notes)
router.delete("/workspace/projects/:id", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const id = parseInt(req.params.id);
  try {
    await db.delete(notesTable).where(and(eq(notesTable.projectId, id), eq(notesTable.userId, userId)));
    await db.delete(projectsTable).where(and(eq(projectsTable.id, id), eq(projectsTable.userId, userId)));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Failed to delete project" }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// NOTES (project-scoped or global knowledge base when projectId is null)
// ══════════════════════════════════════════════════════════════════════════════

// GET notes for a project
router.get("/workspace/projects/:id/notes", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const projectId = parseInt(req.params.id);
  try {
    const rows = await db.select().from(notesTable).where(and(eq(notesTable.userId, userId), eq(notesTable.projectId, projectId))).orderBy(desc(notesTable.updatedAt));
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch notes" }); }
});

// GET global knowledge base notes (no project)
router.get("/workspace/knowledge", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const rows = await db.select().from(notesTable).where(eq(notesTable.userId, userId)).orderBy(desc(notesTable.updatedAt));
    res.json(rows.filter(r => r.projectId === null));
  } catch (e) { res.status(500).json({ error: "Failed to fetch knowledge" }); }
});

// POST create note
router.post("/workspace/notes", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const { projectId = null, title, content = "", category = "general" } = req.body;
  if (!title?.trim()) { res.status(400).json({ error: "Title required" }); return; }
  try {
    const [row] = await db.insert(notesTable).values({ userId, projectId, title: title.trim(), content, category }).returning();
    res.json(row);
  } catch (e) { res.status(500).json({ error: "Failed to create note" }); }
});

// PUT update note
router.put("/workspace/notes/:id", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const id = parseInt(req.params.id);
  const { title, content, category } = req.body;
  try {
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title.trim();
    if (content !== undefined) updates.content = content;
    if (category !== undefined) updates.category = category;
    const [row] = await db.update(notesTable).set(updates).where(and(eq(notesTable.id, id), eq(notesTable.userId, userId))).returning();
    res.json(row ?? { error: "Not found" });
  } catch (e) { res.status(500).json({ error: "Failed to update note" }); }
});

// DELETE note
router.delete("/workspace/notes/:id", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const id = parseInt(req.params.id);
  try {
    await db.delete(notesTable).where(and(eq(notesTable.id, id), eq(notesTable.userId, userId)));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Failed to delete note" }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// BRAND KIT
// ══════════════════════════════════════════════════════════════════════════════

// GET brand kit
router.get("/workspace/brand-kit", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const [row] = await db.select().from(brandKitTable).where(eq(brandKitTable.userId, userId));
    res.json(row ?? {});
  } catch (e) { res.status(500).json({ error: "Failed to fetch brand kit" }); }
});

// PUT upsert brand kit
router.put("/workspace/brand-kit", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const { companyName, tagline, mission, primaryColor, secondaryColor, logoUrl, website, industry, targetAudience, fontPrimary, fontSecondary, toneOfVoice } = req.body;
  try {
    const values: Record<string, unknown> = { userId };
    if (companyName !== undefined) values.companyName = companyName;
    if (tagline !== undefined) values.tagline = tagline;
    if (mission !== undefined) values.mission = mission;
    if (primaryColor !== undefined) values.primaryColor = primaryColor;
    if (secondaryColor !== undefined) values.secondaryColor = secondaryColor;
    if (logoUrl !== undefined) values.logoUrl = logoUrl;
    if (website !== undefined) values.website = website;
    if (industry !== undefined) values.industry = industry;
    if (targetAudience !== undefined) values.targetAudience = targetAudience;
    if (fontPrimary !== undefined) values.fontPrimary = fontPrimary;
    if (fontSecondary !== undefined) values.fontSecondary = fontSecondary;
    if (toneOfVoice !== undefined) values.toneOfVoice = toneOfVoice;
    const [row] = await db.insert(brandKitTable).values(values as any).onConflictDoUpdate({ target: brandKitTable.userId, set: values as any }).returning();
    res.json(row);
  } catch (e) { res.status(500).json({ error: "Failed to save brand kit" }); }
});

export default router;
