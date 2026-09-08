import { Router, type IRouter } from "express";
import { db, contactsTable, userMemoryTable, usersTable, chatChannelsTable, chatMessagesTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { getAllUsage } from "../lib/usage-meter";
import { getOrInitUsername, changeUsername } from "../lib/username";

const router: IRouter = Router();

// GET /account/username — current handle + when the next change unlocks.
// Lazily assigns an initial handle derived from the user's name.
router.get("/account/username", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const state = await getOrInitUsername(req.user.id);
    const [row] = await db
      .select({ profileImageUrl: usersTable.profileImageUrl })
      .from(usersTable)
      .where(eq(usersTable.id, req.user.id));
    res.json({ ...state, profileImageUrl: row?.profileImageUrl ?? null });
  } catch (err) {
    console.error("[account/username] get error", err);
    res.status(500).json({ error: "Failed to load username" });
  }
});

// POST /account/avatar  body: { objectPath } — set the profile photo from an
// object the client just uploaded via /storage/uploads/request-url. We store
// the raw objectPath ("/objects/...") and resolve it to a serving URL on the
// client; Replit-auth absolute URLs continue to pass through untouched.
router.post("/account/avatar", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const { objectPath } = req.body as { objectPath?: string };
  if (typeof objectPath !== "string" || !objectPath.startsWith("/objects/")) {
    res.status(400).json({ error: "A valid uploaded objectPath is required" });
    return;
  }
  try {
    await db.update(usersTable).set({ profileImageUrl: objectPath }).where(eq(usersTable.id, req.user.id));
    res.json({ profileImageUrl: objectPath });
  } catch (err) {
    console.error("[account/avatar] set error", err);
    res.status(500).json({ error: "Failed to set profile photo" });
  }
});

// DELETE /account/avatar — clear the profile photo (falls back to initials).
router.delete("/account/avatar", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    await db.update(usersTable).set({ profileImageUrl: null }).where(eq(usersTable.id, req.user.id));
    res.json({ profileImageUrl: null });
  } catch (err) {
    console.error("[account/avatar] clear error", err);
    res.status(500).json({ error: "Failed to clear profile photo" });
  }
});

// POST /account/username  body: { username } — set/change with 60-day cooldown.
router.post("/account/username", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const { username } = req.body as { username?: string };
  if (typeof username !== "string" || !username.trim()) {
    res.status(400).json({ error: "username is required" });
    return;
  }
  try {
    const result = await changeUsername(req.user.id, username);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error, canChangeAt: result.canChangeAt ?? null });
      return;
    }
    res.json(result.state);
  } catch (err) {
    console.error("[account/username] set error", err);
    res.status(500).json({ error: "Failed to set username" });
  }
});

// GET /account/settings — the player's synced UI / display preferences so they
// follow across devices. Returns the stored blob ({ settings, lowGfx }) or
// nulls when the player has never synced (client then keeps its local-only blob).
router.get("/account/settings", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const [row] = await db
      .select({ gameSettings: usersTable.gameSettings })
      .from(usersTable)
      .where(eq(usersTable.id, req.user.id));
    const stored = (row?.gameSettings ?? null) as
      | { settings?: Record<string, unknown> | null; lowGfx?: boolean }
      | null;
    res.json({
      settings: stored?.settings ?? null,
      lowGfx: typeof stored?.lowGfx === "boolean" ? stored.lowGfx : null,
    });
  } catch (err) {
    console.error("[account/settings] get error", err);
    res.status(500).json({ error: "Failed to load settings" });
  }
});

// PUT /account/settings  body: { settings?: object, lowGfx?: boolean } — persist
// the player's UI / display preferences. The client mirrors its local
// sm_game_settings_v1 + salaryman_low_gfx here so the choices follow them to
// another device. We store the blob verbatim (it's the player's own prefs) but
// cap its size to avoid abuse.
router.put("/account/settings", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const body = req.body as { settings?: unknown; lowGfx?: unknown };
  const settings =
    body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)
      ? (body.settings as Record<string, unknown>)
      : undefined;
  const lowGfx = typeof body.lowGfx === "boolean" ? body.lowGfx : undefined;
  if (settings === undefined && lowGfx === undefined) {
    res.status(400).json({ error: "settings or lowGfx is required" });
    return;
  }
  // Guard against an oversized blob — the legitimate settings object is tiny.
  if (settings !== undefined && JSON.stringify(settings).length > 8192) {
    res.status(413).json({ error: "settings blob too large" });
    return;
  }
  try {
    const [row] = await db
      .select({ gameSettings: usersTable.gameSettings })
      .from(usersTable)
      .where(eq(usersTable.id, req.user.id));
    const prev = (row?.gameSettings ?? {}) as {
      settings?: Record<string, unknown> | null;
      lowGfx?: boolean;
    };
    const next = {
      settings: settings !== undefined ? settings : prev.settings ?? null,
      lowGfx: lowGfx !== undefined ? lowGfx : prev.lowGfx ?? false,
    };
    await db.update(usersTable).set({ gameSettings: next }).where(eq(usersTable.id, req.user.id));
    res.json({ ok: true, ...next });
  } catch (err) {
    console.error("[account/settings] set error", err);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

router.get("/account/usage", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const usage = await getAllUsage(req.user.id);
    res.json({ period: new Date().toISOString().slice(0, 7), usage });
  } catch (err) {
    console.error("[account/usage] error", err);
    res.status(500).json({ error: "Failed to load usage" });
  }
});

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
