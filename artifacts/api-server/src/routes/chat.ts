import { Router, type Request, type Response } from "express";
import {
  db,
  chatChannelsTable,
  chatMessagesTable,
  chatReadCursorsTable,
  orgMembersTable,
  organizationsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, or, desc, asc, sql, lt, inArray } from "drizzle-orm";

const router = Router();

function requireAuth(req: Request, res: Response): req is Request & { user: Express.User } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

async function getCallerOrgMembership(userId: string) {
  const rows = await db
    .select({ member: orgMembersTable, org: organizationsTable })
    .from(orgMembersTable)
    .innerJoin(organizationsTable, eq(orgMembersTable.orgId, organizationsTable.id))
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")));
  return rows[0] ?? null;
}

async function ensureGlobalChannel(): Promise<number> {
  const existing = await db
    .select()
    .from(chatChannelsTable)
    .where(eq(chatChannelsTable.type, "global"))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [ch] = await db
    .insert(chatChannelsTable)
    .values({ type: "global", name: "Global" })
    .returning();
  return ch.id;
}

async function ensureCompanyChannel(orgId: number, orgName: string): Promise<number> {
  const existing = await db
    .select()
    .from(chatChannelsTable)
    .where(and(eq(chatChannelsTable.type, "company"), eq(chatChannelsTable.orgId, orgId)))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [ch] = await db
    .insert(chatChannelsTable)
    .values({ type: "company", name: orgName, orgId })
    .returning();
  return ch.id;
}

router.get("/chat/channels", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;

  const globalChannelId = await ensureGlobalChannel();

  const membership = await getCallerOrgMembership(userId);

  let companyChannelId: number | null = null;
  if (membership) {
    companyChannelId = await ensureCompanyChannel(membership.org.id, membership.org.name);
  }

  const privateChannels = await db
    .select({
      channel: chatChannelsTable,
      otherUser: usersTable,
    })
    .from(chatChannelsTable)
    .leftJoin(
      usersTable,
      sql`(${chatChannelsTable.user1Id} = ${usersTable.id} AND ${chatChannelsTable.user2Id} = ${userId})
       OR (${chatChannelsTable.user2Id} = ${usersTable.id} AND ${chatChannelsTable.user1Id} = ${userId})`
    )
    .where(
      and(
        eq(chatChannelsTable.type, "private"),
        or(
          eq(chatChannelsTable.user1Id, userId),
          eq(chatChannelsTable.user2Id, userId)
        )
      )
    );

  const allChannelIds = [
    globalChannelId,
    ...(companyChannelId ? [companyChannelId] : []),
    ...privateChannels.map((r) => r.channel.id),
  ];

  const cursors = allChannelIds.length > 0
    ? await db
        .select()
        .from(chatReadCursorsTable)
        .where(
          and(
            eq(chatReadCursorsTable.userId, userId),
            inArray(chatReadCursorsTable.channelId, allChannelIds)
          )
        )
    : [];

  const cursorMap = new Map(cursors.map((c) => [c.channelId, c.lastReadMessageId ?? 0]));

  const unreadCounts: Record<number, number> = {};
  for (const cid of allChannelIds) {
    const lastRead = cursorMap.get(cid) ?? 0;
    if (lastRead === 0) {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.channelId, cid));
      unreadCounts[cid] = row?.count ?? 0;
    } else {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(chatMessagesTable)
        .where(
          and(
            eq(chatMessagesTable.channelId, cid),
            sql`${chatMessagesTable.id} > ${lastRead}`
          )
        );
      unreadCounts[cid] = row?.count ?? 0;
    }
  }

  res.json({
    globalChannelId,
    companyChannelId,
    companyName: membership?.org.name ?? null,
    privateChannels: privateChannels.map((r) => ({
      channelId: r.channel.id,
      otherUser: r.otherUser
        ? {
            id: r.otherUser.id,
            firstName: r.otherUser.firstName,
            lastName: r.otherUser.lastName,
            profileImageUrl: r.otherUser.profileImageUrl,
          }
        : null,
    })),
    unreadCounts,
  });
});

