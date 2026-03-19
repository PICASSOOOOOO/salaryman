import { Router, type IRouter } from "express";
import { db, salarymanSavesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/salaryman/saves", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const saves = await db
      .select()
      .from(salarymanSavesTable)
      .where(eq(salarymanSavesTable.userId, req.user.id));
    res.json({ saves });
  } catch (err: any) {
    console.error("[saves] list error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/salaryman/saves/:slot", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const slot = parseInt(req.params.slot, 10);
  if (isNaN(slot) || slot < 0 || slot > 3) {
    res.status(400).json({ error: "Invalid slot (0-3)" });
    return;
  }
  const { charName, charClass, level, salary, lastZone, playtime, data } = req.body;
  if (!charName || !charClass || !data) {
    res.status(400).json({ error: "charName, charClass, data required" });
    return;
  }
  try {
    const [row] = await db
      .insert(salarymanSavesTable)
      .values({
        userId: req.user.id,
        slotIndex: slot,
        charName: String(charName).slice(0, 64).toUpperCase(),
        charClass: String(charClass).slice(0, 32).toLowerCase(),
        level: Number(level) || 1,
        salary: Number(salary) || 0,
        lastZone: String(lastZone || "MINX CITY").slice(0, 64),
        playtime: Number(playtime) || 0,
        data: data as Record<string, unknown>,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [salarymanSavesTable.userId, salarymanSavesTable.slotIndex],
        set: {
          charName: String(charName).slice(0, 64).toUpperCase(),
          charClass: String(charClass).slice(0, 32).toLowerCase(),
          level: Number(level) || 1,
          salary: Number(salary) || 0,
          lastZone: String(lastZone || "MINX CITY").slice(0, 64),
          playtime: Number(playtime) || 0,
          data: data as Record<string, unknown>,
          lastSavedAt: new Date(),
        },
      })
      .returning();
    res.json({ ok: true, save: row });
  } catch (err: any) {
    console.error("[saves] upsert error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/salaryman/saves/:slot", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const slot = parseInt(req.params.slot, 10);
  if (isNaN(slot) || slot < 0 || slot > 3) {
    res.status(400).json({ error: "Invalid slot" });
    return;
  }
  try {
    await db
      .delete(salarymanSavesTable)
      .where(
        and(
          eq(salarymanSavesTable.userId, req.user.id),
          eq(salarymanSavesTable.slotIndex, slot)
        )
      );
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[saves] delete error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
