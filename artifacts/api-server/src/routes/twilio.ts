import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, desc, and } from "drizzle-orm";
import {
  db,
  callHistoryTable,
  contactsTable,
  voicemailsTable,
  phoneNumbersTable,
  secretaryConfigTable,
  dialingSessionsTable,
  conferenceRoomsTable,
  appointmentsTable,
  contactInteractionsTable,
  usersTable,
  type InsertSecretaryConfig,
} from "@workspace/db";
import twilio from "twilio";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getUncachableResendClient } from "../lib/resend";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  res.status(401).json({ error: "Login required" });
}

function getAuthUserId(req: Request): string {
  const user = (req as Request & { user?: { id?: string } }).user;
  return user?.id ?? "";
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

async function verifyCallOwnership(userId: string, callSid: string): Promise<boolean> {
  const rows = await db
    .select({ id: callHistoryTable.id })
    .from(callHistoryTable)
    .where(and(eq(callHistoryTable.userId, userId), eq(callHistoryTable.twilioCallSid, callSid)))
    .limit(1);
  return rows.length > 0;
}

function validateTwilioWebhook(req: Request): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;
  const signature = req.headers["x-twilio-signature"] as string;
  if (!signature) return false;
  const protocol = req.headers["x-forwarded-proto"] ?? "https";
  const host = req.headers.host ?? "";
  const url = `${protocol}://${host}${req.originalUrl}`;
  return twilio.validateRequest(authToken, signature, url, req.body ?? {});
}

function escapeTwiml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function toE164(raw: string): string | null {
  const cleaned = raw.replace(/[^+\d]/g, "");
  if (!/^\+?\d{7,15}$/.test(cleaned)) return null;
  return cleaned.startsWith("+") ? cleaned : `+1${cleaned}`;
}

async function generateCallSummary(transcript: string): Promise<string> {
  if (!transcript || transcript.trim().length < 20) return "";
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 200,
      messages: [
        {
          role: "system",
          content:
            "You are a business call summarizer. Provide a concise 2-3 sentence summary of the call transcript. Focus on key topics, outcomes, and any action items.",
        },
        { role: "user", content: `Summarize this call transcript:\n\n${transcript}` },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() ?? "";
  } catch {
    return "";
  }
}

async function sendMissedCallEmail(userId: string, fromNumber: string, fromName?: string) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const userEmail = (users[0] as { email?: string } | undefined)?.email;
    if (!userEmail) return;
    await client.emails.send({
      from: fromEmail,
      to: [userEmail],
      subject: `Missed Call from ${fromName || fromNumber}`,
      html: `<div style="font-family:monospace;background:#030803;color:#00ff41;padding:24px;max-width:480px;">
<h2 style="color:#00ff41;letter-spacing:0.1em">[ MISSED CALL ]</h2>
<p><strong>From:</strong> ${fromName || "Unknown"}</p>
<p><strong>Number:</strong> ${fromNumber}</p>
<p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
<p style="color:rgba(0,255,65,0.5);font-size:0.8em">Calll Home · Business Phone System</p>
</div>`,
    });
  } catch (e: unknown) {
    console.error("[CalllHome] missed call email error:", e instanceof Error ? e.message : "Unknown");
  }
}

router.get("/twilio/contacts/:userId", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req) || (Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId);
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
      .map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, hometown: c.hometown, company: c.company }));
    res.json({ contacts: withPhone, total: contacts.length });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] contacts error:", _msg);
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

router.post("/twilio/call", requireAuth, async (req, res) => {
  try {
    const { recipientNumber, callerName, contactName, contactId, conferenceMode } = req.body;
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

    let twiml: string;
    if (conferenceMode) {
      const confName = `conf-${userId}-${Date.now()}`;
      twiml = `<Response><Dial><Conference>${confName}</Conference></Dial></Response>`;
    } else {
      twiml = `<Response><Say voice="alice">Calll Home connecting you now.</Say><Dial>${fromNumber}</Dial></Response>`;
    }

    const call = await client.calls.create({ to: e164, from: fromNumber, twiml });

    const [record] = await db
      .insert(callHistoryTable)
      .values({
        userId,
        callerName: (contactName || callerName || "").slice(0, 64) || null,
        recipientNumber: e164,
        twilioCallSid: call.sid,
        status: call.status ?? "initiated",
        direction: "outbound",
        callType: conferenceMode ? "conference" : "single",
        contactId: contactId ? Number(contactId) : undefined,
      })
      .returning();

    res.json({ ok: true, callSid: call.sid, callId: record.id, status: call.status, to: e164 });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] call error:", _msg);
    if (_msg.includes("not configured")) {
      res.status(503).json({ error: "Phone system not configured. Contact admin." });
    } else {
      res.status(500).json({ error: _msg });
    }
  }
});

