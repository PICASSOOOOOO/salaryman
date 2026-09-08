import { Router, type IRouter } from "express";
import { db, goalsTable, goalMilestonesTable } from "@workspace/db";
import { eq, and, sql, asc } from "drizzle-orm";

const router: IRouter = Router();

function requireAuth(req: any, res: any): string | null {
  if (!req.isAuthenticated?.()) { res.status(401).json({ error: "Login required" }); return null; }
  return req.user?.id ?? null;
}

router.get("/tools/goals", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const rows = await db.select().from(goalsTable)
      .where(eq(goalsTable.userId, userId))
      .orderBy(sql`${goalsTable.createdAt} DESC`);
    res.json({ goals: rows });
  } catch (e) { res.status(500).json({ error: "Failed to fetch goals" }); }
});

router.post("/tools/goals", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const { title, description, period, targetMetric, currentValue, targetValue, unit, deadline } = req.body;
  if (!title?.trim()) { res.status(400).json({ error: "Title required" }); return; }
  try {
    const [row] = await db.insert(goalsTable).values({
      userId,
      title: title.trim(),
      description: description ?? "",
      period: period ?? "Quarterly",
      targetMetric: targetMetric ?? "",
      currentValue: currentValue ?? 0,
      targetValue: targetValue ?? 100,
      unit: unit ?? "%",
      deadline: deadline ?? null,
      status: "active",
    }).returning();
    res.status(201).json({ goal: row });
  } catch (e) { res.status(500).json({ error: "Failed to create goal" }); }
});

router.put("/tools/goals/:id", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const id = Number(req.params.id);
  const { title, description, period, targetMetric, currentValue, targetValue, unit, deadline, status } = req.body;
  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description;
    if (period !== undefined) updates.period = period;
    if (targetMetric !== undefined) updates.targetMetric = targetMetric;
    if (currentValue !== undefined) updates.currentValue = Number(currentValue);
    if (targetValue !== undefined) updates.targetValue = Number(targetValue);
    if (unit !== undefined) updates.unit = unit;
    if (deadline !== undefined) updates.deadline = deadline;
    if (status !== undefined) updates.status = status;
    const [row] = await db.update(goalsTable).set(updates)
      .where(and(eq(goalsTable.id, id), eq(goalsTable.userId, userId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Goal not found" }); return; }
    res.json({ goal: row });
  } catch (e) { res.status(500).json({ error: "Failed to update goal" }); }
});

router.delete("/tools/goals/:id", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const id = Number(req.params.id);
  try {
    await db.delete(goalsTable).where(and(eq(goalsTable.id, id), eq(goalsTable.userId, userId)));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Failed to delete goal" }); }
});

router.get("/tools/goals/:id/milestones", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const goalId = Number(req.params.id);
  try {
    const rows = await db.select().from(goalMilestonesTable)
      .where(and(eq(goalMilestonesTable.goalId, goalId), eq(goalMilestonesTable.userId, userId)))
      .orderBy(asc(goalMilestonesTable.sortOrder), asc(goalMilestonesTable.createdAt));
    res.json({ milestones: rows });
  } catch (e) { res.status(500).json({ error: "Failed to fetch milestones" }); }
});

router.post("/tools/goals/:id/milestones", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const goalId = Number(req.params.id);
  const { text } = req.body;
  if (!text?.trim()) { res.status(400).json({ error: "Text required" }); return; }
  try {
    const [row] = await db.insert(goalMilestonesTable).values({
      goalId,
      userId,
      text: text.trim(),
      completed: false,
      sortOrder: 0,
    }).returning();
    res.status(201).json({ milestone: row });
  } catch (e) { res.status(500).json({ error: "Failed to create milestone" }); }
});

router.put("/tools/goals/milestones/:id", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const id = Number(req.params.id);
  const { completed, text } = req.body;
  try {
    const updates: Record<string, unknown> = {};
    if (completed !== undefined) {
      updates.completed = completed;
      updates.completedAt = completed ? new Date() : null;
    }
    if (text !== undefined) updates.text = text.trim();
    const [row] = await db.update(goalMilestonesTable).set(updates)
      .where(and(eq(goalMilestonesTable.id, id), eq(goalMilestonesTable.userId, userId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Milestone not found" }); return; }
    res.json({ milestone: row });
  } catch (e) { res.status(500).json({ error: "Failed to update milestone" }); }
});

router.delete("/tools/goals/milestones/:id", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const id = Number(req.params.id);
  try {
    await db.delete(goalMilestonesTable).where(and(eq(goalMilestonesTable.id, id), eq(goalMilestonesTable.userId, userId)));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Failed to delete milestone" }); }
});

export default router;
