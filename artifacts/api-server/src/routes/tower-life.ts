import { Router, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, salarymanSavesTable } from "@workspace/db";
import { creditFiat, getSpendableFiat } from "../lib/fiat-wallet";

const router = Router();
const MENDER_TASK = {
  residentId: "mender-9",
  taskId: "terminal-recovery",
  rewardFiat: 32,
  relationshipDelta: 1,
} as const;

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated?.() || !req.user?.id) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return req.user.id;
}

function validSlot(value: unknown): value is number {
  const slot = Number(value);
  return Number.isInteger(slot) && slot >= 0 && slot <= 64;
}

/**
 * Settle a physical resident work order. The save marker and wallet credit live
 * in one transaction, so a retry or two simultaneous players cannot pay twice.
 */
router.post("/tower/resident-task", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = Number(req.body?.slot);
  const residentId = typeof req.body?.residentId === "string" ? req.body.residentId : "";
  const taskId = typeof req.body?.taskId === "string" ? req.body.taskId : "";
  const requestId = typeof req.body?.requestId === "string" ? req.body.requestId : "";
  if (!validSlot(slot) || residentId !== MENDER_TASK.residentId || taskId !== MENDER_TASK.taskId || !/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) {
    res.status(400).json({ error: "Invalid Tower work order" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const saves = await tx.select().from(salarymanSavesTable)
        .where(and(eq(salarymanSavesTable.userId, userId), eq(salarymanSavesTable.slotIndex, slot)))
        .for("update").limit(1);
      const save = saves[0];
      if (!save) return { kind: "missing" as const };

      const data = { ...((save.data ?? {}) as Record<string, unknown>) };
      const priorTowerLife = (data.towerLife && typeof data.towerLife === "object")
        ? data.towerLife as Record<string, unknown>
        : {};
      const completedTasks = Array.isArray(priorTowerLife.completedTasks)
        ? priorTowerLife.completedTasks.filter((value): value is string => typeof value === "string")
        : [];
      if (completedTasks.includes(MENDER_TASK.taskId)) {
        const wallet = await getSpendableFiat(userId);
        return { kind: "already-complete" as const, balance: wallet.balance, spendable: wallet.spendable };
      }

      const credit = await creditFiat(tx, {
        userId,
        amountFiat: MENDER_TASK.rewardFiat,
        description: "MENDER-9 terminal recovery work order",
        kind: "tower_resident_task",
        idempotencyKey: `tower-task:${userId}:${slot}:${MENDER_TASK.taskId}:${requestId}`,
      });
      const towerLife = {
        ...priorTowerLife,
        completedTasks: [...completedTasks, MENDER_TASK.taskId],
        relationships: {
          ...((priorTowerLife.relationships && typeof priorTowerLife.relationships === "object")
            ? priorTowerLife.relationships as Record<string, unknown>
            : {}),
          [MENDER_TASK.residentId]: MENDER_TASK.relationshipDelta,
        },
        lastTask: { residentId: MENDER_TASK.residentId, taskId: MENDER_TASK.taskId, completedAt: new Date().toISOString() },
      };
      await tx.update(salarymanSavesTable)
        .set({ data: { ...data, towerLife }, lastSavedAt: new Date() })
        .where(eq(salarymanSavesTable.id, save.id));
      return { kind: "completed" as const, balance: credit.newBalance, spendable: credit.spendable };
    });

    if (result.kind === "missing") {
      res.status(404).json({ error: "Save slot not found" });
      return;
    }
    res.json({
      ok: true,
      residentId: MENDER_TASK.residentId,
      taskId: MENDER_TASK.taskId,
      completed: true,
      alreadyCompleted: result.kind === "already-complete",
      rewardFiat: result.kind === "completed" ? MENDER_TASK.rewardFiat : 0,
      balance: result.balance,
      spendable: result.spendable,
    });
  } catch (error) {
    console.error("[tower-life] resident task failed", error);
    res.status(500).json({ error: "Tower work order could not be settled" });
  }
});

export default router;