router.post("/twilio/call/:callSid/mute", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const callSid = req.params.callSid as string;
    const { muted } = req.body;
    if (!(await verifyCallOwnership(userId, callSid))) {
      res.status(403).json({ error: "Not authorized to control this call" });
      return;
    }
    const client = getTwilioClient();
    const call = await client.calls(callSid).fetch();
    const conferenceSid = call.groupSid ?? null;
    if (conferenceSid) {
      const participants = await client.conferences(conferenceSid).participants.list();
      const userParticipant = participants.find(p => p.callSid === callSid);
      if (userParticipant) {
        await client.conferences(conferenceSid).participants(callSid).update({ muted: !!muted });
      }
    } else {
      if (muted) {
        await client.calls(callSid).update({
          twiml: '<Response><Pause length="3600"/></Response>',
        });
      } else {
        await client.calls(callSid).update({
          twiml: `<Response><Dial>${call.to}</Dial></Response>`,
        });
      }
    }
    res.json({ ok: true, muted: !!muted });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] mute error:", msg);
    res.status(500).json({ error: "Mute operation failed", detail: msg });
  }
});

router.post("/twilio/call/:callSid/hold", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const callSid = req.params.callSid as string;
    const { hold } = req.body;
    if (!(await verifyCallOwnership(userId, callSid))) {
      res.status(403).json({ error: "Not authorized to control this call" });
      return;
    }
    const client = getTwilioClient();
    const call = await client.calls(callSid).fetch();
    const conferenceSid = call.groupSid ?? null;
    if (conferenceSid) {
      if (hold) {
        await client.conferences(conferenceSid).participants(callSid).update({ hold: true, holdUrl: "https://com.twilio.music.classical.s3.amazonaws.com/BachGavotteShort.mp3" });
      } else {
        await client.conferences(conferenceSid).participants(callSid).update({ hold: false });
      }
    } else {
      if (hold) {
        await client.calls(callSid).update({
          twiml: '<Response><Play loop="0">https://com.twilio.music.classical.s3.amazonaws.com/BachGavotteShort.mp3</Play></Response>',
        });
      } else {
        await client.calls(callSid).update({
          twiml: `<Response><Dial>${call.to}</Dial></Response>`,
        });
      }
    }
    res.json({ ok: true, onHold: !!hold });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] hold error:", msg);
    res.status(500).json({ error: "Hold operation failed", detail: msg });
  }
});

router.post("/twilio/call/:callSid/transfer", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const callSid = req.params.callSid as string;
    const { transferTo } = req.body;
    if (!(await verifyCallOwnership(userId, callSid))) {
      res.status(403).json({ error: "Not authorized to control this call" });
      return;
    }
    if (!transferTo) {
      res.status(400).json({ error: "transferTo number required" });
      return;
    }
    const e164 = toE164(transferTo);
    if (!e164) {
      res.status(400).json({ error: "Invalid transfer number" });
      return;
    }
    const client = getTwilioClient();
    await client.calls(callSid).update({
      twiml: `<Response><Dial>${e164}</Dial></Response>`,
    });

    await db
      .update(callHistoryTable)
      .set({ status: "transferred", endedAt: new Date() })
      .where(and(eq(callHistoryTable.twilioCallSid, callSid), eq(callHistoryTable.userId, userId)));

    res.json({ ok: true, transferredTo: e164 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] transfer error:", msg);
    res.status(500).json({ error: "Transfer failed", detail: msg });
  }
});

router.post("/twilio/conference/create", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const { label } = req.body;
    const roomName = `CalllHome-${userId}-${Date.now()}`;
    const [room] = await db
      .insert(conferenceRoomsTable)
      .values({ userId, roomName, status: "active", participantsJson: "[]" })
      .returning();
    res.json({ ok: true, roomId: room.id, roomName, joinUrl: `/api/twilio/conference/${roomName}/join` });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] conference create error:", _msg);
    res.status(500).json({ error: "Failed to create conference" });
  }
});

router.post("/twilio/conference/:roomName/add", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const roomName = Array.isArray(req.params.roomName) ? req.params.roomName[0] : req.params.roomName;
    const rooms = await db
      .select({ id: conferenceRoomsTable.id })
      .from(conferenceRoomsTable)
      .where(and(eq(conferenceRoomsTable.roomName, roomName), eq(conferenceRoomsTable.userId, userId)))
      .limit(1);
    if (rooms.length === 0) {
      res.status(403).json({ error: "Not authorized to add participants to this conference" });
      return;
    }
    const { phoneNumber, name } = req.body;
    if (!phoneNumber) {
      res.status(400).json({ error: "phoneNumber required" });
      return;
    }
    const e164 = toE164(phoneNumber);
    if (!e164) {
      res.status(400).json({ error: "Invalid phone number" });
      return;
    }
    const client = getTwilioClient();
    const fromNumber = getTwilioNumber();
    const call = await client.calls.create({
      to: e164,
      from: fromNumber,
      twiml: `<Response><Say voice="alice">You are being connected to a conference call.</Say><Dial><Conference>${roomName}</Conference></Dial></Response>`,
    });

    const roomRows = await db.select().from(conferenceRoomsTable)
      .where(and(eq(conferenceRoomsTable.roomName, roomName), eq(conferenceRoomsTable.userId, userId)))
      .limit(1);
    if (roomRows[0]) {
      const existing: Array<{ phone: string; name: string; callSid: string; muted: boolean }> = JSON.parse(roomRows[0].participantsJson ?? "[]");
      existing.push({ phone: e164, name: name ?? e164, callSid: call.sid, muted: false });
      await db.update(conferenceRoomsTable)
        .set({ participantsJson: JSON.stringify(existing) })
        .where(eq(conferenceRoomsTable.id, roomRows[0].id));
    }

    res.json({ ok: true, callSid: call.sid, phone: e164, name });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] conference add error:", msg);
    res.status(500).json({ error: "Failed to add to conference" });
  }
});