router.get("/chat/channels/:channelId/messages", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const channelId = parseInt(req.params.channelId);
  if (isNaN(channelId)) {
    res.status(400).json({ error: "Invalid channel ID" });
    return;
  }

  const [channel] = await db
    .select()
    .from(chatChannelsTable)
    .where(eq(chatChannelsTable.id, channelId));

  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  if (channel.type === "private") {
    if (channel.user1Id !== userId && channel.user2Id !== userId) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }
  } else if (channel.type === "company") {
    const membership = await getCallerOrgMembership(userId);
    if (!membership || membership.org.id !== channel.orgId) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }
  }

  const before = req.query.before ? parseInt(req.query.before as string) : null;
  const limit = Math.min(parseInt((req.query.limit as string) || "50"), 100);

  const conditions = [eq(chatMessagesTable.channelId, channelId)];
  if (before) {
    conditions.push(sql`${chatMessagesTable.id} < ${before}`);
  }

  const messages = await db
    .select()
    .from(chatMessagesTable)
    .where(and(...conditions))
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(limit);

  const senderIds = [...new Set(messages.map((m) => m.senderUserId).filter(Boolean))] as string[];
  const senders =
    senderIds.length > 0
      ? await db
          .select()
          .from(usersTable)
          .where(inArray(usersTable.id, senderIds))
      : [];
  const senderMap = new Map(senders.map((u) => [u.id, u]));

  res.json({
    messages: messages
      .reverse()
      .map((m) => {
        const u = m.senderUserId ? senderMap.get(m.senderUserId) : null;
        return {
          ...m,
          senderName: u
            ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "User"
            : m.senderName ?? "System",
          senderProfileImageUrl: u?.profileImageUrl ?? null,
        };
      }),
    hasMore: messages.length === limit,
  });
});

router.post("/chat/private", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const { targetUserId } = (req.body ?? {}) as { targetUserId?: string };

  if (!targetUserId || typeof targetUserId !== "string") {
    res.status(400).json({ error: "targetUserId is required" });
    return;
  }
  if (targetUserId === userId) {
    res.status(400).json({ error: "Cannot start a conversation with yourself" });
    return;
  }

  const [u1, u2] = [userId, targetUserId].sort();

  const existing = await db
    .select()
    .from(chatChannelsTable)
    .where(
      and(
        eq(chatChannelsTable.type, "private"),
        eq(chatChannelsTable.user1Id, u1),
        eq(chatChannelsTable.user2Id, u2)
      )
    )
    .limit(1);

  if (existing[0]) {
    res.json({ channelId: existing[0].id });
    return;
  }

  const [ch] = await db
    .insert(chatChannelsTable)
    .values({ type: "private", user1Id: u1, user2Id: u2 })
    .returning();

  res.json({ channelId: ch.id });
});

router.post("/chat/channels/:channelId/read", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const channelId = parseInt(req.params.channelId);
  if (isNaN(channelId)) {
    res.status(400).json({ error: "Invalid channel ID" });
    return;
  }
  const { lastMessageId } = (req.body ?? {}) as { lastMessageId?: number };
  if (!lastMessageId || typeof lastMessageId !== "number") {
    res.status(400).json({ error: "lastMessageId required" });
    return;
  }

  const existing = await db
    .select()
    .from(chatReadCursorsTable)
    .where(
      and(
        eq(chatReadCursorsTable.channelId, channelId),
        eq(chatReadCursorsTable.userId, userId)
      )
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(chatReadCursorsTable)
      .set({ lastReadMessageId: lastMessageId })
      .where(
        and(
          eq(chatReadCursorsTable.channelId, channelId),
          eq(chatReadCursorsTable.userId, userId)
        )
      );
  } else {
    await db.insert(chatReadCursorsTable).values({
      channelId,
      userId,
      lastReadMessageId: lastMessageId,
    });
  }

  res.json({ ok: true });
});

router.get("/chat/company/members", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;

  const membership = await getCallerOrgMembership(userId);
  if (!membership) {
    res.status(403).json({ error: "Not in an organization" });
    return;
  }

  const members = await db
    .select({ member: orgMembersTable, user: usersTable })
    .from(orgMembersTable)
    .leftJoin(usersTable, eq(orgMembersTable.userId, usersTable.id))
    .where(
      and(
        eq(orgMembersTable.orgId, membership.org.id),
        eq(orgMembersTable.status, "active")
      )
    );

  res.json({
    members: members.map((r) => ({
      userId: r.member.userId,
      role: r.member.role,
      firstName: r.user?.firstName ?? null,
      lastName: r.user?.lastName ?? null,
      email: r.user?.email ?? null,
      profileImageUrl: r.user?.profileImageUrl ?? null,
    })),
  });
});

export async function postSystemMessage(channelId: number, content: string) {
  await db.insert(chatMessagesTable).values({
    channelId,
    senderUserId: null,
    senderName: "SYSTEM",
    isBot: true,
    content,
  });
}

export async function postBotMessageToCompanyChannel(orgId: number, orgName: string, content: string) {
  const channelId = await ensureCompanyChannel(orgId, orgName);
  await postSystemMessage(channelId, content);
  return channelId;
}

export default router;
