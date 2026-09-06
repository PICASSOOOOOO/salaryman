import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, salarymanSavesTable } from "@workspace/db";
import { spendFiat } from "../lib/fiat-wallet";
import { findVendingFood } from "../lib/vending-food";
import { recordLegacyRecoveryEventTx, restoreLegacyRecoveryForUser } from "../lib/legacy-recovery";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated?.() || !req.user?.id) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return req.user.id;
}

const finiteNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function applyFoodEffect(
  data: Record<string, unknown>,
  effect: string,
  random = Math.random,
): Record<string, unknown> {
  const next = { ...data };
  const maxHp = finiteNumber(next.maxHp, 100);
  for (const token of effect.split(" ")) {
    if (token.startsWith("hunger")) next.hunger = clamp(finiteNumber(next.hunger, 100) + (parseInt(token.slice(6), 10) || 0), 0, 100);
    else if (token === "thirst-10") next.thirst = clamp(finiteNumber(next.thirst, 100) - 10, 0, 100);
    else if (token.startsWith("thirst")) next.thirst = clamp(finiteNumber(next.thirst, 100) + (parseInt(token.slice(6), 10) || 0), 0, 100);
    else if (token.startsWith("energy")) next.energy = clamp(finiteNumber(next.energy, 100) + (parseInt(token.slice(6), 10) || 0), 0, 100);
    else if (token === "hprisk5" && random() < 0.1) next.hp = clamp(finiteNumber(next.hp, maxHp) - 5, 0, maxHp);
    else if (token.startsWith("hp")) next.hp = clamp(finiteNumber(next.hp, maxHp) + (parseInt(token.slice(2), 10) || 0), 0, maxHp);
    else if (token === "cure_poison") {
      next.poisoned = false;
      next.poisonTick = 0;
    } else if (token.startsWith("power")) next.powerLevel = clamp(finiteNumber(next.powerLevel) + (parseInt(token.slice(5), 10) || 0), 0, 100);
  }
  return next;
}

router.post("/vending/food/purchase", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  await restoreLegacyRecoveryForUser(userId, (req.user as { email?: string | null }).email);
  const item = findVendingFood(String(req.body?.itemId ?? ""));
  const slotIndex = Number(req.body?.slotIndex ?? 0);
  const requestId = String(req.body?.requestId ?? "");
  if (!item || !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 64 || !/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) {
    res.status(400).json({ error: "Invalid food purchase" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [save] = await tx
        .select()
        .from(salarymanSavesTable)
        .where(and(eq(salarymanSavesTable.userId, userId), eq(salarymanSavesTable.slotIndex, slotIndex)))
        .for("update")
        .limit(1);
      if (!save) return { type: "missing_save" as const };

      const paid = await spendFiat(tx, {
        userId,
        amountFiat: item.price,
        description: `VendKing food: ${item.name}`,
        kind: "vending_food",
        idempotencyKey: requestId,
      });
      if (!paid.ok) return { type: "insufficient" as const, paid };
      if (paid.duplicate) return { type: "ok" as const, paid, data: save.data };

      const data = applyFoodEffect(save.data, item.effect);
      await tx
        .update(salarymanSavesTable)
        .set({ data, lastSavedAt: new Date() })
        .where(eq(salarymanSavesTable.id, save.id));
      if (!paid.duplicate) {
        await recordLegacyRecoveryEventTx(tx, {
          userId,
          eventKey: `vending-food:${userId}:${requestId}`,
          kind: "vending_food",
          itemId: item.id,
          slotIndex,
          amountFiat: item.price,
          payload: { name: item.name, effect: item.effect },
        });
      }
      return { type: "ok" as const, paid, data };
    });

    if (result.type === "missing_save") {
      res.status(409).json({ error: "Create a character before buying food" });
      return;
    }
    if (result.type === "insufficient") {
      res.status(402).json({ error: "insufficient_fiat", required: item.price, spendable: result.paid.spendable });
      return;
    }
    res.json({
      ok: true,
      itemId: item.id,
      spentFiat: item.price,
      newBalance: result.paid.newBalance,
      spendable: result.paid.spendable,
      data: result.data,
    });
  } catch (error) {
    console.error("[vending] food purchase failed:", error);
    res.status(500).json({ error: "Purchase failed" });
  }
});

export default router;