router.get("/twilio/conference/list", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const rooms = await db
      .select()
      .from(conferenceRoomsTable)
      .where(and(eq(conferenceRoomsTable.userId, userId), eq(conferenceRoomsTable.status, "active")))
      .orderBy(desc(conferenceRoomsTable.createdAt))
      .limit(10);
    res.json({ rooms });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to fetch conferences" });
  }
});

router.post("/twilio/conference/:roomName/end", requireAuth, async (req, res) => {
  try {
    const roomName = req.params.roomName as string;
    const userId = getAuthUserId(req);
    await db
      .update(conferenceRoomsTable)
      .set({ status: "ended", endedAt: new Date() })
      .where(and(eq(conferenceRoomsTable.roomName, roomName), eq(conferenceRoomsTable.userId, userId)));
    try {
      const client = getTwilioClient();
      const confs = await client.conferences.list({ friendlyName: roomName, status: "in-progress" });
      for (const conf of confs) {
        await client.conferences(conf.sid).update({ status: "completed" });
      }
    } catch (e: unknown) {
      console.error("[CalllHome] conference Twilio cleanup error:", e instanceof Error ? e.message : "Unknown");
    }
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to end conference" });
  }
});

router.post("/twilio/dialing/start", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const { mode, numbers, settings } = req.body;
    if (!["power", "auto", "predictive"].includes(mode)) {
      res.status(400).json({ error: "mode must be power, auto, or predictive" });
      return;
    }
    if (!Array.isArray(numbers) || numbers.length === 0) {
      res.status(400).json({ error: "numbers array required" });
      return;
    }
    const [session] = await db
      .insert(dialingSessionsTable)
      .values({
        userId,
        mode,
        status: "running",
        totalNumbers: numbers.length,
        queueJson: JSON.stringify(numbers),
        settingsJson: JSON.stringify(settings ?? {}),
      })
      .returning();

    const client = getTwilioClient();
    const fromNumber = getTwilioNumber();
    const callerName = getAuthUserId(req);

    let dialCount = mode === "predictive" ? Math.min(3, numbers.length) : 1;
    const results: Array<{ ok: boolean; phone: string; name?: string; callSid?: string; error?: string; status?: string }> = [];

    for (let i = 0; i < dialCount; i++) {
      const entry = numbers[i];
      const e164 = toE164(entry.phone);
      if (!e164) {
        results.push({ ok: false, phone: entry.phone, error: "Invalid number" });
        continue;
      }
      try {
        let twiml: string;
        if (mode === "auto" && settings?.recordingUrl) {
          twiml = `<Response><Play>${settings.recordingUrl}</Play></Response>`;
        } else {
          twiml = `<Response><Say voice="alice">Calll Home connecting you now.</Say><Dial>${fromNumber}</Dial></Response>`;
        }
        const call = await client.calls.create({ to: e164, from: fromNumber, twiml });
        await db.insert(callHistoryTable).values({
          userId,
          callerName: (entry.name || callerName || "").slice(0, 64) || null,
          recipientNumber: e164,
          twilioCallSid: call.sid,
          status: call.status ?? "initiated",
          direction: "outbound",
          callType: mode + "_dialing",
        });
        results.push({ ok: true, phone: e164, name: entry.name, callSid: call.sid });
      } catch (e: unknown) {
        results.push({ ok: false, phone: entry.phone, error: e instanceof Error ? e.message : "Failed" });
      }
    }

    await db.update(dialingSessionsTable).set({ dialedCount: results.filter((r) => r.ok).length }).where(eq(dialingSessionsTable.id, session.id));

    res.json({ ok: true, sessionId: session.id, mode, calls: results });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] dialing start error:", _msg);
    if (_msg.includes("not configured")) {
      res.status(503).json({ error: "Phone system not configured. Contact admin." });
    } else {
      res.status(500).json({ error: _msg });
    }
  }
});

router.post("/twilio/dialing/:sessionId/next", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const sessionId = Number(req.params.sessionId);
    const sessions = await db
      .select()
      .from(dialingSessionsTable)
      .where(and(eq(dialingSessionsTable.id, sessionId), eq(dialingSessionsTable.userId, userId)))
      .limit(1);
    const session = sessions[0];
    if (!session || session.status !== "running") {
      res.status(400).json({ error: "Session not found or not running" });
      return;
    }
    const queue: Array<{ phone: string; name?: string }> = JSON.parse(session.queueJson ?? "[]");
    const dialed = session.dialedCount ?? 0;
    if (dialed >= queue.length) {
      await db.update(dialingSessionsTable).set({ status: "completed", endedAt: new Date() }).where(eq(dialingSessionsTable.id, sessionId));
      res.json({ ok: true, completed: true, message: "All numbers have been dialed" });
      return;
    }
    const entry = queue[dialed];
    const e164 = toE164(entry.phone);
    if (!e164) {
      await db.update(dialingSessionsTable).set({ dialedCount: dialed + 1 }).where(eq(dialingSessionsTable.id, sessionId));
      res.json({ ok: false, skipped: true, phone: entry.phone, error: "Invalid number" });
      return;
    }
    const client = getTwilioClient();
    const fromNumber = getTwilioNumber();
    const call = await client.calls.create({ to: e164, from: fromNumber, twiml: `<Response><Dial>${fromNumber}</Dial></Response>` });
    await db.insert(callHistoryTable).values({
      userId, recipientNumber: e164, twilioCallSid: call.sid, callerName: entry.name ?? null,
      status: call.status ?? "initiated", direction: "outbound", callType: session.mode + "_dialing",
    });
    await db.update(dialingSessionsTable).set({ dialedCount: dialed + 1 }).where(eq(dialingSessionsTable.id, sessionId));
    res.json({ ok: true, callSid: call.sid, phone: e164, name: entry.name, remaining: queue.length - dialed - 1 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] dialing next error:", msg);
    res.status(500).json({ error: msg });
  }
});

