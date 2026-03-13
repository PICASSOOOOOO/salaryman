import { Router, type IRouter } from "express";
import { db, contactsTable, userMemoryTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";

const router: IRouter = Router();

router.get("/account", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  const [contactCountRow] = await db
    .select({ count: count() })
    .from(contactsTable)
    .where(eq(contactsTable.userId, req.user.id));

  const [memoryRow] = await db
    .select()
    .from(userMemoryTable)
    .where(eq(userMemoryTable.userId, req.user.id));

  res.json({
    user: req.user,
    contactCount: contactCountRow?.count ?? 0,
    memory: memoryRow?.memory ?? "",
    memoryUpdatedAt: memoryRow?.updatedAt ?? null,
  });
});

router.put("/account/memory", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  const { memory } = req.body as { memory: string };
  await db
    .insert(userMemoryTable)
    .values({ userId: req.user.id, memory: memory ?? "" })
    .onConflictDoUpdate({
      target: userMemoryTable.userId,
      set: { memory: memory ?? "" },
    });

  res.json({ ok: true });
});

router.delete("/account/data", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  const { scope } = req.query as { scope?: string };

  if (scope === "memory" || !scope) {
    await db
      .delete(userMemoryTable)
      .where(eq(userMemoryTable.userId, req.user.id));
  }

  if (scope === "contacts" || !scope) {
    await db
      .delete(contactsTable)
      .where(eq(contactsTable.userId, req.user.id));
  }

  res.json({ ok: true });
});

export default router;
