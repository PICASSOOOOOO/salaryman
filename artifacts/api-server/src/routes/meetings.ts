import { Router, type IRouter } from "express";
import { db, meetingsTable } from "@workspace/db";
import { eq, and, gt, desc } from "drizzle-orm";
import { getUncachableResendClient } from "../lib/resend";
import { createHmac, timingSafeEqual } from "crypto";

const GUEST_TOKEN_SECRET = process.env.GUEST_TOKEN_SECRET ?? "salaryman-meet-secret-changeme";
const GUEST_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

function signGuestToken(roomCode: string, expires: number): string {
  const payload = `${roomCode}.${expires}`;
  const sig = createHmac("sha256", GUEST_TOKEN_SECRET).update(payload).digest("base64url");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyGuestToken(token: string): { roomCode: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(".");
    if (parts.length < 3) return null;
    const sig = parts[parts.length - 1];
    const roomCode = parts[0];
    const expires = Number(parts[1]);
    if (isNaN(expires) || Date.now() > expires) return null;
    const payload = `${roomCode}.${expires}`;
    const expectedSig = createHmac("sha256", GUEST_TOKEN_SECRET).update(payload).digest("base64url");
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null;
    return { roomCode };
  } catch {
    return null;
  }
}

const router: IRouter = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

function makeRoomCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

router.post("/meetings", async (req, res) => {
  if (!requireAuth(req, res)) return;

  const { title, appointmentId } = req.body as { title: string; appointmentId?: number };
  if (!title?.trim()) {
    res.status(400).json({ error: "Title is required" });
    return;
  }

  const roomCode = makeRoomCode();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    const [meeting] = await db
      .insert(meetingsTable)
      .values({
        roomCode,
        title: title.trim(),
        hostUserId: req.user!.id,
        hostName: (req.user as any).name ?? (req.user as any).username ?? "Host",
        expiresAt,
        appointmentId: appointmentId ?? null,
      })
      .returning();

    res.status(201).json({ meeting });
  } catch (err) {
    console.error("meetings POST error:", err);
    res.status(500).json({ error: "Failed to create meeting" });
  }
});

router.get("/meetings", async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    const rows = await db
      .select()
      .from(meetingsTable)
      .where(
        and(
          eq(meetingsTable.hostUserId, req.user!.id),
          gt(meetingsTable.expiresAt, new Date())
        )
      )
      .orderBy(desc(meetingsTable.createdAt));

    res.json({ meetings: rows });
  } catch (err) {
    console.error("meetings GET error:", err);
    res.status(500).json({ error: "Failed to fetch meetings" });
  }
});

router.get("/meetings/by-code/:code", async (req, res) => {
  const { code } = req.params;

  try {
    const [meeting] = await db
      .select()
      .from(meetingsTable)
      .where(
        and(
          eq(meetingsTable.roomCode, code),
          gt(meetingsTable.expiresAt, new Date())
        )
      );

    if (!meeting) {
      res.status(404).json({ error: "Meeting not found or expired" });
      return;
    }

    res.json({ meeting: { ...meeting, hostUserId: undefined } });
  } catch (err) {
    console.error("meetings by-code GET error:", err);
    res.status(500).json({ error: "Failed to fetch meeting" });
  }
});

router.post("/meetings/:code/guest-token", async (req, res) => {
  const { code } = req.params;
  if (!code) {
    res.status(400).json({ error: "Room code required" });
    return;
  }

  try {
    const [meeting] = await db
      .select({ id: meetingsTable.id, roomCode: meetingsTable.roomCode, title: meetingsTable.title, hostName: meetingsTable.hostName, expiresAt: meetingsTable.expiresAt })
      .from(meetingsTable)
      .where(
        and(
          eq(meetingsTable.roomCode, code),
          gt(meetingsTable.expiresAt, new Date())
        )
      );

    if (!meeting) {
      res.status(404).json({ error: "Meeting not found or expired" });
      return;
    }

    const expires = Date.now() + GUEST_TOKEN_TTL_MS;
    const token = signGuestToken(code, expires);

    res.json({
      token,
      expiresAt: new Date(expires).toISOString(),
      meeting: {
        title: meeting.title,
        hostName: meeting.hostName,
        roomCode: meeting.roomCode,
        meetingExpiresAt: meeting.expiresAt,
      },
    });
  } catch (err) {
    console.error("meetings guest-token error:", err);
    res.status(500).json({ error: "Failed to issue guest token" });
  }
});

