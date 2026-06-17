import { Router, type Request, type Response, type NextFunction } from "express";
import { and, eq, or, sql, ne } from "drizzle-orm";
import {
  db,
  colleaguesTable,
  canonicalPair,
  usersTable,
  orgMembersTable,
  notificationsTable,
} from "@workspace/db";
import { normalizeUsername, resolveUserByUsername } from "../lib/username";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  next();
}

function uid(req: Request): string {
  return (req as Request & { user?: { id?: string } }).user?.id ?? "";
}

async function getOrgId(userId: string): Promise<number | null> {
  if (!userId) return null;
  const rows = await db
    .select({ orgId: orgMembersTable.orgId })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
    .limit(1);
  return rows[0]?.orgId ?? null;
}

// GET /colleagues — accepted colleagues only (cross-org friends).
router.get("/colleagues", requireAuth, async (req, res) => {
  const me = uid(req);
  const rows = await db
    .select()
    .from(colleaguesTable)
    .where(
      and(
        or(eq(colleaguesTable.userAId, me), eq(colleaguesTable.userBId, me)),
        eq(colleaguesTable.status, "accepted"),
      ),
    );
  const otherIds = rows.map(r => (r.userAId === me ? r.userBId : r.userAId));
  const users = otherIds.length
    ? await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email, profileImageUrl: usersTable.profileImageUrl, username: usersTable.username })
        .from(usersTable)
        .where(sql`${usersTable.id} = ANY(${otherIds})`)
    : [];
  res.json({
    colleagues: users.map(u => ({
      userId: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || u.id,
      email: u.email,
      username: u.username,
      profileImageUrl: u.profileImageUrl,
    })),
  });
});

// GET /colleagues/requests — pending incoming + outgoing.
router.get("/colleagues/requests", requireAuth, async (req, res) => {
  const me = uid(req);
  const rows = await db
    .select()
    .from(colleaguesTable)
    .where(
      and(
        or(eq(colleaguesTable.userAId, me), eq(colleaguesTable.userBId, me)),
        eq(colleaguesTable.status, "pending"),
      ),
    );
  const otherIds = rows.map(r => (r.userAId === me ? r.userBId : r.userAId));
  const users = otherIds.length
    ? await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email, username: usersTable.username, profileImageUrl: usersTable.profileImageUrl })
        .from(usersTable)
        .where(sql`${usersTable.id} = ANY(${otherIds})`)
    : [];
  const userMap = new Map(users.map(u => [u.id, u]));
  type ReqEntry = { userId: string; name: string; email: string | null; username: string | null; profileImageUrl: string | null; createdAt: Date };
  const incoming: ReqEntry[] = [];
  const outgoing: ReqEntry[] = [];
  for (const r of rows) {
    const otherId = r.userAId === me ? r.userBId : r.userAId;
    const u = userMap.get(otherId);
    const name = u ? ([u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || u.id) : otherId;
    const entry: ReqEntry = { userId: otherId, name, email: u?.email ?? null, username: u?.username ?? null, profileImageUrl: u?.profileImageUrl ?? null, createdAt: r.createdAt };
    if (r.requesterId === me) outgoing.push(entry); else incoming.push(entry);
  }
  res.json({ incoming, outgoing });
});