router.post("/twilio/dialing/:sessionId/stop", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const sessionId = Number(req.params.sessionId);
    await db
      .update(dialingSessionsTable)
      .set({ status: "stopped", endedAt: new Date() })
      .where(and(eq(dialingSessionsTable.id, sessionId), eq(dialingSessionsTable.userId, userId)));
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to stop session" });
  }
});

router.get("/twilio/dialing/sessions", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const sessions = await db
      .select()
      .from(dialingSessionsTable)
      .where(eq(dialingSessionsTable.userId, userId))
      .orderBy(desc(dialingSessionsTable.startedAt))
      .limit(20);
    res.json({ sessions });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

router.post("/twilio/ai/transcribe", requireAuth, async (req, res) => {
  try {
    const { callSid, transcript } = req.body;
    const userId = getAuthUserId(req);

    let summary = "";
    if (transcript && transcript.trim().length > 20) {
      summary = await generateCallSummary(transcript);
    }

    if (callSid) {
      await db
        .update(callHistoryTable)
        .set({ transcript, summary })
        .where(and(eq(callHistoryTable.twilioCallSid, callSid), eq(callHistoryTable.userId, userId)));
    }

    res.json({ ok: true, summary });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] transcribe error:", _msg);
    res.status(500).json({ error: "Failed to save transcript" });
  }
});

router.post("/twilio/ai/coach", requireAuth, async (req, res) => {
  try {
    const { question, transcript, context } = req.body;
    if (!question) {
      res.status(400).json({ error: "question required" });
      return;
    }
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 300,
      messages: [
        {
          role: "system",
          content: `You are an AI call coach helping a business professional during an active call. 
Provide concise, actionable coaching responses.
${transcript ? `Current call transcript:\n${transcript}` : ""}
${context ? `Context: ${context}` : ""}
Keep responses to 2-3 sentences. Be direct and tactical.`,
        },
        { role: "user", content: question },
      ],
    });
    const response = completion.choices[0]?.message?.content?.trim() ?? "Unable to provide coaching at this time.";
    res.json({ response });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] coach error:", _msg);
    res.status(500).json({ error: "AI coaching unavailable" });
  }
});

router.post("/twilio/ai/suggest", requireAuth, async (req, res) => {
  try {
    const { transcript, contactName, context } = req.body;
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 250,
      messages: [
        {
          role: "system",
          content: `You are an AI call assistant. Based on the conversation, suggest 3 talking points or responses the agent could use next.
${contactName ? `Talking with: ${contactName}` : ""}
${context ? `Context: ${context}` : ""}
Format as a numbered list. Be brief and actionable.`,
        },
        {
          role: "user",
          content: transcript
            ? `Current transcript:\n${transcript}\n\nWhat should I say next?`
            : "The call just started. What should I open with?",
        },
      ],
    });
    const suggestions = completion.choices[0]?.message?.content?.trim() ?? "";
    res.json({ suggestions });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] suggest error:", _msg);
    res.status(500).json({ error: "AI suggestions unavailable" });
  }
});

router.post("/twilio/ai/dictation", requireAuth, async (req, res) => {
  try {
    const { text, callSid } = req.body;
    const userId = getAuthUserId(req);
    if (!text) {
      res.status(400).json({ error: "text required" });
      return;
    }
    if (callSid) {
      const existing = await db.select().from(callHistoryTable).where(and(eq(callHistoryTable.twilioCallSid, callSid), eq(callHistoryTable.userId, userId))).limit(1);
      if (existing[0]) {
        const currentNotes = existing[0].notes ?? "";
        await db.update(callHistoryTable).set({ notes: currentNotes ? `${currentNotes}\n${text}` : text }).where(eq(callHistoryTable.id, existing[0].id));
      }
    }
    res.json({ ok: true, saved: !!callSid });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to save dictation" });
  }
});

router.get("/twilio/voicemail", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const voicemails = await db
      .select()
      .from(voicemailsTable)
      .where(eq(voicemailsTable.userId, userId))
      .orderBy(desc(voicemailsTable.createdAt))
      .limit(50);
    const unread = voicemails.filter((v) => !v.isRead).length;
    res.json({ voicemails, unread });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to fetch voicemails" });
  }
});

router.post("/twilio/voicemail/:id/read", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const id = Number(req.params.id);
    await db.update(voicemailsTable).set({ isRead: true }).where(and(eq(voicemailsTable.id, id), eq(voicemailsTable.userId, userId)));
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

router.delete("/twilio/voicemail/:id", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const id = Number(req.params.id);
    await db.delete(voicemailsTable).where(and(eq(voicemailsTable.id, id), eq(voicemailsTable.userId, userId)));
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to delete voicemail" });
  }
});

