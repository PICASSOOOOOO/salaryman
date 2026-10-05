import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, desc, and, or, sql } from "drizzle-orm";
import {
  db,
  callHistoryTable,
  sharedMediaTable,
  screenSessionsTable,
  orgMembersTable,
  organizationsTable,
  usersTable,
  notificationsTable,
  colleaguesTable,
  canonicalPair,
  filesFoldersTable,
} from "@workspace/db";
import { hasFeature } from "../lib/plan";
import { requireFeature } from "../middlewares/requirePro";
import { ObjectStorageService } from "../lib/objectStorage";
import { getCallRecordingAccess } from "../lib/phone-recording-access";
import { canDoInOrg } from "../lib/org-permissions";

const router = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  next();
}

function getAuthUserId(req: Request): string {
  const user = (req as Request & { user?: { id?: string } }).user;
  return user?.id ?? "";
}

async function getUserOrgId(userId: string): Promise<number | null> {
  if (!userId) return null;
  try {
    const rows = await db
      .select({ orgId: orgMembersTable.orgId })
      .from(orgMembersTable)
      .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
      .limit(1);
    return rows[0]?.orgId ?? null;
  } catch { return null; }
}

async function requireOrgAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const userId = getAuthUserId(req);
  const orgId = await getUserOrgId(userId);
  if (!orgId) {
    res.status(403).json({ error: "No organization membership" });
    return;
  }
  const membership = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.status, "active")))
    .limit(1);
  const role = membership[0]?.role;
  if (role !== "owner" && role !== "admin" && role !== "ceo" && role !== "executive" && role !== "director" && role !== "manager") {
    res.status(403).json({ error: "Manager+ access required" });
    return;
  }
  (req as any)._orgId = orgId;
  (req as any)._orgRole = role;
  next();
}