// GET /colleagues/contacts — coworkers (same org) + accepted colleagues, deduped.
// Used by share dialogs across the app.
router.get("/colleagues/contacts", requireAuth, async (req, res) => {
  const me = uid(req);
  const orgId = await getOrgId(me);

  const coworkers = orgId
    ? await db
        .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email, profileImageUrl: usersTable.profileImageUrl, username: usersTable.username })
        .from(orgMembersTable)
        .innerJoin(usersTable, eq(orgMembersTable.userId, usersTable.id))
        .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.status, "active"), ne(orgMembersTable.userId, me)))
    : [];

  const colleagueRows = await db
    .select()
    .from(colleaguesTable)
    .where(
      and(
        or(eq(colleaguesTable.userAId, me), eq(colleaguesTable.userBId, me)),
        eq(colleaguesTable.status, "accepted"),
      ),
    );
  const colleagueIds = colleagueRows.map(r => (r.userAId === me ? r.userBId : r.userAId));
  const colleagues = colleagueIds.length
    ? await db
        .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email, profileImageUrl: usersTable.profileImageUrl, username: usersTable.username })
        .from(usersTable)
        .where(sql`${usersTable.id} = ANY(${colleagueIds})`)
    : [];

  const seen = new Set<string>();
  const out: Array<{ userId: string; name: string; email: string | null; username: string | null; profileImageUrl: string | null; relation: "coworker" | "colleague" }> = [];
  for (const u of coworkers) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    out.push({
      userId: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || u.id,
      email: u.email,
      username: u.username,
      profileImageUrl: u.profileImageUrl,
      relation: "coworker",
    });
  }
  for (const u of colleagues) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    out.push({
      userId: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || u.id,
      email: u.email,
      username: u.username,
      profileImageUrl: u.profileImageUrl,
      relation: "colleague",
    });
  }

  // Attach presence. lastSeenAt is written by the org heartbeat, so use each
  // contact's most recent heartbeat across any org they belong to.
  const PRESENCE_WINDOW_MS = 90 * 1000;
  const ids = out.map(o => o.userId);
  const presenceRows = ids.length
    ? await db
        .select({
          userId: orgMembersTable.userId,
          lastSeenAt: sql<Date | null>`max(${orgMembersTable.lastSeenAt})`,
        })
        .from(orgMembersTable)
        .where(sql`${orgMembersTable.userId} = ANY(${ids})`)
        .groupBy(orgMembersTable.userId)
    : [];
  const seenMap = new Map(presenceRows.map(r => [r.userId, r.lastSeenAt]));
  const now = Date.now();
  const withPresence = out.map(o => {
    const lastSeenAt = seenMap.get(o.userId) ?? null;
    return {
      ...o,
      lastSeenAt: lastSeenAt ? new Date(lastSeenAt).toISOString() : null,
      online: !!lastSeenAt && now - new Date(lastSeenAt).getTime() < PRESENCE_WINDOW_MS,
    };
  });

  res.json({ contacts: withPresence });
});

// POST /colleagues/request  body: { email?, username?, handle? }
// Accepts an @username (with or without the leading @) OR an email. Creates a
// pending request. Coworkers (same org) are auto-related and don't need a
// request — we surface a friendly error in that case.
router.post("/colleagues/request", requireAuth, async (req, res) => {
  const me = uid(req);
  const rawHandle = String(req.body?.username ?? req.body?.handle ?? "").trim();
  const rawEmail = String(req.body?.email ?? "").trim();
  // A value typed into a single field that starts with "@" or has no "@" at all
  // is treated as a handle; otherwise as an email.
  const looksLikeHandle = rawHandle.length > 0 || (rawEmail.startsWith("@"));
  const handle = looksLikeHandle ? normalizeUsername(rawHandle || rawEmail) : "";
  const email = !looksLikeHandle ? rawEmail.toLowerCase() : "";

  if (!handle && !email) { res.status(400).json({ error: "Enter an @username or email" }); return; }

  let target: { id: string } | null = null;
  if (handle) {
    target = await resolveUserByUsername(handle);
    if (!target) { res.status(404).json({ error: `No Salaryman user with the handle @${handle}` }); return; }
  } else {
    const [byEmail] = await db.select({ id: usersTable.id }).from(usersTable).where(sql`lower(${usersTable.email}) = ${email}`).limit(1);
    if (!byEmail) { res.status(404).json({ error: "No Salaryman user with that email" }); return; }
    target = byEmail;
  }
  if (target.id === me) { res.status(400).json({ error: "You can't add yourself" }); return; }

  // If they're already coworkers, no row needed.
  const myOrg = await getOrgId(me);
  if (myOrg) {
    const sameOrg = await db
      .select()
      .from(orgMembersTable)
      .where(and(eq(orgMembersTable.userId, target.id), eq(orgMembersTable.orgId, myOrg), eq(orgMembersTable.status, "active")))
      .limit(1);
    if (sameOrg.length > 0) { res.status(400).json({ error: "You're already coworkers — sharing works automatically" }); return; }
  }

  const { userAId, userBId } = canonicalPair(me, target.id);
  const existing = await db
    .select()
    .from(colleaguesTable)
    .where(and(eq(colleaguesTable.userAId, userAId), eq(colleaguesTable.userBId, userBId)))
    .limit(1);
  if (existing[0]) {
    if (existing[0].status === "accepted") { res.status(400).json({ error: "Already colleagues" }); return; }
    if (existing[0].status === "blocked") { res.status(403).json({ error: "Cannot send request" }); return; }
    if (existing[0].status === "pending") {
      // If the OTHER party already requested us, treat this as acceptance.
      if (existing[0].requesterId !== me) {
        await db.update(colleaguesTable)
          .set({ status: "accepted", respondedAt: new Date() })
          .where(and(eq(colleaguesTable.userAId, userAId), eq(colleaguesTable.userBId, userBId)));
        res.json({ ok: true, status: "accepted" });
        return;
      }
      res.status(400).json({ error: "Request already pending" });
      return;
    }
  }

  // Race-safe: another concurrent request may have inserted a row between
  // our check and this insert. ON CONFLICT DO NOTHING converts the duplicate
  // into a no-op; we then re-read to surface the right status.
  await db.insert(colleaguesTable)
    .values({ userAId, userBId, requesterId: me, status: "pending" })
    .onConflictDoNothing();
  const [after] = await db.select().from(colleaguesTable)
    .where(and(eq(colleaguesTable.userAId, userAId), eq(colleaguesTable.userBId, userBId)))
    .limit(1);
  if (after && after.status === "pending" && after.requesterId !== me) {
    // The other party beat us to it — treat as mutual accept.
    await db.update(colleaguesTable)
      .set({ status: "accepted", respondedAt: new Date() })
      .where(and(eq(colleaguesTable.userAId, userAId), eq(colleaguesTable.userBId, userBId)));
    res.json({ ok: true, status: "accepted" });
    return;
  }
  try {
    const [meUser] = await db.select({ firstName: usersTable.firstName, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, me)).limit(1);
    const myName = meUser?.firstName ?? meUser?.email?.split('@')[0] ?? "Someone";
    await db.insert(notificationsTable).values({
      userId: target.id,
      type: "colleague_request",
      title: `${myName} wants to add you as an associate`,
      body: "Open PAYPHONE to accept or decline.",
      link: "/comms",
    });
  } catch { /* non-fatal */ }
  res.json({ ok: true, status: "pending" });
});