router.post("/twilio/voicemail/webhook", async (req, res) => {
  try {
    if (!validateTwilioWebhook(req)) {
      console.error("[CalllHome] voicemail webhook: invalid Twilio signature");
      res.status(403).send("Forbidden");
      return;
    }
    const { RecordingUrl, RecordingSid, CallSid, From, RecordingDuration, TranscriptionText, TranscriptionStatus } = req.body;
    const userId = req.query.userId as string;
    if (!userId || !From) {
      res.status(400).send("Missing params");
      return;
    }

    const hasTranscription = TranscriptionStatus === "completed" && TranscriptionText;
    const transcript = hasTranscription
      ? TranscriptionText
      : `[Voicemail from ${From} - ${new Date().toLocaleString()}]`;

    const [vm] = await db
      .insert(voicemailsTable)
      .values({
        userId,
        fromNumber: From,
        twilioCallSid: CallSid,
        recordingUrl: RecordingUrl ? `${RecordingUrl}.mp3` : undefined,
        recordingSid: RecordingSid,
        durationSeconds: RecordingDuration ? Number(RecordingDuration) : 0,
        transcript,
      })
      .returning();

    if (transcript && transcript.length > 20) {
      try {
        const summary = await generateCallSummary(transcript);
        if (summary) {
          await db.update(voicemailsTable).set({ summary }).where(eq(voicemailsTable.id, vm.id));
        }
      } catch (e: unknown) {
        console.error("[CalllHome] voicemail summary error:", e instanceof Error ? e.message : "Unknown");
      }
    }

    await sendMissedCallEmail(userId, From);
    res.send('<Response></Response>');
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] voicemail webhook error:", _msg);
    res.status(500).send("Error");
  }
});

router.post("/twilio/inbound/webhook", async (req, res) => {
  try {
    if (!validateTwilioWebhook(req)) {
      console.error("[CalllHome] inbound webhook: invalid Twilio signature");
      res.status(403).send("Forbidden");
      return;
    }
    const { From, To, CallSid } = req.body;
    const userId = req.query.userId as string;

    const configRows = userId
      ? await db.select().from(secretaryConfigTable).where(eq(secretaryConfigTable.userId, userId)).limit(1)
      : [];
    const config = configRows[0] ?? null;

    if (config?.isEnabled) {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const currentTime = hour * 60 + minute;
      const [startH, startM] = (config.businessHoursStart ?? "09:00").split(":").map(Number);
      const [endH, endM] = (config.businessHoursEnd ?? "17:00").split(":").map(Number);
      const startTime = startH * 60 + startM;
      const endTime = endH * 60 + endM;
      const dayOfWeek = now.getDay();
      const businessDays = (config.businessDays ?? "1,2,3,4,5").split(",").map(Number);
      const isDuringBusinessHours = businessDays.includes(dayOfWeek) && currentTime >= startTime && currentTime <= endTime;

      if (isDuringBusinessHours) {
        const personality = config.personality ?? "professional";
        const greeting = config.greetingScript ?? `Thank you for calling. I'm an AI assistant. How can I help you today?`;
        const screening = config.screeningRules ?? "Ask for the caller's name and the reason for their call.";
        const routing = config.routingInstructions ?? "";
        const twiml = `<Response>
<Gather input="speech" timeout="5" action="/api/twilio/secretary/handle?userId=${userId}&amp;personality=${encodeURIComponent(personality)}&amp;screening=${encodeURIComponent(screening)}&amp;routing=${encodeURIComponent(routing)}" method="POST" speechTimeout="auto">
<Say voice="alice">${escapeTwiml(greeting)}</Say>
</Gather>
<Say voice="alice">I didn't catch that. Please leave a message after the tone.</Say>
<Record maxLength="120" transcribe="true" transcribeCallback="/api/twilio/voicemail/webhook?userId=${userId}" />
</Response>`;
        res.type("text/xml").send(twiml);
        return;
      }
    }

    if (userId) {
      await sendMissedCallEmail(userId, From);
    }

    const greeting = config?.greetingScript ?? "You have reached our voicemail. Please leave a message after the tone.";
    const twiml = `<Response>
<Say voice="alice">${escapeTwiml(greeting)} Please leave a message after the tone.</Say>
<Record maxLength="120" transcribe="true" transcribeCallback="/api/twilio/voicemail/webhook?userId=${userId ?? ""}" />
</Response>`;
    res.type("text/xml").send(twiml);
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] inbound webhook error:", _msg);
    res.type("text/xml").send("<Response><Say>An error occurred. Please try again later.</Say></Response>");
  }
});