router.get("/media/recording/download/:callId", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const callId = Number(req.params.callId);
    const format = (req.query.format as string) || "mp3";

    if (!["mp3", "wav", "ogg"].includes(format)) {
      res.status(400).json({ error: "Supported formats: mp3, wav, ogg" });
      return;
    }

    if (!Number.isInteger(callId) || callId <= 0) {
      res.status(400).json({ error: "Invalid callId" });
      return;
    }
    const { call, allowed } = await getCallRecordingAccess(userId, callId);
    if (!call) {
      res.status(404).json({ error: "Call not found" });
      return;
    }
    if (!allowed) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (!call.recordingUrl) {
      res.status(404).json({ error: "No recording available for this call" });
      return;
    }

    const filename = `call-${callId}-${call.direction}-${new Date(call.startedAt).toISOString().slice(0, 10)}.${format}`;
    if (call.recordingUrl.startsWith("/objects/")) {
      if (format !== "mp3") {
        res.status(400).json({ error: "Archived recordings are available as MP3" });
        return;
      }
      const file = await new ObjectStorageService().getObjectEntityFile(call.recordingUrl);
      const [bytes] = await file.download();
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", bytes.length);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.send(bytes);
      return;
    }

    let downloadUrl = call.recordingUrl;
    if (downloadUrl.endsWith(".mp3")) {
      downloadUrl = downloadUrl.replace(/\.mp3$/, "");
    }

    const formatExtMap: Record<string, string> = {
      mp3: ".mp3",
      wav: ".wav",
      ogg: ".ogg",
    };
    downloadUrl += formatExtMap[format];

    const mimeMap: Record<string, string> = {
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
    };

    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const response = await fetch(downloadUrl, accountSid && authToken ? {
        headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` },
      } : undefined);
      if (!response.ok) {
        res.status(502).json({ error: "Failed to fetch recording from provider" });
        return;
      }

      res.setHeader("Content-Type", mimeMap[format]);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      if (response.headers.get("content-length")) {
        res.setHeader("Content-Length", response.headers.get("content-length")!);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        res.status(502).json({ error: "No response body" });
        return;
      }

      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      };
      await pump();
    } catch {
      res.status(502).json({ error: "Failed to proxy recording" });
    }
  } catch (err: unknown) {
    console.error("[Media] recording download error:", err instanceof Error ? err.message : "Unknown");
    res.status(500).json({ error: "Download failed" });
  }
});

router.get("/media/recording/info/:callId", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const callId = Number(req.params.callId);

    if (!Number.isInteger(callId) || callId <= 0) { res.status(400).json({ error: "Invalid callId" }); return; }
    const { call, allowed } = await getCallRecordingAccess(userId, callId);
    if (!call) { res.status(404).json({ error: "Call not found" }); return; }
    if (!allowed) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const baseUrl = call.recordingUrl?.replace(/\.(mp3|wav|ogg)$/, "") ?? null;

    res.json({
      callId: call.id,
      hasRecording: !!call.recordingUrl,
      callerName: call.callerName,
      recipientNumber: call.recipientNumber,
      direction: call.direction,
      durationSeconds: call.durationSeconds,
      startedAt: call.startedAt,
      formats: call.recordingUrl ? [
        { format: "mp3", mimeType: "audio/mpeg", url: baseUrl + ".mp3" },
        { format: "wav", mimeType: "audio/wav", url: baseUrl + ".wav" },
        { format: "ogg", mimeType: "audio/ogg", url: baseUrl + ".ogg" },
      ] : [],
      transcript: call.transcript,
      summary: call.summary,
    });
  } catch (err: unknown) {
    console.error("[Media] recording info error:", err instanceof Error ? err.message : "Unknown");
    res.status(500).json({ error: "Failed to get recording info" });
  }
});

router.post("/media/share", requireAuth, async (req, res) => {
  try {
    const fromUserId = getAuthUserId(req);
    const { toUserId, mediaType, title, description, sourceUrl, objectPath, fileSizeBytes, mimeType, callHistoryId } = req.body;
    const hasCallHistoryId = callHistoryId !== undefined && callHistoryId !== null;

    if (!toUserId || !mediaType || !title) {
      res.status(400).json({ error: "toUserId, mediaType, and title are required" });
      return;
    }

    const validTypes = ["recording", "screenshot", "image", "video", "screen_recording", "document"];
    if (!validTypes.includes(mediaType)) {
      res.status(400).json({ error: `Invalid mediaType. Valid: ${validTypes.join(", ")}` });
      return;
    }

    let orgId = await getUserOrgId(fromUserId);
    let sharedCallId: number | undefined;
    if (hasCallHistoryId) {
      const numericCallHistoryId = Number(callHistoryId);
      if (mediaType !== "recording" || !Number.isInteger(numericCallHistoryId) || numericCallHistoryId <= 0) {
        res.status(400).json({ error: "A valid call recording is required" });
        return;
      }
      const [call] = await db.select().from(callHistoryTable)
        .where(eq(callHistoryTable.id, numericCallHistoryId))
        .limit(1);
      const canShare = call && (
        call.userId === fromUserId
        || (call.orgId != null && (await canDoInOrg(fromUserId, call.orgId, "phone.supervise")).allowed)
      );
      if (!call || !call.recordingUrl || !canShare) {
        res.status(403).json({ error: "You can only share a recording you own or supervise" });
        return;
      }
      sharedCallId = call.id;
      if (call.orgId != null) orgId = call.orgId;
    }

    // Recipient must be either (a) a coworker in the same org, or
    // (b) an accepted colleague (cross-org friend). Coworker is checked
    // first because it's the stronger relationship.
    let isCoworker = false;
    if (orgId) {
      const recipientMembership = await db
        .select()
        .from(orgMembersTable)
        .where(and(eq(orgMembersTable.userId, toUserId), eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.status, "active")))
        .limit(1);
      isCoworker = recipientMembership.length > 0;
    }
    if (!isCoworker) {
      const { userAId, userBId } = canonicalPair(fromUserId, toUserId);
      const colleague = await db
        .select()
        .from(colleaguesTable)
        .where(and(
          eq(colleaguesTable.userAId, userAId),
          eq(colleaguesTable.userBId, userBId),
          eq(colleaguesTable.status, "accepted"),
        ))
        .limit(1);
      if (colleague.length === 0) {
        res.status(403).json({ error: "Recipient must be a coworker or accepted colleague" });
        return;
      }
    }

    // Verify ownership of arbitrary objectPath against MediaLibrary registry,
    // unless this share is bound to a callHistoryId (already verified above).
    if (objectPath && !hasCallHistoryId) {
      const owned = await db
        .select({ id: filesFoldersTable.id })
        .from(filesFoldersTable)
        .where(and(eq(filesFoldersTable.userId, fromUserId), eq(filesFoldersTable.objectPath, String(objectPath))))
        .limit(1);
      if (owned.length === 0) {
        res.status(403).json({ error: "You don't own that file" });
        return;
      }
    }

    const [shared] = await db
      .insert(sharedMediaTable)
      .values({
        fromUserId,
        toUserId,
        orgId: orgId ?? undefined,
        mediaType,
        title: title.slice(0, 256),
        description: description?.slice(0, 2000) ?? undefined,
        sourceUrl: sourceUrl?.slice(0, 1024) ?? undefined,
        objectPath: objectPath?.slice(0, 512) ?? undefined,
        fileSizeBytes: fileSizeBytes ? Number(fileSizeBytes) : undefined,
        mimeType: mimeType?.slice(0, 128) ?? undefined,
        callHistoryId: sharedCallId,
      })
      .returning();

    try {
      const [sender] = await db.select({ firstName: usersTable.firstName, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, fromUserId)).limit(1);
      const senderName = sender?.firstName ?? sender?.email?.split('@')[0] ?? "Someone";
      await db.insert(notificationsTable).values({
        userId: toUserId,
        type: "media_shared",
        title: `${senderName} shared ${mediaType} with you`,
        body: title.slice(0, 200),
        link: `/tools/media-center`,
      });
    } catch (nErr) {
      console.error("[Media] notification error:", nErr);
    }

    res.json({ ok: true, id: shared.id });
  } catch (err: unknown) {
    console.error("[Media] share error:", err instanceof Error ? err.message : "Unknown");
    res.status(500).json({ error: "Failed to share media" });
  }
});

router.get("/media/inbox", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const items = await db
      .select()
      .from(sharedMediaTable)
      .where(eq(sharedMediaTable.toUserId, userId))
      .orderBy(desc(sharedMediaTable.createdAt))
      .limit(limit)
      .offset(offset);

    const unreadCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sharedMediaTable)
      .where(and(eq(sharedMediaTable.toUserId, userId), eq(sharedMediaTable.isRead, false)));

    const senderIds = [...new Set(items.map((i) => i.fromUserId))];
    let senderMap: Record<string, string> = {};
    if (senderIds.length > 0) {
      const users = await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName }).from(usersTable).where(sql`${usersTable.id} = ANY(${senderIds})`);
      for (const u of users) {
        senderMap[u.id] = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.id;
      }
    }

    res.json({
      items: items.map((i) => ({ ...i, fromUserName: senderMap[i.fromUserId] || i.fromUserId })),
      unread: unreadCount[0]?.count ?? 0,
    });
  } catch (err: unknown) {
    console.error("[Media] inbox error:", err instanceof Error ? err.message : "Unknown");
    res.status(500).json({ error: "Failed to fetch inbox" });
  }
});

router.get("/media/sent", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const items = await db
      .select()
      .from(sharedMediaTable)
      .where(eq(sharedMediaTable.fromUserId, userId))
      .orderBy(desc(sharedMediaTable.createdAt))
      .limit(limit);

    res.json({ items });
  } catch (err: unknown) {
    console.error("[Media] sent error:", err instanceof Error ? err.message : "Unknown");
    res.status(500).json({ error: "Failed to fetch sent media" });
  }
});

router.post("/media/inbox/:id/read", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const id = Number(req.params.id);
    await db.update(sharedMediaTable).set({ isRead: true }).where(and(eq(sharedMediaTable.id, id), eq(sharedMediaTable.toUserId, userId)));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

router.post("/media/screen-session/start", requireAuth, requireFeature("screen_scan"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const orgId = await getUserOrgId(userId);
    if (!orgId) {
      res.status(403).json({ error: "Organization membership required" });
      return;
    }

    const existing = await db
      .select()
      .from(screenSessionsTable)
      .where(and(eq(screenSessionsTable.userId, userId), eq(screenSessionsTable.status, "active")))
      .limit(1);
    if (existing.length > 0) {
      res.json({ ok: true, sessionId: existing[0].id, alreadyActive: true });
      return;
    }

    const [session] = await db
      .insert(screenSessionsTable)
      .values({ userId, orgId })
      .returning();

    res.json({ ok: true, sessionId: session.id });
  } catch (err: unknown) {
    console.error("[Media] screen session start error:", err instanceof Error ? err.message : "Unknown");
    res.status(500).json({ error: "Failed to start screen session" });
  }
});

router.post("/media/screen-session/:id/stop", requireAuth, requireFeature("screen_scan"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const id = Number(req.params.id);
    const { recordingUrl, durationSeconds } = req.body;

    const rows = await db.select().from(screenSessionsTable).where(eq(screenSessionsTable.id, id)).limit(1);
    if (!rows[0] || rows[0].userId !== userId) {
      res.status(403).json({ error: "Not your session" });
      return;
    }

    await db.update(screenSessionsTable).set({
      status: "completed",
      endedAt: new Date(),
      recordingUrl: recordingUrl?.slice(0, 1024) ?? undefined,
      durationSeconds: durationSeconds ? Number(durationSeconds) : undefined,
    }).where(eq(screenSessionsTable.id, id));

    res.json({ ok: true });
  } catch (err: unknown) {
    console.error("[Media] screen session stop error:", err instanceof Error ? err.message : "Unknown");
    res.status(500).json({ error: "Failed to stop session" });
  }
});

router.post("/media/screen-session/:id/screenshot", requireAuth, requireFeature("screen_scan"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const id = Number(req.params.id);
    const { screenshotUrl } = req.body;

    const rows = await db.select().from(screenSessionsTable).where(eq(screenSessionsTable.id, id)).limit(1);
    if (!rows[0] || rows[0].userId !== userId) {
      res.status(403).json({ error: "Not your session" });
      return;
    }

    await db.update(screenSessionsTable).set({
      lastScreenshotAt: new Date(),
      lastScreenshotUrl: screenshotUrl?.slice(0, 1024),
      screenshotCount: sql`${screenSessionsTable.screenshotCount} + 1`,
    }).where(eq(screenSessionsTable.id, id));

    res.json({ ok: true });
  } catch (err: unknown) {
    console.error("[Media] screenshot upload error:", err instanceof Error ? err.message : "Unknown");
    res.status(500).json({ error: "Failed to save screenshot" });
  }
});

router.get("/media/screen-session/my", requireAuth, requireFeature("screen_scan"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const sessions = await db
      .select()
      .from(screenSessionsTable)
      .where(eq(screenSessionsTable.userId, userId))
      .orderBy(desc(screenSessionsTable.startedAt))
      .limit(50);
    res.json({ sessions });
  } catch {
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

router.get("/media/screen-monitoring", requireAuth, requireFeature("screen_scan"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const orgId = await getUserOrgId(userId);
    if (!orgId) {
      res.status(403).json({ error: "Organization membership required" });
      return;
    }

    const membership = await db
      .select()
      .from(orgMembersTable)
      .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.status, "active")))
      .limit(1);
    const role = membership[0]?.role;
    if (role !== "owner" && role !== "admin" && role !== "ceo" && role !== "executive" && role !== "director" && role !== "manager") {
      res.status(403).json({ error: "Manager+ access required for screen monitoring" });
      return;
    }

    const activeSessions = await db
      .select()
      .from(screenSessionsTable)
      .where(and(eq(screenSessionsTable.orgId, orgId), eq(screenSessionsTable.status, "active")))
      .orderBy(desc(screenSessionsTable.startedAt));

    const recentSessions = await db
      .select()
      .from(screenSessionsTable)
      .where(eq(screenSessionsTable.orgId, orgId))
      .orderBy(desc(screenSessionsTable.startedAt))
      .limit(100);

    const userIds = [...new Set([...activeSessions, ...recentSessions].map((s) => s.userId))];
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const users = await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName }).from(usersTable).where(sql`${usersTable.id} = ANY(${userIds})`);
      for (const u of users) {
        userMap[u.id] = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.id;
      }
    }

    res.json({
      activeSessions: activeSessions.map((s) => ({ ...s, userName: userMap[s.userId] || s.userId })),
      recentSessions: recentSessions.map((s) => ({ ...s, userName: userMap[s.userId] || s.userId })),
      orgId,
    });
  } catch (err: unknown) {
    console.error("[Media] screen monitoring error:", err instanceof Error ? err.message : "Unknown");
    res.status(500).json({ error: "Failed to fetch monitoring data" });
  }
});

router.get("/media/org-members", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const requestedOrgId = req.query.orgId;
    let orgId: number | null = await getUserOrgId(userId);
    if (requestedOrgId != null) {
      const parsedOrgId = Number(requestedOrgId);
      if (typeof requestedOrgId !== "string" || !Number.isInteger(parsedOrgId) || parsedOrgId <= 0) {
        res.status(400).json({ error: "Invalid orgId" });
        return;
      }
      const [membership] = await db.select({ orgId: orgMembersTable.orgId })
        .from(orgMembersTable)
        .where(and(
          eq(orgMembersTable.userId, userId),
          eq(orgMembersTable.orgId, parsedOrgId),
          eq(orgMembersTable.status, "active"),
        )).limit(1);
      const [ownedOrg] = await db.select({ id: organizationsTable.id })
        .from(organizationsTable)
        .where(and(eq(organizationsTable.id, parsedOrgId), eq(organizationsTable.ownerUserId, userId)))
        .limit(1);
      if (!membership && !ownedOrg) {
        res.status(403).json({ error: "No organization membership" });
        return;
      }
      orgId = parsedOrgId;
    }
    if (!orgId) {
      res.status(403).json({ error: "No organization" });
      return;
    }

    const members = await db
      .select({ member: orgMembersTable, user: usersTable })
      .from(orgMembersTable)
      .leftJoin(usersTable, eq(orgMembersTable.userId, usersTable.id))
      .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.status, "active")));

    res.json({
      members: members
        .filter((m) => m.member.userId !== userId)
        .map((m) => ({
          userId: m.member.userId,
          name: [m.user?.firstName, m.user?.lastName].filter(Boolean).join(" ") || m.member.userId,
          role: m.member.role,
        })),
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch members" });
  }
});

export default router;