// POST /colleagues/:userId/accept
router.post("/colleagues/:userId/accept", requireAuth, async (req, res) => {
  const me = uid(req);
  const other = String(req.params.userId);
  const { userAId, userBId } = canonicalPair(me, other);
  const [row] = await db.select().from(colleaguesTable)
    .where(and(eq(colleaguesTable.userAId, userAId), eq(colleaguesTable.userBId, userBId)))
    .limit(1);
  if (!row) { res.status(404).json({ error: "No request" }); return; }
  if (row.status !== "pending") { res.status(400).json({ error: `Already ${row.status}` }); return; }
  if (row.requesterId === me) { res.status(400).json({ error: "Can't accept your own request" }); return; }
  await db.update(colleaguesTable)
    .set({ status: "accepted", respondedAt: new Date() })
    .where(and(eq(colleaguesTable.userAId, userAId), eq(colleaguesTable.userBId, userBId)));
  res.json({ ok: true });
});

// POST /colleagues/:userId/decline — also removes the row
router.post("/colleagues/:userId/decline", requireAuth, async (req, res) => {
  const me = uid(req);
  const other = String(req.params.userId);
  const { userAId, userBId } = canonicalPair(me, other);
  await db.delete(colleaguesTable)
    .where(and(eq(colleaguesTable.userAId, userAId), eq(colleaguesTable.userBId, userBId), eq(colleaguesTable.status, "pending")));
  res.json({ ok: true });
});

// DELETE /colleagues/:userId — remove an accepted relationship.
// Explicitly excludes 'blocked' rows: a blocked party cannot delete the block
// to bypass it. To unblock, the blocker must take an explicit unblock action
// (not implemented yet) or remove the row themselves via a future endpoint.
router.delete("/colleagues/:userId", requireAuth, async (req, res) => {
  const me = uid(req);
  const other = String(req.params.userId);
  const { userAId, userBId } = canonicalPair(me, other);
  const result = await db.delete(colleaguesTable)
    .where(and(
      eq(colleaguesTable.userAId, userAId),
      eq(colleaguesTable.userBId, userBId),
      eq(colleaguesTable.status, "accepted"),
    ))
    .returning({ userAId: colleaguesTable.userAId });
  if (result.length === 0) {
    res.status(404).json({ error: "No accepted colleague to remove" });
    return;
  }
  res.json({ ok: true });
});

export default router;