router.post("/twilio/secretary/handle", async (req, res) => {
  try {
    if (!validateTwilioWebhook(req)) {
      console.error("[CalllHome] secretary handle: invalid Twilio signature");
      res.status(403).send("Forbidden");
      return;
    }
    const { SpeechResult, From, CallSid } = req.body;
    const userId = req.query.userId as string;

    const configs = await db.select().from(secretaryConfigTable).where(eq(secretaryConfigTable.userId, userId)).limit(1);
    const config = configs[0];

    const personality = (typeof req.query.personality === "string" ? decodeURIComponent(req.query.personality) : null) ?? config?.personality ?? "professional";
    const screening = (typeof req.query.screening === "string" ? decodeURIComponent(req.query.screening) : null) ?? config?.screeningRules ?? "Ask for the caller's name and the reason for their call.";
    const routing = (typeof req.query.routing === "string" ? decodeURIComponent(req.query.routing) : null) ?? config?.routingInstructions ?? "";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 200,
      messages: [
        {
          role: "system",
          content: `You are a ${personality} AI receptionist/secretary. 
Screening rules: ${screening}
${routing ? `Routing: ${routing}` : ""}
Keep your response under 40 words. If the caller needs urgent help, say you will transfer them.
End with asking if there's anything else you can help with.`,
        },
        { role: "user", content: `Caller said: "${SpeechResult}"` },
      ],
    });

    const response = completion.choices[0]?.message?.content?.trim() ?? "Thank you for calling. Please leave a message.";

    await db.insert(callHistoryTable).values({
      userId,
      callerName: null,
      recipientNumber: From ?? "unknown",
      twilioCallSid: CallSid,
      status: "in-progress",
      direction: "inbound",
      callType: "secretary",
      notes: `Secretary handled. Caller said: "${SpeechResult}"`,
    });

    const forwardTo = config?.forwardToNumber;
    let action = "";
    if (forwardTo && response.toLowerCase().includes("transfer")) {
      const safeForward = escapeTwiml(forwardTo);
      action = `<Dial>${safeForward}</Dial>`;
    } else {
      const safeResponse = escapeTwiml(response);
      action = `<Gather input="speech" timeout="5" action="/api/twilio/secretary/handle?userId=${userId}&amp;personality=${encodeURIComponent(personality)}&amp;screening=${encodeURIComponent(screening)}&amp;routing=${encodeURIComponent(routing)}" method="POST" speechTimeout="auto"><Say voice="alice">${safeResponse}</Say></Gather><Record maxLength="120" transcribeCallback="/api/twilio/voicemail/webhook?userId=${userId}" />`;
    }

    res.type("text/xml").send(`<Response>${action}</Response>`);
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] secretary handle error:", _msg);
    res.type("text/xml").send('<Response><Say>Thank you for calling. Please leave a message after the tone.</Say><Record maxLength="120" /></Response>');
  }
});

router.get("/twilio/secretary/config", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const configs = await db.select().from(secretaryConfigTable).where(eq(secretaryConfigTable.userId, userId)).limit(1);
    res.json({ config: configs[0] ?? null });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to fetch secretary config" });
  }
});

router.post("/twilio/secretary/config", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const {
      isEnabled, personality, greetingScript, screeningRules,
      businessHoursStart, businessHoursEnd, businessDays,
      routingInstructions, forwardToNumber, afterHoursAction,
    } = req.body;

    const existing = await db.select().from(secretaryConfigTable).where(eq(secretaryConfigTable.userId, userId)).limit(1);

    const values: Partial<InsertSecretaryConfig> = {
      userId,
      updatedAt: new Date(),
      ...(isEnabled !== undefined && { isEnabled }),
      ...(personality && { personality }),
      ...(greetingScript !== undefined && { greetingScript }),
      ...(screeningRules !== undefined && { screeningRules }),
      ...(businessHoursStart && { businessHoursStart }),
      ...(businessHoursEnd && { businessHoursEnd }),
      ...(businessDays && { businessDays }),
      ...(routingInstructions !== undefined && { routingInstructions }),
      ...(forwardToNumber !== undefined && { forwardToNumber }),
      ...(afterHoursAction && { afterHoursAction }),
    };

    let record;
    if (existing.length > 0) {
      [record] = await db.update(secretaryConfigTable).set(values).where(eq(secretaryConfigTable.userId, userId)).returning();
    } else {
      [record] = await db.insert(secretaryConfigTable).values(values as InsertSecretaryConfig).returning();
    }

    res.json({ ok: true, config: record });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] secretary config error:", _msg);
    res.status(500).json({ error: "Failed to save secretary config" });
  }
});

router.get("/twilio/phone-numbers", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const numbers = await db
      .select()
      .from(phoneNumbersTable)
      .where(eq(phoneNumbersTable.userId, userId))
      .orderBy(phoneNumbersTable.createdAt);

    let twilioNumbers: Array<{ sid: string; number: string; friendlyName: string; capabilities: Record<string, boolean> | null }> = [];
    try {
      const client = getTwilioClient();
      const incoming = await client.incomingPhoneNumbers.list({ limit: 20 });
      twilioNumbers = incoming.map((n) => ({
        sid: n.sid,
        number: n.phoneNumber,
        friendlyName: n.friendlyName,
        capabilities: n.capabilities as Record<string, boolean> | null,
      }));
    } catch (e: unknown) {
      console.error("[CalllHome] Twilio numbers fetch error:", e instanceof Error ? e.message : "Unknown");
    }

    res.json({ numbers, twilioNumbers });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to fetch phone numbers" });
  }
});

