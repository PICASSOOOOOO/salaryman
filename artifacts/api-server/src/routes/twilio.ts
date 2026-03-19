import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, callHistoryTable, contactsTable } from "@workspace/db";
import twilio from "twilio";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  res.status(401).json({ error: "Login required" });
}

function getAuthUserId(req: Request): string {
  return (req as any).user?.id ?? "";
}

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured");
  }
  return twilio(accountSid, authToken);
}

function getTwilioNumber() {
  const num = process.env.TWILIO_PHONE_NUMBER;
  if (!num) throw new Error("TWILIO_PHONE_NUMBER not configured");
  return num;
}

function toE164(raw: string): string | null {
  const cleaned = raw.replace(/[^+\d]/g, "");
  if (!/^\+?\d{7,15}$/.test(cleaned)) return null;
  return cleaned.startsWith("+") ? cleaned : `+1${cleaned}`;
}

router.get("/twilio/contacts/:userId", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req) || req.params.userId;
    if (!userId) {
      res.status(400).json({ error: "userId required" });
      return;
    }

    const contacts = await db
      .select()
      .from(contactsTable)
      .where(eq(contactsTable.userId, userId))
      .orderBy(contactsTable.createdAt);

    const withPhone = contacts
      .filter((c) => c.phone && c.phone.trim() !== "")
      .map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        hometown: c.hometown,
      }));

    res.json({ contacts: withPhone, total: contacts.length });
  } catch (err: any) {
    console.error("[CalllHome] contacts error:", err.message);
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

router.post("/twilio/call", requireAuth, async (req, res) => {
  try {
    const { recipientNumber, callerName, contactName } = req.body;
    const userId = getAuthUserId(req);
    if (!recipientNumber || !userId) {
      res.status(400).json({ error: "recipientNumber required" });
      return;
    }

    const e164 = toE164(recipientNumber);
    if (!e164) {
      res.status(400).json({ error: "Invalid phone number format" });
      return;
    }

    const client = getTwilioClient();
    const fromNumber = getTwilioNumber();

    const call = await client.calls.create({
      to: e164,
      from: fromNumber,
      twiml:
        '<Response><Say voice="alice">Calll Home connecting you now.</Say><Dial>' +
        fromNumber +
        "</Dial></Response>",
    });

    const [record] = await db
      .insert(callHistoryTable)
      .values({
        userId,
        callerName: (contactName || callerName || "").slice(0, 64) || null,
        recipientNumber: e164,
        twilioCallSid: call.sid,
        status: call.status ?? "initiated",
      })
      .returning();

    res.json({
      ok: true,
      callSid: call.sid,
      callId: record.id,
      status: call.status,
      to: e164,
    });
  } catch (err: any) {
    console.error("[CalllHome] call error:", err.message);
    if (err.message?.includes("not configured")) {
      res
        .status(503)
        .json({ error: "Phone system not configured. Contact admin." });
    } else {
      res.status(500).json({ error: err.message ?? "Failed to initiate call" });
    }
  }
});

router.post("/twilio/batch-call", requireAuth, async (req, res) => {
  try {
    const { numbers, callerName } = req.body;
    const userId = getAuthUserId(req);
    if (
      !Array.isArray(numbers) ||
      numbers.length === 0 ||
      !userId
    ) {
      res
        .status(400)
        .json({ error: "numbers (array of {phone, name}) required" });
      return;
    }

    const client = getTwilioClient();
    const fromNumber = getTwilioNumber();

    const results = await Promise.allSettled(
      numbers.map(async (entry: { phone: string; name?: string }) => {
        const e164 = toE164(entry.phone);
        if (!e164) return { ok: false, phone: entry.phone, error: "Invalid number" };

        const call = await client.calls.create({
          to: e164,
          from: fromNumber,
          twiml:
            '<Response><Say voice="alice">Calll Home connecting you now.</Say><Dial>' +
            fromNumber +
            "</Dial></Response>",
        });

        const [record] = await db
          .insert(callHistoryTable)
          .values({
            userId,
            callerName: (entry.name || callerName || "").slice(0, 64) || null,
            recipientNumber: e164,
            twilioCallSid: call.sid,
            status: call.status ?? "initiated",
          })
          .returning();

        return {
          ok: true,
          phone: e164,
          name: entry.name,
          callSid: call.sid,
          callId: record.id,
          status: call.status,
        };
      })
    );

    const calls = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return {
        ok: false,
        phone: numbers[i]?.phone,
        name: numbers[i]?.name,
        error: (r.reason as Error)?.message ?? "Failed",
      };
    });

    const succeeded = calls.filter((c: any) => c.ok).length;
    const failed = calls.length - succeeded;

    res.json({ ok: true, total: calls.length, succeeded, failed, calls });
  } catch (err: any) {
    console.error("[CalllHome] batch-call error:", err.message);
    if (err.message?.includes("not configured")) {
      res
        .status(503)
        .json({ error: "Phone system not configured. Contact admin." });
    } else {
      res
        .status(500)
        .json({ error: err.message ?? "Failed to initiate batch calls" });
    }
  }
});

