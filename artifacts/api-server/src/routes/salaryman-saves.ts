import { Router, type IRouter } from "express";
import { db, salarymanSavesTable, organizationsTable, orgMembersTable, worldBusinessesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getUserTier } from "../lib/plan";

const router: IRouter = Router();

const FREE_MAX_SLOTS = 2;
const PRO_MAX_SLOTS = 10;
const ENTERPRISE_MAX_SLOTS = 1;

async function hasActiveEnterprise(userId: string): Promise<boolean> {
  const owned = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.ownerUserId, userId))
    .limit(1);
  if (owned.length > 0) return true;
  const membership = await db
    .select({ orgId: orgMembersTable.orgId })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
    .limit(1);
  if (membership.length > 0) return true;
  const realBiz = await db
    .select({ id: worldBusinessesTable.id })
    .from(worldBusinessesTable)
    .where(and(eq(worldBusinessesTable.userId, userId), eq(worldBusinessesTable.businessType, "real")))
    .limit(1);
  return realBiz.length > 0;
}

router.get("/salaryman/saves", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const tier = await getUserTier(req.user.id, req.user.email);
    const enterprise = await hasActiveEnterprise(req.user.id);
    const maxSlots = enterprise ? ENTERPRISE_MAX_SLOTS : tier === "pro" ? PRO_MAX_SLOTS : FREE_MAX_SLOTS;
    const saves = await db
      .select()
      .from(salarymanSavesTable)
      .where(eq(salarymanSavesTable.userId, req.user.id));
    res.json({ saves, maxSlots, tier, enterprise });
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
  const tier = await getUserTier(req.user.id, req.user.email);
  const enterprise = await hasActiveEnterprise(req.user.id);
  const maxSlots = enterprise ? ENTERPRISE_MAX_SLOTS : tier === "pro" ? PRO_MAX_SLOTS : FREE_MAX_SLOTS;
  if (isNaN(slot) || slot < 0 || slot >= maxSlots) {
    res.status(400).json({ error: enterprise ? "Enterprise accounts are limited to 1 save slot" : `Invalid slot (0-${maxSlots - 1})`, maxSlots, tier, enterprise });
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
  const tier = await getUserTier(req.user.id, req.user.email);
  const enterprise = await hasActiveEnterprise(req.user.id);
  const maxSlots = enterprise ? ENTERPRISE_MAX_SLOTS : tier === "pro" ? PRO_MAX_SLOTS : FREE_MAX_SLOTS;
  if (isNaN(slot) || slot < 0 || slot >= maxSlots) {
    res.status(400).json({ error: `Invalid slot (0-${maxSlots - 1})`, maxSlots, tier });
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