router.post("/twilio/phone-numbers", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const { number, label, greeting, routingMode, twilioSid } = req.body;
    if (!number) {
      res.status(400).json({ error: "number required" });
      return;
    }
    const e164 = toE164(number);
    if (!e164) {
      res.status(400).json({ error: "Invalid phone number" });
      return;
    }
    const [record] = await db
      .insert(phoneNumbersTable)
      .values({
        userId,
        number: e164,
        friendlyName: label ?? "My Number",
        label: label ?? "main",
        twilioSid,
        greeting,
        routingMode: routingMode ?? "voicemail",
      })
      .returning();
    res.json({ ok: true, phoneNumber: record });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to add phone number" });
  }
});

router.put("/twilio/phone-numbers/:id", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const id = Number(req.params.id);
    const { label, greeting, routingMode, isActive } = req.body;
    const [updated] = await db
      .update(phoneNumbersTable)
      .set({
        ...(label !== undefined && { label, friendlyName: label }),
        ...(greeting !== undefined && { greeting }),
        ...(routingMode !== undefined && { routingMode }),
        ...(isActive !== undefined && { isActive }),
      })
      .where(and(eq(phoneNumbersTable.id, id), eq(phoneNumbersTable.userId, userId)))
      .returning();
    res.json({ ok: true, phoneNumber: updated });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to update phone number" });
  }
});

router.delete("/twilio/phone-numbers/:id", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const id = Number(req.params.id);
    await db.delete(phoneNumbersTable).where(and(eq(phoneNumbersTable.id, id), eq(phoneNumbersTable.userId, userId)));
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to delete phone number" });
  }
});

router.post("/twilio/call/:callSid/schedule-followup", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const callSid = req.params.callSid as string;
    const { title, startAt, endAt, reminderMinutes, contactId } = req.body;
    if (!title || !startAt || !endAt) {
      res.status(400).json({ error: "title, startAt, endAt required" });
      return;
    }
    const [appt] = await db
      .insert(appointmentsTable)
      .values({
        userId,
        title: title.trim(),
        description: `Follow-up from call (SID: ${callSid})`,
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        reminderMinutes: Number(reminderMinutes ?? 15),
      })
      .returning();

    await db
      .update(callHistoryTable)
      .set({ calendarEventId: appt.id })
      .where(and(eq(callHistoryTable.twilioCallSid, callSid), eq(callHistoryTable.userId, userId)));

    if (contactId) {
      await db.insert(contactInteractionsTable).values({
        contactId: Number(contactId),
        userId,
        type: "note",
        note: `Scheduled follow-up: "${title}" for ${new Date(startAt).toLocaleString()}`,
      });
    }

    res.json({ ok: true, appointment: appt });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to schedule follow-up" });
  }
});

router.post("/twilio/history/:callId/link-contact", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const callId = Number(req.params.callId);
    const { contactId, note } = req.body;
    if (!contactId) {
      res.status(400).json({ error: "contactId required" });
      return;
    }

    await db.update(callHistoryTable).set({ contactId: Number(contactId) }).where(and(eq(callHistoryTable.id, callId), eq(callHistoryTable.userId, userId)));

    const callRecords = await db.select().from(callHistoryTable).where(eq(callHistoryTable.id, callId)).limit(1);
    const call = callRecords[0];
    if (call && note) {
      await db.insert(contactInteractionsTable).values({
        contactId: Number(contactId),
        userId,
        type: "call",
        note: note || `Call on ${new Date(call.startedAt).toLocaleString()} - ${call.status}`,
      });
    }

    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to link contact" });
  }
});

router.post("/twilio/batch-call", requireAuth, async (req, res) => {
  try {
    const { numbers, callerName } = req.body;
    const userId = getAuthUserId(req);
    if (!Array.isArray(numbers) || numbers.length === 0 || !userId) {
      res.status(400).json({ error: "numbers (array of {phone, name}) required" });
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
          twiml: `<Response><Say voice="alice">Calll Home connecting you now.</Say><Dial>${fromNumber}</Dial></Response>`,
        });
        const [record] = await db
          .insert(callHistoryTable)
          .values({
            userId,
            callerName: (entry.name || callerName || "").slice(0, 64) || null,
            recipientNumber: e164,
            twilioCallSid: call.sid,
            status: call.status ?? "initiated",
            direction: "outbound",
            callType: "batch",
          })
          .returning();
        return { ok: true, phone: e164, name: entry.name, callSid: call.sid, callId: record.id, status: call.status };
      })
    );
    const calls = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return { ok: false, phone: numbers[i]?.phone, name: numbers[i]?.name, error: (r.reason as Error)?.message ?? "Failed" };
    });
    const succeeded = calls.filter((c) => c.ok).length;
    res.json({ ok: true, total: calls.length, succeeded, failed: calls.length - succeeded, calls });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] batch-call error:", _msg);
    if (_msg.includes("not configured")) {
      res.status(503).json({ error: "Phone system not configured. Contact admin." });
    } else {
      res.status(500).json({ error: _msg });
    }
  }
});

