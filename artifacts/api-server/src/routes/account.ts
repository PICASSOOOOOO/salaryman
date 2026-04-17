import { Router, type IRouter } from "express";
import { db, contactsTable, userMemoryTable, usersTable, chatChannelsTable, chatMessagesTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";

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

  const [userRow] = await db
    .select({ pabloPrivacyMode: usersTable.pabloPrivacyMode })
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));

  res.json({
    user: req.user,
    contactCount: contactCountRow?.count ?? 0,
    memory: memoryRow?.memory ?? "",
    memoryUpdatedAt: memoryRow?.updatedAt ?? null,
    pabloPrivacyMode: userRow?.pabloPrivacyMode ?? false,
  });
});

router.put("/account/privacy", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  const { pabloPrivacyMode } = req.body as { pabloPrivacyMode?: boolean };
  if (typeof pabloPrivacyMode !== "boolean") {
    res.status(400).json({ error: "pabloPrivacyMode must be a boolean" });
    return;
  }

  const userId = req.user.id;

  await db.transaction(async (tx) => {
    await tx.update(usersTable).set({ pabloPrivacyMode }).where(eq(usersTable.id, userId));

    if (pabloPrivacyMode) {
      const pabloChannels = await tx
        .select({ id: chatChannelsTable.id })
        .from(chatChannelsTable)
        .where(and(eq(chatChannelsTable.type, "pablo"), eq(chatChannelsTable.user1Id, userId)));

      for (const ch of pabloChannels) {
        await tx.delete(chatMessagesTable).where(eq(chatMessagesTable.channelId, ch.id));
      }

      await tx.delete(userMemoryTable).where(eq(userMemoryTable.userId, userId));
    }
  });

  res.json({ ok: true, pabloPrivacyMode });
});

router.put("/account/memory", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  const { memory } = req.body as { memory: string };

  const [u] = await db
    .select({ pabloPrivacyMode: usersTable.pabloPrivacyMode })
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));
  if (u?.pabloPrivacyMode) {
    res.status(403).json({ error: "Memory cannot be saved while Pablo privacy mode is on" });
    return;
  }

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