router.get("/twilio/call-status/:callSid", requireAuth, async (req, res) => {
  try {
    const { callSid } = req.params;
    if (!callSid) {
      res.status(400).json({ error: "callSid required" });
      return;
    }

    const client = getTwilioClient();
    const call = await client.calls(callSid).fetch();

    await db
      .update(callHistoryTable)
      .set({
        status: call.status,
        durationSeconds: call.duration
          ? parseInt(call.duration, 10)
          : undefined,
        endedAt: [
          "completed",
          "failed",
          "busy",
          "no-answer",
          "canceled",
        ].includes(call.status)
          ? new Date()
          : undefined,
      })
      .where(eq(callHistoryTable.twilioCallSid, callSid));

    res.json({
      callSid: call.sid,
      status: call.status,
      duration: call.duration,
      to: call.to,
      from: call.from,
    });
  } catch (err: any) {
    console.error("[CalllHome] status error:", err.message);
    res.status(500).json({ error: "Failed to fetch call status" });
  }
});

router.post("/twilio/hangup/:callSid", requireAuth, async (req, res) => {
  try {
    const { callSid } = req.params;
    const userId = getAuthUserId(req);
    if (!callSid) {
      res.status(400).json({ error: "callSid required" });
      return;
    }

    const client = getTwilioClient();
    await client.calls(callSid).update({ status: "completed" });

    await db
      .update(callHistoryTable)
      .set({ status: "completed", endedAt: new Date() })
      .where(and(eq(callHistoryTable.twilioCallSid, callSid), eq(callHistoryTable.userId, userId)));

    res.json({ ok: true, status: "completed" });
  } catch (err: any) {
    console.error("[CalllHome] hangup error:", err.message);
    res.status(500).json({ error: "Failed to end call" });
  }
});

router.post("/twilio/hangup-all", requireAuth, async (req, res) => {
  try {
    const { callSids } = req.body;
    if (!Array.isArray(callSids) || callSids.length === 0) {
      res.status(400).json({ error: "callSids array required" });
      return;
    }

    const client = getTwilioClient();

    await Promise.allSettled(
      callSids.map(async (sid: string) => {
        try {
          await client.calls(sid).update({ status: "completed" });
          await db
            .update(callHistoryTable)
            .set({ status: "completed", endedAt: new Date() })
            .where(eq(callHistoryTable.twilioCallSid, sid));
        } catch {}
      })
    );

    res.json({ ok: true });
  } catch (err: any) {
    console.error("[CalllHome] hangup-all error:", err.message);
    res.status(500).json({ error: "Failed to end calls" });
  }
});

router.get("/twilio/history/:userId", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req) || req.params.userId;
    if (!userId) {
      res.status(400).json({ error: "userId required" });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const history = await db
      .select()
      .from(callHistoryTable)
      .where(eq(callHistoryTable.userId, userId))
      .orderBy(desc(callHistoryTable.startedAt))
      .limit(limit);

    res.json({ calls: history });
  } catch (err: any) {
    console.error("[CalllHome] history error:", err.message);
    res.status(500).json({ error: "Failed to fetch call history" });
  }
});

export default router;