router.post("/meetings/:code/invite", async (req, res) => {
  if (!requireAuth(req, res)) return;

  const { code } = req.params;
  const { emails, dateTime } = req.body as { emails: string[]; dateTime?: string };

  if (!emails?.length) {
    res.status(400).json({ error: "At least one email required" });
    return;
  }

  try {
    const [meeting] = await db
      .select()
      .from(meetingsTable)
      .where(
        and(
          eq(meetingsTable.roomCode, code),
          eq(meetingsTable.hostUserId, req.user!.id),
          gt(meetingsTable.expiresAt, new Date())
        )
      );

    if (!meeting) {
      res.status(404).json({ error: "Meeting not found" });
      return;
    }

    const baseUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "https://salaryman.replit.app";
    const meetUrl = `${baseUrl}/meet/${code}`;

    const dateStr = dateTime
      ? new Date(dateTime).toLocaleString("en-US", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
          hour: "numeric", minute: "2-digit", timeZoneName: "short",
        })
      : "Link is active for 7 days";

    const html = `
<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: 'Courier New', monospace; background: #030803; color: #00ff41; margin: 0; padding: 24px; }
.container { max-width: 560px; margin: 0 auto; border: 1px solid rgba(0,255,65,0.4); padding: 32px; background: #030803; }
h1 { color: #00ff41; font-size: 1.1rem; letter-spacing: 0.15em; text-transform: uppercase; border-bottom: 1px solid rgba(0,255,65,0.25); padding-bottom: 12px; }
.field { margin: 12px 0; }
.label { color: rgba(0,255,65,0.5); font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; }
.value { color: #00ff41; font-size: 0.95rem; margin-top: 2px; }
.btn { display: inline-block; margin-top: 24px; padding: 14px 28px; background: rgba(0,255,65,0.12); border: 1px solid rgba(0,255,65,0.5); color: #00ff41; text-decoration: none; font-family: 'Courier New', monospace; font-size: 0.85rem; letter-spacing: 0.12em; text-transform: uppercase; }
.footer { margin-top: 28px; color: rgba(0,255,65,0.35); font-size: 0.7rem; border-top: 1px solid rgba(0,255,65,0.15); padding-top: 12px; }
.hologram { color: rgba(0,200,255,0.7); font-size: 0.65rem; letter-spacing: 0.08em; margin-top: 6px; }
</style>
</head>
<body>
<div class="container">
<h1>[ HOLOGRAM LINK INCOMING ]</h1>
<div class="hologram">▓ SALARYMAN REMOTE SIGNAL — SECURE MEETING INVITE ▓</div>
<div class="field"><div class="label">Meeting</div><div class="value">${meeting.title}</div></div>
<div class="field"><div class="label">Host</div><div class="value">${meeting.hostName}</div></div>
<div class="field"><div class="label">When</div><div class="value">${dateStr}</div></div>
<div class="field"><div class="label">Link</div><div class="value">${meetUrl}</div></div>
<a href="${meetUrl}" class="btn">▶ JOIN MEETING</a>
<div class="footer">No login required · Guest access only · Link expires in 7 days · Sent via SALARYMAN</div>
</div>
</body>
</html>`;

    const { client, fromEmail } = await getUncachableResendClient();
    const results = await Promise.allSettled(
      emails.map(email =>
        client.emails.send({
          from: fromEmail,
          to: [email.trim()],
          subject: `[INVITE] ${meeting.title} — Join via Hologram Link`,
          html,
        })
      )
    );

    const failed = results.filter(r => r.status === "rejected" || (r.status === "fulfilled" && r.value.error));
    if (failed.length === emails.length) {
      res.status(500).json({ error: "All invites failed to send" });
      return;
    }

    res.json({ ok: true, sent: emails.length - failed.length, failed: failed.length });
  } catch (err) {
    console.error("meetings invite error:", err);
    res.status(500).json({ error: "Failed to send invites" });
  }
});

export default router;
