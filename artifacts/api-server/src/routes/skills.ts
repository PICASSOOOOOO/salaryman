import { Router, type Request, type Response } from "express";
import { db, salarymanSavesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { SKILL_CATALOG, getSkillById, canUnlock } from "../lib/skill-catalog";

const router = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!(req as any).isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  const id = (req as any).user?.id ?? null;
  if (!id) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return id;
}

function parseSlot(raw: unknown): number {
  const n = parseInt(String(raw ?? "0"), 10);
  if (isNaN(n) || n < 0 || n > 64) return 0;
  return n;
}

// GET /api/skills?slot=N
// Returns the full catalog + the player's unlocked skills + current SP balance.
router.get("/skills", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.query.slot);
  try {
    const [row] = await db
      .select({ data: salarymanSavesTable.data })
      .from(salarymanSavesTable)
      .where(and(
        eq(salarymanSavesTable.userId, userId),
        eq(salarymanSavesTable.slotIndex, slot),
      ))
      .limit(1);

    const data = (row?.data ?? {}) as Record<string, unknown>;
    const unlocked: string[] = Array.isArray(data.skills) ? (data.skills as string[]) : [];
    const skillPoints: number = typeof data.skill_points === "number" ? data.skill_points : 0;

    res.json({
      catalog: SKILL_CATALOG,
      unlocked,
      skillPoints,
    });
  } catch (err: any) {
    console.error("[Skills] GET error:", err?.message);
    res.status(500).json({ error: "Failed to load skills" });
  }
});

// POST /api/skills/unlock
// Body: { slot: number, skillId: string }
// Validates prereqs, checks SP, deducts SP, writes skill to save blob.
router.post("/skills/unlock", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const slot = parseSlot(req.body?.slot);
  const skillId = typeof req.body?.skillId === "string" ? req.body.skillId.trim() : "";

  const skillDef = getSkillById(skillId);
  if (!skillDef) {
    res.status(400).json({ error: "Unknown skill" });
    return;
  }

  try {
    const [row] = await db
      .select({ id: salarymanSavesTable.id, data: salarymanSavesTable.data })
      .from(salarymanSavesTable)
      .where(and(
        eq(salarymanSavesTable.userId, userId),
        eq(salarymanSavesTable.slotIndex, slot),
      ))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Save slot not found" });
      return;
    }

    const data = (row.data ?? {}) as Record<string, unknown>;
    const unlocked: string[] = Array.isArray(data.skills) ? [...(data.skills as string[])] : [];
    let skillPoints: number = typeof data.skill_points === "number" ? data.skill_points : 0;

    if (unlocked.includes(skillId)) {
      res.status(409).json({ error: "Already unlocked" });
      return;
    }

    if (!canUnlock(skillId, unlocked)) {
      res.status(422).json({ error: "Prerequisite skill not unlocked" });
      return;
    }

    if (skillPoints < skillDef.cost) {
      res.status(402).json({ error: "Insufficient skill points", required: skillDef.cost, available: skillPoints });
      return;
    }

    skillPoints -= skillDef.cost;
    unlocked.push(skillId);

    const updatedData = {
      ...data,
      skills: unlocked,
      skill_points: skillPoints,
    };

    await db
      .update(salarymanSavesTable)
      .set({ data: updatedData, lastSavedAt: new Date() })
      .where(eq(salarymanSavesTable.id, row.id));

    res.json({ ok: true, unlocked, skillPoints });
  } catch (err: any) {
    console.error("[Skills] unlock error:", err?.message);
    res.status(500).json({ error: "Failed to unlock skill" });
  }
});

export default router;