router.get("/twilio/call-status/:callSid", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const callSid = req.params.callSid as string;
    if (!callSid) {
      res.status(400).json({ error: "callSid required" });
      return;
    }
    if (!(await verifyCallOwnership(userId, callSid))) {
      res.status(403).json({ error: "Not authorized to view this call" });
      return;
    }
    const client = getTwilioClient();
    const call = await client.calls(callSid).fetch();
    await db
      .update(callHistoryTable)
      .set({
        status: call.status,
        durationSeconds: call.duration ? parseInt(call.duration, 10) : undefined,
        endedAt: ["completed", "failed", "busy", "no-answer", "canceled"].includes(call.status) ? new Date() : undefined,
      })
      .where(and(eq(callHistoryTable.twilioCallSid, callSid), eq(callHistoryTable.userId, userId)));
    res.json({ callSid: call.sid, status: call.status, duration: call.duration, to: call.to, from: call.from });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] status error:", _msg);
    res.status(500).json({ error: "Failed to fetch call status" });
  }
});

router.post("/twilio/hangup/:callSid", requireAuth, async (req, res) => {
  try {
    const callSid = req.params.callSid as string;
    const userId = getAuthUserId(req);
    if (!callSid) {
      res.status(400).json({ error: "callSid required" });
      return;
    }
    if (!(await verifyCallOwnership(userId, callSid))) {
      res.status(403).json({ error: "Not authorized to hang up this call" });
      return;
    }
    const client = getTwilioClient();
    await client.calls(callSid).update({ status: "completed" });
    await db
      .update(callHistoryTable)
      .set({ status: "completed", endedAt: new Date() })
      .where(and(eq(callHistoryTable.twilioCallSid, callSid), eq(callHistoryTable.userId, userId)));
    res.json({ ok: true, status: "completed" });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] hangup error:", _msg);
    res.status(500).json({ error: "Failed to end call" });
  }
});

router.post("/twilio/hangup-all", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const { callSids } = req.body;
    if (!Array.isArray(callSids) || callSids.length === 0) {
      res.status(400).json({ error: "callSids array required" });
      return;
    }
    const client = getTwilioClient();
    await Promise.allSettled(
      callSids.map(async (sid: string) => {
        if (!(await verifyCallOwnership(userId, sid))) return;
        try {
          await client.calls(sid).update({ status: "completed" });
          await db.update(callHistoryTable).set({ status: "completed", endedAt: new Date() }).where(and(eq(callHistoryTable.twilioCallSid, sid), eq(callHistoryTable.userId, userId)));
        } catch (e: unknown) {
          console.error("[CalllHome] hangup-all individual error:", e instanceof Error ? e.message : "Unknown");
        }
      })
    );
    res.json({ ok: true });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] hangup-all error:", _msg);
    res.status(500).json({ error: "Failed to end calls" });
  }
});

router.get("/twilio/history/:userId", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req) || (Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId);
    if (!userId) {
      res.status(400).json({ error: "userId required" });
      return;
    }
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const search = req.query.search as string;

    let query = db
      .select()
      .from(callHistoryTable)
      .where(eq(callHistoryTable.userId, userId))
      .orderBy(desc(callHistoryTable.startedAt))
      .limit(limit);

    const history = await query;

    let filtered = history;
    if (search && search.trim()) {
      const q = search.toLowerCase();
      filtered = history.filter((h) =>
        h.callerName?.toLowerCase().includes(q) ||
        h.recipientNumber.includes(q) ||
        h.transcript?.toLowerCase().includes(q) ||
        h.summary?.toLowerCase().includes(q) ||
        h.notes?.toLowerCase().includes(q)
      );
    }

    res.json({ calls: filtered });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] history error:", _msg);
    res.status(500).json({ error: "Failed to fetch call history" });
  }
});

router.post("/twilio/history/:callId/email-summary", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const callId = Number(req.params.callId);
    const calls = await db.select().from(callHistoryTable).where(and(eq(callHistoryTable.id, callId), eq(callHistoryTable.userId, userId))).limit(1);
    const call = calls[0];
    if (!call) {
      res.status(404).json({ error: "Call not found" });
      return;
    }

    const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const userEmail = (users[0] as { email?: string } | undefined)?.email;
    if (!userEmail) {
      res.status(400).json({ error: "No email on file" });
      return;
    }

    const { client, fromEmail } = await getUncachableResendClient();
    const html = `<div style="font-family:monospace;background:#030803;color:#00ff41;padding:24px;max-width:600px;">
<h2 style="color:#00ff41;letter-spacing:0.1em">[ CALL SUMMARY ]</h2>
<p><strong>With:</strong> ${call.callerName || call.recipientNumber}</p>
<p><strong>Date:</strong> ${new Date(call.startedAt).toLocaleString()}</p>
<p><strong>Duration:</strong> ${call.durationSeconds ?? 0}s</p>
<p><strong>Status:</strong> ${call.status}</p>
${call.summary ? `<h3 style="color:#00ff41">Summary</h3><p>${call.summary}</p>` : ""}
${call.transcript ? `<h3 style="color:#00ff41">Transcript</h3><pre style="white-space:pre-wrap;color:rgba(0,255,65,0.7)">${call.transcript}</pre>` : ""}
${call.notes ? `<h3 style="color:#00ff41">Notes</h3><p>${call.notes}</p>` : ""}
<p style="color:rgba(0,255,65,0.4);font-size:0.8em;margin-top:24px">Calll Home · Business Phone System</p>
</div>`;
    await client.emails.send({ from: fromEmail, to: [userEmail], subject: `Call Summary: ${call.callerName || call.recipientNumber}`, html });
    res.json({ ok: true });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] email summary error:", _msg);
    res.status(500).json({ error: "Failed to send email summary" });
  }
});

export default router;
