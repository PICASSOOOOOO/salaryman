import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, desc, and, asc, sql } from "drizzle-orm";
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
  pabloCallSessionsTable,
  pabloOutboundCampaignsTable,
  callCenterAgentsTable,
  inboundScreeningsTable,
  orgMembersTable,
  type InsertSecretaryConfig,
} from "@workspace/db";
import twilio from "twilio";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getUncachableResendClient } from "../lib/resend";
import { hasFeature } from "../lib/plan";
import { processPabloTurn, generateCallSummaryForSession, getOrCreateSession } from "../lib/pablo-call-agent";
import { updateLeadFromPabloCall, createOrUpdateLeadFromScreening } from "./leads";

const router = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const has = await hasFeature(req.user.id, req.user.email, "phone_system");
  if (!has) {
    res.status(403).json({ error: "Calll Home subscription required ($95/mo)", feature: "phone_system", price: 95, upgrade: "/upgrade" });
    return;
  }
  next();
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

async function matchContactByPhone(userId: string, phoneNumber: string): Promise<{ contactId: number; contactName: string } | null> {
  if (!userId || !phoneNumber) return null;
  try {
    const e164Phone = toE164(phoneNumber);
    if (!e164Phone) return null;
    const contacts = await db.select().from(contactsTable).where(eq(contactsTable.userId, userId)).limit(200);
    const match = contacts.find((c) => c.phone && toE164(c.phone) === e164Phone);
    if (match) return { contactId: match.id, contactName: match.name };
  } catch {}
  return null;
}

const HIPAA_RETENTION_DAYS = 2190;

function getRetentionDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + HIPAA_RETENTION_DAYS);
  return d;
}

const PABLO_VOICEMAIL_GREETING = "Thank you for calling. This is Pablo, your virtual office assistant. The person you are trying to reach is currently unavailable. Your call is important to us. Please leave a detailed message after the tone, including your name, number, and the reason for your call, and we will return your call as soon as possible. This call may be recorded for quality assurance and compliance purposes.";

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

router.get("/twilio/system-status", requireAuth, async (_req, res) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || !phoneNumber) {
    res.status(503).json({ status: "unconfigured", error: "Twilio credentials not configured. Contact admin." });
    return;
  }
  res.json({ status: "online" });
});

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

router.get("/twilio/token", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
    const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;
    if (!accountSid || !apiKeySid || !apiKeySecret) {
      res.status(503).json({ error: "Twilio API key not configured. Set TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET." });
      return;
    }
    if (!twimlAppSid) {
      res.status(503).json({ error: "TWILIO_TWIML_APP_SID not configured. Create a TwiML Application in Twilio Console and set this env var." });
      return;
    }
    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;
    const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, { identity: userId, ttl: 3600 });
    const voiceGrant = new VoiceGrant({ incomingAllow: true, outgoingApplicationSid: twimlAppSid });
    token.addGrant(voiceGrant);
    res.json({ token: token.toJwt(), identity: userId });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] token error:", _msg);
    res.status(500).json({ error: _msg });
  }
});

router.post("/twilio/twiml/client-voice", async (req, res) => {
  const confName = (req.body?.To ?? req.query?.To ?? "") as string;
  res.set("Content-Type", "text/xml");
  if (confName && confName.startsWith("conf-")) {
    res.send(`<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false">${escapeTwiml(confName)}</Conference></Dial></Response>`);
  } else {
    res.send(`<Response><Say>Unable to connect. Please try again.</Say></Response>`);
  }
});

router.post("/twilio/call", requireAuth, async (req, res) => {
  try {
    const { recipientNumber, callerName, contactName, contactId } = req.body;
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

    const confName = `conf-${userId}-${Date.now()}`;

    const _protocol = "https";
    const _host = process.env.APP_DOMAIN ?? process.env.REPLIT_DEV_DOMAIN ?? "";
    const _baseUrl = _host ? `${_protocol}://${_host}/api` : "/api";
    const _statusCallbackUrl = _host ? `${_baseUrl}/twilio/webhook/status` : undefined;
    const _recordingCallback = _host ? `${_baseUrl}/twilio/webhook/recording?userId=${encodeURIComponent(userId)}&type=call` : undefined;

    const twiml = `<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false" waitUrl="" record="record-from-start"${_recordingCallback ? ` recordingStatusCallback="${escapeTwiml(_recordingCallback)}" recordingStatusCallbackMethod="POST"` : ""}>${confName}</Conference></Dial></Response>`;

    const call = await client.calls.create({
      to: e164,
      from: fromNumber,
      twiml,
      ...(_statusCallbackUrl && {
        statusCallback: _statusCallbackUrl,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        statusCallbackMethod: "POST",
      }),
    });

    const orgId = await getUserOrgId(userId);
    let resolvedContactId = contactId ? Number(contactId) : undefined;
    let resolvedContactName = (contactName || callerName || "").slice(0, 64) || null;
    if (!resolvedContactId) {
      const crmMatch = await matchContactByPhone(userId, e164);
      if (crmMatch) {
        resolvedContactId = crmMatch.contactId;
        resolvedContactName = resolvedContactName || crmMatch.contactName;
      }
    }

    const [record] = await db
      .insert(callHistoryTable)
      .values({
        userId,
        orgId: orgId ?? undefined,
        callerName: resolvedContactName,
        recipientNumber: e164,
        twilioCallSid: call.sid,
        status: call.status ?? "initiated",
        direction: "outbound",
        callType: "conference",
        contactId: resolvedContactId,
        consentGiven: true,
        recordingRetainUntil: getRetentionDate(),
      })
      .returning();

    res.json({ ok: true, callSid: call.sid, callId: record.id, status: call.status, to: e164, conferenceName: confName });
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
      // For non-conference calls, move the call into a single-party conference so
      // real muting (participant-level) works without hanging up or re-dialing.
      const confName = `mute-${callSid}-${Date.now()}`;
      await client.calls(callSid).update({
        twiml: `<Response><Dial><Conference waitUrl="" beep="false" startConferenceOnEnter="true" endConferenceOnExit="true">${confName}</Conference></Dial></Response>`,
      });
      // Give Twilio a moment to create the conference, then mute if needed
      if (muted) {
        await new Promise(r => setTimeout(r, 600));
        try {
          const conferences = await client.conferences.list({ friendlyName: confName, status: "in-progress", limit: 1 });
          if (conferences[0]) {
            const parts = await client.conferences(conferences[0].sid).participants.list();
            const part = parts.find(p => p.callSid === callSid);
            if (part) {
              await client.conferences(conferences[0].sid).participants(callSid).update({ muted: true });
              console.log(`[CalllHome] mute: participant muted in conference ${conferences[0].sid}`);
            } else {
              console.warn(`[CalllHome] mute: participant ${callSid} not found in conference ${conferences[0].sid}`);
            }
          } else {
            console.warn(`[CalllHome] mute: conference ${confName} not yet in-progress after bridge transition`);
          }
        } catch (muteErr: unknown) {
          console.warn("[CalllHome] mute: best-effort conference mute failed:", muteErr instanceof Error ? muteErr.message : muteErr);
        }
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
      // For non-conference calls, move into a temporary conference so hold/resume
      // works via participant-level control rather than re-dialing a new outbound leg.
      if (hold) {
        const confName = `hold-${callSid}-${Date.now()}`;
        await client.calls(callSid).update({
          twiml: `<Response><Dial><Conference waitUrl="https://com.twilio.music.classical.s3.amazonaws.com/BachGavotteShort.mp3" beep="false" startConferenceOnEnter="true" endConferenceOnExit="true">${confName}</Conference></Dial></Response>`,
        });
        await new Promise(r => setTimeout(r, 600));
        try {
          const conferences = await client.conferences.list({ friendlyName: confName, status: "in-progress", limit: 1 });
          if (conferences[0]) {
            await client.conferences(conferences[0].sid).participants(callSid).update({ hold: true, holdUrl: "https://com.twilio.music.classical.s3.amazonaws.com/BachGavotteShort.mp3" });
            console.log(`[CalllHome] hold: participant held in conference ${conferences[0].sid}`);
          } else {
            console.warn(`[CalllHome] hold: conference ${confName} not yet in-progress after bridge transition`);
          }
        } catch (holdErr: unknown) {
          console.warn("[CalllHome] hold: best-effort conference hold failed:", holdErr instanceof Error ? holdErr.message : holdErr);
        }
      } else {
        // Resume: remove hold from conference participant (audio resumes in the conference bridge)
        try {
          const liveConfs = await client.conferences.list({ status: "in-progress", limit: 20 });
          let resumed = false;
          for (const conf of liveConfs) {
            if (conf.friendlyName.startsWith(`hold-${callSid}`)) {
              await client.conferences(conf.sid).participants(callSid).update({ hold: false });
              console.log(`[CalllHome] hold: participant resumed in conference ${conf.sid}`);
              resumed = true;
              break;
            }
          }
          if (!resumed) console.warn(`[CalllHome] hold: no active hold conference found for callSid ${callSid}`);
        } catch (resumeErr: unknown) {
          console.warn("[CalllHome] hold: best-effort resume failed:", resumeErr instanceof Error ? resumeErr.message : resumeErr);
        }
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
    const _confHost = process.env.APP_DOMAIN ?? process.env.REPLIT_DEV_DOMAIN ?? "";
    const _confStatusUrl = _confHost ? `https://${_confHost}/api/twilio/webhook/status` : undefined;
    const _confEventUrl = _confHost ? `https://${_confHost}/api/twilio/webhook/conference-status` : undefined;
    const confTwiml = _confEventUrl
      ? `<Response><Say voice="Google.en-US-Neural2-F">You are being connected to a conference call.</Say><Dial><Conference statusCallback="${_confEventUrl}" statusCallbackEvent="start end join leave mute hold" statusCallbackMethod="POST">${roomName}</Conference></Dial></Response>`
      : `<Response><Say voice="Google.en-US-Neural2-F">You are being connected to a conference call.</Say><Dial><Conference>${roomName}</Conference></Dial></Response>`;
    const call = await client.calls.create({
      to: e164,
      from: fromNumber,
      twiml: confTwiml,
      ...(_confStatusUrl && {
        statusCallback: _confStatusUrl,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        statusCallbackMethod: "POST",
      }),
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

    const settingsConcurrency = typeof settings?.concurrency === "number" ? Math.min(Math.max(settings.concurrency, 2), 5) : 3;
    let dialCount = mode === "predictive" ? Math.min(settingsConcurrency, numbers.length) : 1;
    const results: Array<{ ok: boolean; phone: string; name?: string; callSid?: string; error?: string; status?: string; conferenceName?: string }> = [];
    const _dialingHost = process.env.APP_DOMAIN ?? process.env.REPLIT_DEV_DOMAIN ?? "";
    const _dialingStatusUrl = _dialingHost ? `https://${_dialingHost}/api/twilio/webhook/status` : undefined;

    for (let i = 0; i < dialCount; i++) {
      const entry = numbers[i];
      const e164 = toE164(entry.phone);
      if (!e164) {
        results.push({ ok: false, phone: entry.phone, error: "Invalid number" });
        continue;
      }
      try {
        const confName = `conf-${userId}-${Date.now()}-${i}`;
        const twiml = mode === "auto" && settings?.recordingUrl
          ? `<Response><Play>${settings.recordingUrl}</Play><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false" waitUrl="">${confName}</Conference></Dial></Response>`
          : `<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false" waitUrl="">${confName}</Conference></Dial></Response>`;
        const call = await client.calls.create({
          to: e164,
          from: fromNumber,
          twiml,
          ...(_dialingStatusUrl && {
            statusCallback: _dialingStatusUrl,
            statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
            statusCallbackMethod: "POST",
          }),
        });
        const dialOrgId = await getUserOrgId(userId);
        const dialCrmMatch = await matchContactByPhone(userId, e164);
        await db.insert(callHistoryTable).values({
          userId,
          orgId: dialOrgId ?? undefined,
          callerName: (entry.name || callerName || "").slice(0, 64) || null,
          recipientNumber: e164,
          twilioCallSid: call.sid,
          status: call.status ?? "initiated",
          direction: "outbound",
          callType: mode + "_dialing",
          contactId: dialCrmMatch?.contactId,
          consentGiven: true,
          recordingRetainUntil: getRetentionDate(),
        });
        results.push({ ok: true, phone: e164, name: entry.name, callSid: call.sid, conferenceName: confName });
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
    const _nextHost = process.env.APP_DOMAIN ?? process.env.REPLIT_DEV_DOMAIN ?? "";
    const _nextStatusUrl = _nextHost ? `https://${_nextHost}/api/twilio/webhook/status` : undefined;
    const confName = `conf-${userId}-${Date.now()}`;
    const call = await client.calls.create({
      to: e164,
      from: fromNumber,
      twiml: `<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false" waitUrl="">${confName}</Conference></Dial></Response>`,
      ...(_nextStatusUrl && {
        statusCallback: _nextStatusUrl,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        statusCallbackMethod: "POST",
      }),
    });
    const nextOrgId = await getUserOrgId(userId);
    const nextCrmMatch = await matchContactByPhone(userId, e164);
    await db.insert(callHistoryTable).values({
      userId, orgId: nextOrgId ?? undefined, recipientNumber: e164, twilioCallSid: call.sid, callerName: entry.name ?? null,
      status: call.status ?? "initiated", direction: "outbound", callType: session.mode + "_dialing",
      contactId: nextCrmMatch?.contactId, consentGiven: true, recordingRetainUntil: getRetentionDate(),
    });
    await db.update(dialingSessionsTable).set({ dialedCount: dialed + 1 }).where(eq(dialingSessionsTable.id, sessionId));
    const sessionSettings = JSON.parse(session.settingsJson ?? "{}");
    const rawDelay = typeof sessionSettings.delayBetweenCalls === "number" ? sessionSettings.delayBetweenCalls : 5;
    const delayBetweenCalls = Math.min(Math.max(rawDelay, 0), 30);
    res.json({ ok: true, callSid: call.sid, phone: e164, name: entry.name, remaining: queue.length - dialed - 1, conferenceName: confName, delayBetweenCalls });
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

    const existingBySid = RecordingSid
      ? await db.select().from(voicemailsTable).where(eq(voicemailsTable.recordingSid, RecordingSid)).limit(1)
      : [];
    const existingByCall = !existingBySid.length && CallSid
      ? await db.select().from(voicemailsTable).where(eq(voicemailsTable.twilioCallSid, CallSid)).limit(1)
      : [];
    if (existingBySid.length > 0 || existingByCall.length > 0) {
      const existingVm = (existingBySid[0] ?? existingByCall[0])!;
      await db.update(voicemailsTable).set({
        recordingUrl: RecordingUrl ? `${RecordingUrl}.mp3` : existingVm.recordingUrl,
        recordingSid: RecordingSid ?? existingVm.recordingSid,
        durationSeconds: RecordingDuration ? Number(RecordingDuration) : existingVm.durationSeconds,
        transcript: hasTranscription ? transcript : existingVm.transcript,
      }).where(eq(voicemailsTable.id, existingVm.id));
      res.send('<Response></Response>');
      return;
    }

    const vmOrgId = await getUserOrgId(userId);
    const vmCrmMatch = await matchContactByPhone(userId, From);

    const [vm] = await db
      .insert(voicemailsTable)
      .values({
        userId,
        orgId: vmOrgId ?? undefined,
        fromNumber: From,
        twilioCallSid: CallSid,
        contactId: vmCrmMatch?.contactId,
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

    await sendMissedCallEmail(userId, From, vmCrmMatch?.contactName);
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
    const { From, CallSid } = req.body;
    const userId = req.query.userId as string;

    const host = process.env.APP_DOMAIN ?? process.env.REPLIT_DEV_DOMAIN ?? req.headers.host ?? "";
    const base = host ? `https://${host}/api` : "/api";

    const configRows = userId
      ? await db.select().from(secretaryConfigTable).where(eq(secretaryConfigTable.userId, userId)).limit(1)
      : [];
    const config = configRows[0] ?? null;

    let fromName: string | undefined;
    if (userId && From) {
      try {
        const contacts = await db.select().from(contactsTable).where(eq(contactsTable.userId, userId)).limit(100);
        const match = contacts.find((c) => c.phone && toE164(c.phone) === toE164(From));
        if (match) fromName = match.name;
      } catch {
      }
    }

    if (CallSid) {
      const inbOrgId = userId ? await getUserOrgId(userId) : null;
      const inbCrmMatch = userId && From ? await matchContactByPhone(userId, From) : null;
      await db.insert(callHistoryTable).values({
        userId: userId || "unknown",
        orgId: inbOrgId ?? undefined,
        callerName: inbCrmMatch?.contactName ?? fromName ?? null,
        recipientNumber: From ?? "unknown",
        twilioCallSid: CallSid,
        status: "ringing",
        direction: "inbound",
        callType: "single",
        contactId: inbCrmMatch?.contactId,
        consentGiven: true,
        recordingRetainUntil: getRetentionDate(),
      });
    }

    if (config?.isEnabled) {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const currentTime = hour * 60 + minute;
      const [startH, startM] = (config.businessHoursStart ?? "09:00").split(":").map(Number);
      const [endH, endM] = (config.businessHoursEnd ?? "17:00").split(":").map(Number);
      const startTime = startH * 60 + (startM ?? 0);
      const endTime = endH * 60 + (endM ?? 0);
      const dayOfWeek = now.getDay();
      const businessDays = (config.businessDays ?? "1,2,3,4,5").split(",").map(Number);
      const isDuringBusinessHours = businessDays.includes(dayOfWeek) && currentTime >= startTime && currentTime <= endTime;

      if (isDuringBusinessHours) {
        if (config.autoAnswer) {
          const greeting = config.greetingScript ?? "Thank you for calling. This is Pablo, your AI assistant. How can I help you today?";
          const twiml = `<Response>
<Start><Record recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId}&amp;type=pablo_full" recordingStatusCallbackMethod="POST" /></Start>
<Gather input="speech" timeout="5" action="${base}/twilio/pablo/gather?userId=${userId}" method="POST" speechTimeout="auto">
<Say voice="Google.en-US-Neural2-F">${escapeTwiml(greeting)}</Say>
</Gather>
<Say voice="Google.en-US-Neural2-F">I didn't catch that. Please leave a message after the tone.</Say>
<Record maxLength="120" transcribe="true" transcribeCallback="${base}/twilio/webhook/transcription" recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId}&amp;type=voicemail" recordingStatusCallbackMethod="POST" />
</Response>`;
          res.type("text/xml").send(twiml);
          return;
        }

        const personality = config.personality ?? "professional";
        const greeting = config.greetingScript ?? `Thank you for calling. This is Pablo, your virtual office assistant. How can I help you today?`;
        const screening = config.screeningRules ?? "Ask for the caller's name and the reason for their call.";
        const routing = config.routingInstructions ?? "";
        const twiml = `<Response>
<Gather input="speech" timeout="5" action="${base}/twilio/secretary/handle?userId=${userId}&amp;personality=${encodeURIComponent(personality)}&amp;screening=${encodeURIComponent(screening)}&amp;routing=${encodeURIComponent(routing)}" method="POST" speechTimeout="auto">
<Say voice="Google.en-US-Neural2-F">${escapeTwiml(greeting)}</Say>
</Gather>
<Say voice="Google.en-US-Neural2-F">I didn't catch that. Please leave a message after the tone.</Say>
<Record maxLength="120" transcribe="true" transcribeCallback="${base}/twilio/webhook/transcription" recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId}&amp;type=voicemail" recordingStatusCallbackMethod="POST" />
</Response>`;
        res.type("text/xml").send(twiml);
        return;
      }
    }

    const greeting = config?.greetingScript ?? PABLO_VOICEMAIL_GREETING;
    const twiml = `<Response>
<Say voice="Google.en-US-Neural2-F">${escapeTwiml(greeting)}</Say>
<Record maxLength="120" transcribe="true" transcribeCallback="${base}/twilio/webhook/transcription" recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId ?? ""}&amp;type=voicemail" recordingStatusCallbackMethod="POST" />
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

    const existingSecCalls = CallSid
      ? await db.select().from(callHistoryTable).where(eq(callHistoryTable.twilioCallSid, CallSid)).limit(1)
      : [];
    if (existingSecCalls[0]) {
      await db
        .update(callHistoryTable)
        .set({
          status: "in-progress",
          callType: "secretary",
          notes: existingSecCalls[0].notes
            ? `${existingSecCalls[0].notes}\nSecretary handled. Caller said: "${SpeechResult}"`
            : `Secretary handled. Caller said: "${SpeechResult}"`,
        })
        .where(eq(callHistoryTable.id, existingSecCalls[0].id));
    } else {
      const secOrgId = await getUserOrgId(userId);
      const secCrmMatch = From ? await matchContactByPhone(userId, From) : null;
      await db.insert(callHistoryTable).values({
        userId,
        orgId: secOrgId ?? undefined,
        callerName: secCrmMatch?.contactName ?? null,
        recipientNumber: From ?? "unknown",
        twilioCallSid: CallSid,
        status: "in-progress",
        direction: "inbound",
        callType: "secretary",
        contactId: secCrmMatch?.contactId,
        consentGiven: true,
        recordingRetainUntil: getRetentionDate(),
        notes: `Secretary handled. Caller said: "${SpeechResult}"`,
      });
    }

    const secHost = process.env.APP_DOMAIN ?? process.env.REPLIT_DEV_DOMAIN ?? "";
    const secBase = secHost ? `https://${secHost}/api` : "/api";

    const forwardTo = config?.forwardToNumber;
    let action = "";
    if (forwardTo && response.toLowerCase().includes("transfer")) {
      const safeForward = escapeTwiml(forwardTo);
      action = `<Dial>${safeForward}</Dial>`;
    } else {
      const safeResponse = escapeTwiml(response);
      action = `<Gather input="speech" timeout="5" action="${secBase}/twilio/secretary/handle?userId=${userId}&amp;personality=${encodeURIComponent(personality)}&amp;screening=${encodeURIComponent(screening)}&amp;routing=${encodeURIComponent(routing)}" method="POST" speechTimeout="auto"><Say voice="Google.en-US-Neural2-F">${safeResponse}</Say></Gather><Record maxLength="120" transcribe="true" transcribeCallback="${secBase}/twilio/webhook/transcription" recordingStatusCallback="${secBase}/twilio/webhook/recording?userId=${userId}&amp;type=voicemail" />`;
    }

    res.type("text/xml").send(`<Response>${action}</Response>`);
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] secretary handle error:", _msg);
    res.type("text/xml").send('<Response><Say>Thank you for calling. Please leave a message after the tone.</Say><Record maxLength="120" /></Response>');
  }
});

router.post("/twilio/pablo/gather", async (req, res) => {
  try {
    if (!validateTwilioWebhook(req)) {
      res.status(403).send("Forbidden");
      return;
    }
    const { SpeechResult, From, CallSid } = req.body;
    const userId = req.query.userId as string;

    if (!userId || !SpeechResult) {
      res.type("text/xml").send('<Response><Say voice="Google.en-US-Neural2-F">Thank you for calling. Goodbye.</Say><Hangup/></Response>');
      return;
    }

    const host = process.env.APP_DOMAIN ?? process.env.REPLIT_DEV_DOMAIN ?? req.headers.host ?? "";
    const base = host ? `https://${host}/api` : "/api";

    const action = await processPabloTurn(userId, CallSid, SpeechResult, From, "inbound");

    const safeResponse = escapeTwiml(action.response);

    if (action.type === "transfer" && action.transferTo) {
      const confName = `pablo-xfer-${CallSid}`;
      const safeConf = escapeTwiml(confName);
      try {
        const client = getTwilioClient();
        const userNumbers = await db.select().from(phoneNumbersTable).where(and(eq(phoneNumbersTable.userId, userId), eq(phoneNumbersTable.isActive, true))).limit(1);
        const fromNumber = userNumbers[0]?.number || process.env.TWILIO_PHONE_NUMBER || "";
        if (fromNumber) {
          client.calls.create({
            to: action.transferTo,
            from: fromNumber,
            twiml: `<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">${safeConf}</Conference></Dial></Response>`,
            statusCallback: `${base}/twilio/webhook/status?userId=${userId}`,
            statusCallbackMethod: "POST",
            statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
          }).catch((e: unknown) => console.error("[Pablo] transfer dial error:", e instanceof Error ? e.message : "Unknown"));
        }
      } catch (e: unknown) {
        console.error("[Pablo] transfer setup error:", e instanceof Error ? e.message : "Unknown");
      }
      res.type("text/xml").send(`<Response><Say voice="Google.en-US-Neural2-F">${safeResponse}</Say><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false" waitUrl="">${safeConf}</Conference></Dial></Response>`);
      generateCallSummaryForSession(CallSid).catch(() => {});
      updateLeadFromPabloCall(From, userId, "transfer", action.response, null).catch(() => {});
      await db.update(callHistoryTable).set({ callType: "pablo_transfer" }).where(and(eq(callHistoryTable.twilioCallSid, CallSid), eq(callHistoryTable.userId, userId)));
      return;
    }

    if (action.type === "end_call" || action.type === "take_message") {
      let twiml = `<Response><Say voice="Google.en-US-Neural2-F">${safeResponse}</Say>`;
      if (action.type === "take_message") {
        twiml += `<Record maxLength="120" transcribe="true" transcribeCallback="${base}/twilio/webhook/transcription" recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId}&amp;type=voicemail" recordingStatusCallbackMethod="POST" />`;
      }
      twiml += `</Response>`;
      res.type("text/xml").send(twiml);
      generateCallSummaryForSession(CallSid).catch(() => {});
      updateLeadFromPabloCall(From, userId, action.type, action.response, null).catch(() => {});
      return;
    }

    res.type("text/xml").send(`<Response>
<Gather input="speech" timeout="5" action="${base}/twilio/pablo/gather?userId=${userId}" method="POST" speechTimeout="auto">
<Say voice="Google.en-US-Neural2-F">${safeResponse}</Say>
</Gather>
<Say voice="Google.en-US-Neural2-F">I didn't catch that. Could you repeat that?</Say>
<Gather input="speech" timeout="5" action="${base}/twilio/pablo/gather?userId=${userId}" method="POST" speechTimeout="auto">
<Say voice="Google.en-US-Neural2-F">Are you still there?</Say>
</Gather>
<Say voice="Google.en-US-Neural2-F">Thank you for calling. Goodbye.</Say>
</Response>`);
  } catch (err: unknown) {
    console.error("[Pablo] gather error:", err instanceof Error ? err.message : "Unknown");
    res.type("text/xml").send('<Response><Say voice="Google.en-US-Neural2-F">I apologize, but I\'m having trouble right now. Please try again later.</Say></Response>');
  }
});

router.post("/twilio/pablo/screening-gather", async (req, res) => {
  try {
    if (!validateTwilioWebhook(req)) {
      res.status(403).send("Forbidden");
      return;
    }
    const { SpeechResult, From, CallSid } = req.body;
    const userId = req.query.userId as string;
    const timeLimit = parseInt(req.query.timeLimit as string) || 120;
    const startTime = parseInt(req.query.startTime as string) || Date.now();

    if (!userId || !SpeechResult) {
      res.type("text/xml").send('<Response><Say voice="Google.en-US-Neural2-F">Thank you for calling. Goodbye.</Say><Hangup/></Response>');
      return;
    }

    const host = process.env.APP_DOMAIN ?? process.env.REPLIT_DEV_DOMAIN ?? req.headers.host ?? "";
    const base = host ? `https://${host}/api` : "/api";

    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    if (elapsedSeconds >= timeLimit) {
      const twiml = `<Response>
<Say voice="Google.en-US-Neural2-F">Thank you for your patience. Let me connect you with an available agent now.</Say>
<Redirect method="POST">${base}/twilio/pablo/screening-transfer?userId=${userId}&amp;callSid=${CallSid}</Redirect>
</Response>`;
      res.type("text/xml").send(twiml);

      await db.update(inboundScreeningsTable).set({
        outcome: "timeout_transfer",
        screeningDurationSeconds: elapsedSeconds,
        completedAt: new Date(),
      }).where(and(eq(inboundScreeningsTable.twilioCallSid, CallSid), eq(inboundScreeningsTable.userId, userId)));
      return;
    }

    const action = await processPabloTurn(userId, CallSid, SpeechResult, From, "screening");
    const safeResponse = escapeTwiml(action.response);

    const session = await getOrCreateSession(userId, CallSid, From, "screening");
    const pabloSessionId = session?.id ?? null;

    if (action.type === "transfer") {
      const screeningDuration = Math.floor((Date.now() - startTime) / 1000);
      const extractedJson = action.extractedInfo ? JSON.stringify(action.extractedInfo) : null;
      const contactId = await upsertScreeningContact(userId, From, action.extractedInfo);
      await db.update(inboundScreeningsTable).set({
        callerName: action.extractedInfo?.callerName ?? null,
        screeningDurationSeconds: screeningDuration,
        extractedData: extractedJson,
        contactId,
        pabloSessionId,
        summary: action.extractedInfo ? `${action.extractedInfo.callerName ?? "Unknown"} from ${action.extractedInfo.company ?? "N/A"} — ${action.extractedInfo.reason ?? "No reason given"}` : null,
      }).where(and(eq(inboundScreeningsTable.twilioCallSid, CallSid), eq(inboundScreeningsTable.userId, userId)));

      createOrUpdateLeadFromScreening(From, userId, "transfer", action.extractedInfo ?? null).catch(() => {});

      res.type("text/xml").send(`<Response>
<Say voice="Google.en-US-Neural2-F">${safeResponse}</Say>
<Redirect method="POST">${base}/twilio/pablo/screening-transfer?userId=${userId}&amp;callSid=${CallSid}</Redirect>
</Response>`);
      generateCallSummaryForSession(CallSid).catch(() => {});
      return;
    }

    if (action.type === "end_call" || action.type === "take_message") {
      const screeningDuration = Math.floor((Date.now() - startTime) / 1000);
      const extractedJson = action.extractedInfo ? JSON.stringify(action.extractedInfo) : null;
      const contactId = await upsertScreeningContact(userId, From, action.extractedInfo);
      await db.update(inboundScreeningsTable).set({
        outcome: "ended",
        callerName: action.extractedInfo?.callerName ?? null,
        screeningDurationSeconds: screeningDuration,
        completedAt: new Date(),
        extractedData: extractedJson,
        contactId,
        pabloSessionId,
        summary: action.extractedInfo ? `${action.extractedInfo.callerName ?? "Unknown"} — ${action.extractedInfo.reason ?? "N/A"}` : null,
      }).where(and(eq(inboundScreeningsTable.twilioCallSid, CallSid), eq(inboundScreeningsTable.userId, userId)));

      createOrUpdateLeadFromScreening(From, userId, action.type, action.extractedInfo ?? null).catch(() => {});

      let twiml = `<Response><Say voice="Google.en-US-Neural2-F">${safeResponse}</Say>`;
      if (action.type === "take_message") {
        twiml += `<Record maxLength="120" transcribe="true" transcribeCallback="${base}/twilio/webhook/transcription" recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId}&amp;type=voicemail" recordingStatusCallbackMethod="POST" />`;
      }
      twiml += `</Response>`;
      res.type("text/xml").send(twiml);
      generateCallSummaryForSession(CallSid).catch(() => {});
      return;
    }

    res.type("text/xml").send(`<Response>
<Gather input="speech" timeout="5" action="${base}/twilio/pablo/screening-gather?userId=${userId}&amp;timeLimit=${timeLimit}&amp;startTime=${startTime}" method="POST" speechTimeout="auto">
<Say voice="Google.en-US-Neural2-F">${safeResponse}</Say>
</Gather>
<Say voice="Google.en-US-Neural2-F">I didn't catch that. Could you repeat that?</Say>
<Gather input="speech" timeout="5" action="${base}/twilio/pablo/screening-gather?userId=${userId}&amp;timeLimit=${timeLimit}&amp;startTime=${startTime}" method="POST" speechTimeout="auto">
<Say voice="Google.en-US-Neural2-F">Are you still there?</Say>
</Gather>
<Redirect method="POST">${base}/twilio/pablo/screening-transfer?userId=${userId}&amp;callSid=${CallSid}</Redirect>
</Response>`);
  } catch (err: unknown) {
    console.error("[Pablo] screening-gather error:", err instanceof Error ? err.message : "Unknown");
    res.type("text/xml").send('<Response><Say voice="Google.en-US-Neural2-F">I apologize for the difficulty. Let me connect you now.</Say></Response>');
  }
});

router.post("/twilio/pablo/screening-transfer", async (req, res) => {
  try {
    if (!validateTwilioWebhook(req)) {
      res.status(403).send("Forbidden");
      return;
    }
    const userId = req.query.userId as string;
    const callSid = (req.query.callSid as string) || req.body.CallSid;

    if (!userId) {
      res.type("text/xml").send('<Response><Say voice="Google.en-US-Neural2-F">Sorry, we could not connect you. Please try again later.</Say><Hangup/></Response>');
      return;
    }

    const host = process.env.APP_DOMAIN ?? process.env.REPLIT_DEV_DOMAIN ?? req.headers.host ?? "";
    const base = host ? `https://${host}/api` : "/api";

    const agent = await getNextRoundRobinAgent(userId);

    if (!agent) {
      const configs = await db.select().from(secretaryConfigTable).where(eq(secretaryConfigTable.userId, userId)).limit(1);
      const fallback = configs[0]?.forwardToNumber;
      if (fallback) {
        await db.update(inboundScreeningsTable).set({
          outcome: "transferred",
          agentName: "Fallback",
          completedAt: new Date(),
        }).where(and(eq(inboundScreeningsTable.twilioCallSid, callSid), eq(inboundScreeningsTable.userId, userId)));

        res.type("text/xml").send(`<Response>
<Say voice="Google.en-US-Neural2-F">Let me connect you now. Please hold.</Say>
<Dial callerId="${getTwilioNumber()}" timeout="30" action="${base}/twilio/webhook/status?userId=${userId}">
<Number>${escapeTwiml(fallback)}</Number>
</Dial>
</Response>`);
        return;
      }

      await db.update(inboundScreeningsTable).set({
        outcome: "no_agent",
        completedAt: new Date(),
      }).where(and(eq(inboundScreeningsTable.twilioCallSid, callSid), eq(inboundScreeningsTable.userId, userId)));

      res.type("text/xml").send(`<Response>
<Say voice="Google.en-US-Neural2-F">I'm sorry, but no agents are currently available. Please leave a message after the tone and someone will get back to you shortly.</Say>
<Record maxLength="120" transcribe="true" transcribeCallback="${base}/twilio/webhook/transcription" recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId}&amp;type=voicemail" recordingStatusCallbackMethod="POST" />
</Response>`);
      return;
    }

    await db.update(callCenterAgentsTable).set({
      lastCallAt: new Date(),
      totalCalls: sql`${callCenterAgentsTable.totalCalls} + 1`,
    }).where(eq(callCenterAgentsTable.id, agent.id));

    await db.update(inboundScreeningsTable).set({
      outcome: "transferred",
      agentId: agent.id,
      agentName: agent.name,
      transferredToPhone: agent.phone,
      completedAt: new Date(),
    }).where(and(eq(inboundScreeningsTable.twilioCallSid, callSid), eq(inboundScreeningsTable.userId, userId)));

    const confName = `screening_${callSid}_${Date.now()}`;
    const client = getTwilioClient();
    client.calls.create({
      to: agent.phone,
      from: getTwilioNumber(),
      twiml: `<Response><Say voice="Google.en-US-Neural2-F">Incoming screened call for you. Connecting now.</Say><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">${escapeTwiml(confName)}</Conference></Dial></Response>`,
      statusCallback: `${base}/twilio/webhook/status?userId=${userId}`,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    }).catch(err => console.error("[Pablo] conference agent dial error:", err instanceof Error ? err.message : "Unknown"));

    res.type("text/xml").send(`<Response>
<Say voice="Google.en-US-Neural2-F">I'll connect you with ${escapeTwiml(agent.name)} now. Please hold for just a moment.</Say>
<Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false" waitUrl="http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical">${escapeTwiml(confName)}</Conference></Dial>
</Response>`);
  } catch (err: unknown) {
    console.error("[Pablo] screening-transfer error:", err instanceof Error ? err.message : "Unknown");
    res.type("text/xml").send('<Response><Say voice="Google.en-US-Neural2-F">I apologize for the difficulty. Please try again later.</Say><Hangup/></Response>');
  }
});

router.post("/twilio/pablo/outbound/gather", async (req, res) => {
  try {
    if (!validateTwilioWebhook(req)) {
      res.status(403).send("Forbidden");
      return;
    }
    const { SpeechResult, To, CallSid } = req.body;
    const userId = req.query.userId as string;
    const campaignId = req.query.campaignId as string;

    if (!userId || !SpeechResult) {
      res.type("text/xml").send('<Response><Say voice="Google.en-US-Neural2-F">Thank you for your time. Goodbye.</Say><Hangup/></Response>');
      return;
    }

    const host = process.env.APP_DOMAIN ?? process.env.REPLIT_DEV_DOMAIN ?? req.headers.host ?? "";
    const base = host ? `https://${host}/api` : "/api";

    let outboundScript: string | undefined;
    if (campaignId && userId) {
      const campaigns = await db.select().from(pabloOutboundCampaignsTable).where(and(eq(pabloOutboundCampaignsTable.id, parseInt(campaignId)), eq(pabloOutboundCampaignsTable.userId, userId))).limit(1);
      outboundScript = campaigns[0]?.script ?? undefined;
    }
    if (!outboundScript) {
      const configs = await db.select().from(secretaryConfigTable).where(eq(secretaryConfigTable.userId, userId)).limit(1);
      outboundScript = configs[0]?.outboundScript ?? undefined;
    }

    const action = await processPabloTurn(userId, CallSid, SpeechResult, To, "outbound", outboundScript);
    const safeResponse = escapeTwiml(action.response);

    if (action.type === "end_call" || action.type === "take_message" || action.type === "create_lead") {
      res.type("text/xml").send(`<Response><Say voice="Google.en-US-Neural2-F">${safeResponse}</Say></Response>`);
      generateCallSummaryForSession(CallSid).catch(() => {});
      updateLeadFromPabloCall(To, userId, action.type, action.response, null).catch(() => {});
      return;
    }

    res.type("text/xml").send(`<Response>
<Gather input="speech" timeout="5" action="${base}/twilio/pablo/outbound/gather?userId=${userId}&amp;campaignId=${campaignId || ""}" method="POST" speechTimeout="auto">
<Say voice="Google.en-US-Neural2-F">${safeResponse}</Say>
</Gather>
<Say voice="Google.en-US-Neural2-F">Thank you for your time. Goodbye.</Say>
</Response>`);
  } catch (err: unknown) {
    console.error("[Pablo] outbound gather error:", err instanceof Error ? err.message : "Unknown");
    res.type("text/xml").send('<Response><Say voice="Google.en-US-Neural2-F">Thank you for your time. Goodbye.</Say></Response>');
  }
});

router.post("/twilio/pablo/outbound/dial", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const { phoneNumber, leadName, campaignId, script } = req.body;

    if (!phoneNumber) {
      res.status(400).json({ error: "Phone number is required" });
      return;
    }

    const userNumbers = await db.select().from(phoneNumbersTable).where(and(eq(phoneNumbersTable.userId, userId), eq(phoneNumbersTable.isActive, true))).limit(1);
    if (!userNumbers[0]) {
      res.status(400).json({ error: "No active phone number found. Configure one in Phone Numbers." });
      return;
    }

    const secConfigs = await db.select().from(secretaryConfigTable).where(eq(secretaryConfigTable.userId, userId)).limit(1);
    const outboundDid = secConfigs[0]?.outboundDid ?? null;
    const fromNumber = outboundDid || userNumbers[0].number;

    const client = getTwilioClient();
    const host = process.env.APP_DOMAIN ?? process.env.REPLIT_DEV_DOMAIN ?? req.headers.host ?? "";
    const base = host ? `https://${host}/api` : "/api";

    const outboundScript = script ?? "";
    const greeting = outboundScript
      ? `Hello, this is Pablo calling on behalf of our team. ${outboundScript.split('.')[0]}.`
      : `Hello, this is Pablo, an AI assistant calling on behalf of our team. Do you have a moment to chat?`;

    const call = await client.calls.create({
      to: phoneNumber,
      from: fromNumber,
      twiml: `<Response><Start><Record recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId}&amp;type=pablo_full" recordingStatusCallbackMethod="POST" /></Start><Gather input="speech" timeout="5" action="${base}/twilio/pablo/outbound/gather?userId=${userId}&amp;campaignId=${campaignId || ""}" method="POST" speechTimeout="auto"><Say voice="Google.en-US-Neural2-F">${escapeTwiml(greeting)}</Say></Gather><Say voice="Google.en-US-Neural2-F">Thank you for your time. Goodbye.</Say></Response>`,
      statusCallback: `${base}/twilio/webhook/status?userId=${userId}`,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    });

    const pabloOrgId = await getUserOrgId(userId);
    const pabloCrmMatch = await matchContactByPhone(userId, phoneNumber);
    await db.insert(callHistoryTable).values({
      userId,
      orgId: pabloOrgId ?? undefined,
      callerName: leadName || null,
      recipientNumber: phoneNumber,
      twilioCallSid: call.sid,
      status: "initiated",
      direction: "outbound",
      callType: "pablo_agent",
      contactId: pabloCrmMatch?.contactId,
      consentGiven: true,
      recordingRetainUntil: getRetentionDate(),
    });

    res.json({ ok: true, callSid: call.sid });
  } catch (err: unknown) {
    console.error("[Pablo] outbound dial error:", err instanceof Error ? err.message : "Unknown");
    res.status(500).json({ error: "Failed to initiate outbound call" });
  }
});

router.get("/twilio/pablo/campaigns", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const campaigns = await db.select().from(pabloOutboundCampaignsTable).where(eq(pabloOutboundCampaignsTable.userId, userId)).orderBy(desc(pabloOutboundCampaignsTable.createdAt));
    res.json({ campaigns });
  } catch {
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

router.post("/twilio/pablo/campaigns", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const { name, script, leadsJson, scheduleJson } = req.body;

    if (!name || !script || !leadsJson) {
      res.status(400).json({ error: "Name, script, and leads are required" });
      return;
    }

    const [campaign] = await db.insert(pabloOutboundCampaignsTable).values({
      userId,
      name,
      script,
      leadsJson,
      scheduleJson: scheduleJson ?? null,
      status: "draft",
      totalLeads: JSON.parse(leadsJson).length,
    }).returning();

    res.json({ ok: true, campaign });
  } catch (err: unknown) {
    console.error("[Pablo] campaign create error:", err instanceof Error ? err.message : "Unknown");
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

router.post("/twilio/pablo/campaigns/:id/start", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const campaignId = parseInt(req.params.id as string);

    const campaigns = await db.select().from(pabloOutboundCampaignsTable).where(and(eq(pabloOutboundCampaignsTable.id, campaignId), eq(pabloOutboundCampaignsTable.userId, userId))).limit(1);
    if (!campaigns[0]) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    const campaign = campaigns[0];
    const leads: Array<{ phone: string; name?: string }> = JSON.parse(campaign.leadsJson ?? "[]");

    if (leads.length === 0) {
      res.status(400).json({ error: "No leads in campaign" });
      return;
    }

    const userNumbers = await db.select().from(phoneNumbersTable).where(and(eq(phoneNumbersTable.userId, userId), eq(phoneNumbersTable.isActive, true))).limit(1);
    if (!userNumbers[0]) {
      res.status(400).json({ error: "No active phone number" });
      return;
    }

    const secConfigs = await db.select().from(secretaryConfigTable).where(eq(secretaryConfigTable.userId, userId)).limit(1);
    const campaignFromNumber = secConfigs[0]?.outboundDid || userNumbers[0].number;

    if (campaign.scheduleJson) {
      try {
        const schedule = JSON.parse(campaign.scheduleJson);
        if (schedule.startTime && schedule.endTime) {
          const now = new Date();
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          const [sH, sM] = (schedule.startTime as string).split(":").map(Number);
          const [eH, eM] = (schedule.endTime as string).split(":").map(Number);
          if (currentMinutes < sH * 60 + (sM ?? 0) || currentMinutes > eH * 60 + (eM ?? 0)) {
            res.status(400).json({ error: `Campaign scheduled for ${schedule.startTime} - ${schedule.endTime}. Current time is outside schedule.` });
            return;
          }
        }
      } catch {}
    }

    await db.update(pabloOutboundCampaignsTable).set({ status: "active", updatedAt: new Date() }).where(eq(pabloOutboundCampaignsTable.id, campaignId));

    const [dialingSession] = await db.insert(dialingSessionsTable).values({
      userId,
      mode: "pablo",
      status: "active",
      totalNumbers: leads.length,
      queueJson: JSON.stringify(leads),
      settingsJson: JSON.stringify({ campaignId, script: campaign.script }),
    }).returning();

    const client = getTwilioClient();
    const host = process.env.APP_DOMAIN ?? process.env.REPLIT_DEV_DOMAIN ?? req.headers.host ?? "";
    const base = host ? `https://${host}/api` : "/api";
    const greeting = campaign.script.split('.')[0] + ".";
    let dialed = 0;
    const batchSize = Math.min(leads.length, 50);

    for (const lead of leads.slice(0, batchSize)) {
      try {
        const call = await client.calls.create({
          to: lead.phone,
          from: campaignFromNumber,
          twiml: `<Response><Start><Record recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId}&amp;type=pablo_full" recordingStatusCallbackMethod="POST" /></Start><Gather input="speech" timeout="5" action="${base}/twilio/pablo/outbound/gather?userId=${userId}&amp;campaignId=${campaignId}" method="POST" speechTimeout="auto"><Say voice="Google.en-US-Neural2-F">Hello${lead.name ? `, ${escapeTwiml(lead.name)}` : ""}. ${escapeTwiml(greeting)}</Say></Gather><Say voice="Google.en-US-Neural2-F">Thank you for your time. Goodbye.</Say></Response>`,
          statusCallback: `${base}/twilio/webhook/status?userId=${userId}`,
          statusCallbackMethod: "POST",
          statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        });
        const campOrgId = await getUserOrgId(userId);
        await db.insert(callHistoryTable).values({
          userId,
          orgId: campOrgId ?? undefined,
          callerName: lead.name || null,
          recipientNumber: lead.phone,
          twilioCallSid: call.sid,
          status: "initiated",
          direction: "outbound",
          callType: "pablo_agent",
          consentGiven: true,
          recordingRetainUntil: getRetentionDate(),
        });
        dialed++;
      } catch (e: unknown) {
        console.error(`[Pablo] campaign dial error for ${lead.phone}:`, e instanceof Error ? e.message : "Unknown");
      }
    }

    await db.update(pabloOutboundCampaignsTable).set({ dialedCount: dialed }).where(eq(pabloOutboundCampaignsTable.id, campaignId));
    await db.update(dialingSessionsTable).set({ dialedCount: dialed, status: dialed >= leads.length ? "completed" : "active" }).where(eq(dialingSessionsTable.id, dialingSession.id));

    if (dialed >= leads.length) {
      await db.update(pabloOutboundCampaignsTable).set({ status: "completed", updatedAt: new Date() }).where(eq(pabloOutboundCampaignsTable.id, campaignId));
    }

    res.json({ ok: true, dialed, total: leads.length, dialingSessionId: dialingSession.id });
  } catch (err: unknown) {
    console.error("[Pablo] campaign start error:", err instanceof Error ? err.message : "Unknown");
    res.status(500).json({ error: "Failed to start campaign" });
  }
});

router.get("/twilio/call-center/agents", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const agents = await db.select().from(callCenterAgentsTable).where(eq(callCenterAgentsTable.userId, userId)).orderBy(callCenterAgentsTable.createdAt);
    res.json({ agents });
  } catch {
    res.status(500).json({ error: "Failed to fetch agents" });
  }
});

router.post("/twilio/call-center/agents", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const { name, phone, email } = req.body;
    if (!name || !phone) {
      res.status(400).json({ error: "Name and phone are required" });
      return;
    }
    const e164 = toE164(phone);
    if (!e164) {
      res.status(400).json({ error: "Invalid phone number" });
      return;
    }
    const [agent] = await db.insert(callCenterAgentsTable).values({
      userId, name, phone: e164, email: email || null,
    }).returning();
    res.json({ ok: true, agent });
  } catch (err: unknown) {
    console.error("[CallCenter] add agent error:", err instanceof Error ? err.message : "Unknown");
    res.status(500).json({ error: "Failed to add agent" });
  }
});

router.post("/twilio/call-center/agents/:id/toggle", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const agentId = parseInt(req.params.id as string);
    const agents = await db.select().from(callCenterAgentsTable).where(and(eq(callCenterAgentsTable.id, agentId), eq(callCenterAgentsTable.userId, userId))).limit(1);
    if (!agents[0]) { res.status(404).json({ error: "Agent not found" }); return; }
    const [updated] = await db.update(callCenterAgentsTable).set({ isActive: !agents[0].isActive }).where(eq(callCenterAgentsTable.id, agentId)).returning();
    res.json({ ok: true, agent: updated });
  } catch {
    res.status(500).json({ error: "Failed to toggle agent" });
  }
});

router.delete("/twilio/call-center/agents/:id", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const agentId = parseInt(req.params.id as string);
    await db.delete(callCenterAgentsTable).where(and(eq(callCenterAgentsTable.id, agentId), eq(callCenterAgentsTable.userId, userId)));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to remove agent" });
  }
});

async function upsertScreeningContact(userId: string, callerPhone: string, extracted?: { callerName?: string; company?: string; reason?: string } | null): Promise<number | null> {
  try {
    const e164 = toE164(callerPhone) ?? callerPhone;
    const contacts = await db.select().from(contactsTable).where(eq(contactsTable.userId, userId)).limit(200);
    const match = contacts.find(c => c.phone && (toE164(c.phone) === e164 || c.phone === callerPhone));
    if (match) {
      return match.id;
    }
    const name = extracted?.callerName || callerPhone;
    const [newContact] = await db.insert(contactsTable).values({
      userId,
      name,
      phone: e164,
      company: extracted?.company || "",
    }).returning();
    if (newContact?.id) {
      await db.insert(contactInteractionsTable).values({
        contactId: newContact.id,
        userId,
        type: "call",
        note: `Inbound screening call. Reason: ${extracted?.reason ?? "Not captured"}`,
      });
    }
    return newContact?.id ?? null;
  } catch (e: unknown) {
    console.error("[Pablo] screening contact upsert error:", e instanceof Error ? e.message : "Unknown");
    return null;
  }
}

async function getNextRoundRobinAgent(userId: string) {
  const agents = await db.select().from(callCenterAgentsTable)
    .where(and(eq(callCenterAgentsTable.userId, userId), eq(callCenterAgentsTable.isActive, true)))
    .orderBy(sql`${callCenterAgentsTable.lastCallAt} ASC NULLS FIRST`, asc(callCenterAgentsTable.id))
    .limit(1);
  return agents[0] ?? null;
}

router.get("/twilio/call-center/screenings", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const screenings = await db.select().from(inboundScreeningsTable).where(eq(inboundScreeningsTable.userId, userId)).orderBy(desc(inboundScreeningsTable.createdAt)).limit(50);
    res.json({ screenings });
  } catch {
    res.status(500).json({ error: "Failed to fetch screenings" });
  }
});

router.get("/twilio/call-center/metrics", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const activeAgents = await db.select({ count: sql<number>`count(*)` }).from(callCenterAgentsTable).where(and(eq(callCenterAgentsTable.userId, userId), eq(callCenterAgentsTable.isActive, true)));
    const totalScreenings = await db.select({ count: sql<number>`count(*)` }).from(inboundScreeningsTable).where(eq(inboundScreeningsTable.userId, userId));
    const transferred = await db.select({ count: sql<number>`count(*)` }).from(inboundScreeningsTable).where(and(eq(inboundScreeningsTable.userId, userId), eq(inboundScreeningsTable.outcome, "transferred")));
    const ended = await db.select({ count: sql<number>`count(*)` }).from(inboundScreeningsTable).where(and(eq(inboundScreeningsTable.userId, userId), eq(inboundScreeningsTable.outcome, "ended")));
    const avgTime = await db.select({ avg: sql<number>`coalesce(avg(screening_duration_seconds), 0)` }).from(inboundScreeningsTable).where(eq(inboundScreeningsTable.userId, userId));
    res.json({
      activeAgents: Number(activeAgents[0]?.count ?? 0),
      totalScreenings: Number(totalScreenings[0]?.count ?? 0),
      transferred: Number(transferred[0]?.count ?? 0),
      ended: Number(ended[0]?.count ?? 0),
      avgScreenTime: Math.round(Number(avgTime[0]?.avg ?? 0)),
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch metrics" });
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
      autoAnswer, qualificationQuestions, transferRouting,
      outboundScript, outboundSchedule,
      inboundDid, outboundDid, screeningTimeLimit, screeningScript,
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
      ...(autoAnswer !== undefined && { autoAnswer }),
      ...(qualificationQuestions !== undefined && { qualificationQuestions }),
      ...(transferRouting !== undefined && { transferRouting }),
      ...(outboundScript !== undefined && { outboundScript }),
      ...(outboundSchedule !== undefined && { outboundSchedule }),
      ...(inboundDid !== undefined && { inboundDid }),
      ...(outboundDid !== undefined && { outboundDid }),
      ...(screeningTimeLimit !== undefined && { screeningTimeLimit }),
      ...(screeningScript !== undefined && { screeningScript }),
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
    const protocol = process.env.NODE_ENV === "production" ? "https" : "https";
    const host = process.env.APP_DOMAIN ?? process.env.REPLIT_DEV_DOMAIN ?? "";
    const statusCallbackUrl = host ? `${protocol}://${host}/api/twilio/webhook/status` : undefined;
    const results = await Promise.allSettled(
      numbers.map(async (entry: { phone: string; name?: string }) => {
        const e164 = toE164(entry.phone);
        if (!e164) return { ok: false, phone: entry.phone, error: "Invalid number" };
        const batchConfName = `conf-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const call = await client.calls.create({
          to: e164,
          from: fromNumber,
          twiml: `<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false" waitUrl="">${batchConfName}</Conference></Dial></Response>`,
          ...(statusCallbackUrl && {
            statusCallback: statusCallbackUrl,
            statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
            statusCallbackMethod: "POST",
          }),
        });
        const batchOrgId = await getUserOrgId(userId);
        const batchCrmMatch = await matchContactByPhone(userId, e164);
        const [record] = await db
          .insert(callHistoryTable)
          .values({
            userId,
            orgId: batchOrgId ?? undefined,
            callerName: (entry.name || callerName || "").slice(0, 64) || null,
            recipientNumber: e164,
            twilioCallSid: call.sid,
            status: call.status ?? "initiated",
            direction: "outbound",
            callType: "batch",
            contactId: batchCrmMatch?.contactId,
            consentGiven: true,
            recordingRetainUntil: getRetentionDate(),
          })
          .returning();
        return { ok: true, phone: e164, name: entry.name, callSid: call.sid, callId: record.id, status: call.status, conferenceName: batchConfName };
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

router.post("/twilio/call-status-batch", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const { callSids } = req.body;
    if (!Array.isArray(callSids) || callSids.length === 0) {
      res.status(400).json({ error: "callSids array required" });
      return;
    }
    const client = getTwilioClient();
    const results = await Promise.allSettled(
      callSids.map(async (callSid: string) => {
        const owned = await verifyCallOwnership(userId, callSid);
        if (!owned) return { callSid, error: "not authorized" };
        const call = await client.calls(callSid).fetch();
        const isEnded = ["completed", "failed", "busy", "no-answer", "canceled"].includes(call.status);
        await db
          .update(callHistoryTable)
          .set({
            status: call.status,
            durationSeconds: call.duration ? parseInt(call.duration, 10) : undefined,
            endedAt: isEnded ? new Date() : undefined,
          })
          .where(and(eq(callHistoryTable.twilioCallSid, callSid), eq(callHistoryTable.userId, userId)));
        return { callSid: call.sid, status: call.status, duration: call.duration };
      })
    );
    const statuses = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return { callSid: callSids[i], error: (r.reason as Error)?.message ?? "Failed" };
    });
    res.json({ ok: true, statuses });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] batch status error:", _msg);
    res.status(500).json({ error: "Failed to fetch batch call status" });
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

router.get("/twilio/webhook-config", requireAuth, async (req, res) => {
  const host = process.env.APP_DOMAIN ?? process.env.REPLIT_DEV_DOMAIN ?? req.headers.host ?? "";
  const base = host ? `https://${host}/api` : "/api";
  const userId = getAuthUserId(req);
  res.json({
    webhookUrls: {
      voiceUrl: `${base}/twilio/webhook/voice?userId=${userId}`,
      statusCallback: `${base}/twilio/webhook/status`,
      smsUrl: `${base}/twilio/webhook/sms?userId=${userId}`,
      recordingCallback: `${base}/twilio/webhook/recording`,
      transcriptionCallback: `${base}/twilio/webhook/transcription`,
      conferenceStatusCallback: `${base}/twilio/webhook/conference-status`,
    },
    instructions: {
      voiceUrl: "Set as the Voice URL (HTTP POST) for your Twilio phone number to handle inbound calls.",
      statusCallback: "Optionally set as the Status Callback URL on your Twilio phone number for call lifecycle events.",
      smsUrl: "Set as the Messaging URL (HTTP POST) for your Twilio phone number to receive inbound SMS.",
      recordingCallback: "Used automatically by the app when creating recordings via the inbound voice webhook.",
      transcriptionCallback: "Used automatically by the app when enabling transcription on recorded calls.",
      conferenceStatusCallback: "Pass this URL when creating conference participants to track join/leave events.",
    },
  });
});

router.post("/twilio/webhook/voice", async (req, res) => {
  try {
    if (!validateTwilioWebhook(req)) {
      console.error("[CalllHome] webhook/voice: invalid Twilio signature");
      res.status(403).send("Forbidden");
      return;
    }
    const { From, To, CallSid } = req.body;
    const userId = req.query.userId as string;

    const host = process.env.APP_DOMAIN ?? process.env.REPLIT_DEV_DOMAIN ?? req.headers.host ?? "";
    const base = host ? `https://${host}/api` : "/api";

    const configRows = userId
      ? await db.select().from(secretaryConfigTable).where(eq(secretaryConfigTable.userId, userId)).limit(1)
      : [];
    const config = configRows[0] ?? null;

    let fromName: string | undefined;
    let inbCrmContactId: number | undefined;
    if (userId && From) {
      try {
        const crmMatch = await matchContactByPhone(userId, From);
        if (crmMatch) {
          fromName = crmMatch.contactName;
          inbCrmContactId = crmMatch.contactId;
        }
      } catch {
      }
    }

    const inbOrgId2 = userId ? await getUserOrgId(userId) : null;

    await db.insert(callHistoryTable).values({
      userId: userId || "unknown",
      orgId: inbOrgId2 ?? undefined,
      callerName: fromName ?? null,
      recipientNumber: From ?? "unknown",
      twilioCallSid: CallSid,
      status: "ringing",
      direction: "inbound",
      callType: "single",
      contactId: inbCrmContactId,
      consentGiven: true,
      recordingRetainUntil: getRetentionDate(),
    });

    const isInboundDidCall = config?.inboundDid && To && toE164(To) === toE164(config.inboundDid);

    if (isInboundDidCall && config && userId) {
      const screeningGreeting = config.screeningScript
        ?? "Thank you for calling. This is Pablo, I'll be helping to connect you with the right person. May I ask who's calling and what this is regarding?";
      await db.insert(inboundScreeningsTable).values({
        userId,
        twilioCallSid: CallSid,
        callerNumber: From ?? "unknown",
        callerName: fromName ?? null,
        outcome: "screening",
      });
      const timeLimit = config.screeningTimeLimit ?? 120;
      const twiml = `<Response>
<Gather input="speech" timeout="5" action="${base}/twilio/pablo/screening-gather?userId=${userId}&amp;timeLimit=${timeLimit}&amp;startTime=${Date.now()}" method="POST" speechTimeout="auto">
<Say voice="Google.en-US-Neural2-F">${escapeTwiml(screeningGreeting)}</Say>
</Gather>
<Say voice="Google.en-US-Neural2-F">I didn't catch that. Let me transfer you now.</Say>
<Redirect method="POST">${base}/twilio/pablo/screening-transfer?userId=${userId}&amp;callSid=${CallSid}</Redirect>
</Response>`;
      res.type("text/xml").send(twiml);
      return;
    }

    if (config?.isEnabled) {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const currentTime = hour * 60 + minute;
      const [startH, startM] = (config.businessHoursStart ?? "09:00").split(":").map(Number);
      const [endH, endM] = (config.businessHoursEnd ?? "17:00").split(":").map(Number);
      const startTime = startH * 60 + (startM ?? 0);
      const endTime = endH * 60 + (endM ?? 0);
      const dayOfWeek = now.getDay();
      const businessDays = (config.businessDays ?? "1,2,3,4,5").split(",").map(Number);
      const isDuringBusinessHours = businessDays.includes(dayOfWeek) && currentTime >= startTime && currentTime <= endTime;

      if (isDuringBusinessHours) {
        if (config.autoAnswer) {
          const greeting = config.greetingScript ?? "Thank you for calling. This is Pablo, your AI assistant. How can I help you today?";
          const twiml = `<Response>
<Start><Record recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId}&amp;type=pablo_full" recordingStatusCallbackMethod="POST" /></Start>
<Gather input="speech" timeout="5" action="${base}/twilio/pablo/gather?userId=${userId}" method="POST" speechTimeout="auto">
<Say voice="Google.en-US-Neural2-F">${escapeTwiml(greeting)}</Say>
</Gather>
<Say voice="Google.en-US-Neural2-F">I didn't catch that. Please leave a message after the tone.</Say>
<Record maxLength="120" transcribe="true" transcribeCallback="${base}/twilio/webhook/transcription" recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId}&amp;type=voicemail" recordingStatusCallbackMethod="POST" />
</Response>`;
          res.type("text/xml").send(twiml);
          return;
        }

        const personality = config.personality ?? "professional";
        const greeting = config.greetingScript ?? `Thank you for calling. This is Pablo, your virtual office assistant. How can I help you today?`;
        const screening = config.screeningRules ?? "Ask for the caller's name and the reason for their call.";
        const routing = config.routingInstructions ?? "";
        const twiml = `<Response>
<Gather input="speech" timeout="5" action="${base}/twilio/secretary/handle?userId=${userId}&amp;personality=${encodeURIComponent(personality)}&amp;screening=${encodeURIComponent(screening)}&amp;routing=${encodeURIComponent(routing)}" method="POST" speechTimeout="auto">
<Say voice="Google.en-US-Neural2-F">${escapeTwiml(greeting)}</Say>
</Gather>
<Say voice="Google.en-US-Neural2-F">I didn't catch that. Please leave a message after the tone.</Say>
<Record maxLength="120" transcribe="true" transcribeCallback="${base}/twilio/webhook/transcription" recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId}&amp;type=voicemail" recordingStatusCallbackMethod="POST" />
</Response>`;
        res.type("text/xml").send(twiml);
        return;
      }
    }

    const greeting = config?.greetingScript ?? PABLO_VOICEMAIL_GREETING;
    const twiml = `<Response>
<Say voice="Google.en-US-Neural2-F">${escapeTwiml(greeting)}</Say>
<Record maxLength="120" transcribe="true" transcribeCallback="${base}/twilio/webhook/transcription" recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId ?? ""}&amp;type=voicemail" recordingStatusCallbackMethod="POST" />
</Response>`;
    res.type("text/xml").send(twiml);
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] webhook/voice error:", _msg);
    res.type("text/xml").send("<Response><Say>An error occurred. Please try again later.</Say></Response>");
  }
});

router.post("/twilio/webhook/status", async (req, res) => {
  try {
    if (!validateTwilioWebhook(req)) {
      console.error("[CalllHome] webhook/status: invalid Twilio signature");
      res.status(403).send("Forbidden");
      return;
    }
    const {
      CallSid,
      CallStatus,
      CallDuration,
      From,
      To,
      Direction,
    } = req.body;

    if (!CallSid || !CallStatus) {
      res.status(400).send("Missing params");
      return;
    }

    const terminalStatuses = ["completed", "failed", "busy", "no-answer", "canceled"];
    const isTerminal = terminalStatuses.includes(CallStatus);

    const updated = await db
      .update(callHistoryTable)
      .set({
        status: CallStatus,
        ...(CallDuration && { durationSeconds: parseInt(CallDuration, 10) }),
        ...(isTerminal && { endedAt: new Date() }),
      })
      .where(eq(callHistoryTable.twilioCallSid, CallSid))
      .returning();

    if (updated.length === 0 && Direction === "inbound") {
      const existing = await db
        .select({ id: callHistoryTable.id })
        .from(callHistoryTable)
        .where(and(eq(callHistoryTable.twilioCallSid, CallSid), eq(callHistoryTable.direction, "inbound")))
        .limit(1);
      if (existing.length === 0) {
        let resolvedUserId: string | null = null;
        if (To) {
          try {
            const e164To = toE164(To) ?? To;
            const phoneRows = await db
              .select({ userId: phoneNumbersTable.userId })
              .from(phoneNumbersTable)
              .where(eq(phoneNumbersTable.number, e164To))
              .limit(1);
            if (phoneRows[0]) resolvedUserId = phoneRows[0].userId;
          } catch {
          }
        }
        if (resolvedUserId) {
          try {
            const fallbackOrgId = await getUserOrgId(resolvedUserId);
            await db.insert(callHistoryTable).values({
              userId: resolvedUserId,
              orgId: fallbackOrgId ?? undefined,
              recipientNumber: From ?? "unknown",
              twilioCallSid: CallSid,
              status: CallStatus,
              direction: "inbound",
              callType: "single",
              consentGiven: true,
              recordingRetainUntil: getRetentionDate(),
              ...(CallDuration && { durationSeconds: parseInt(CallDuration, 10) }),
              ...(isTerminal && { endedAt: new Date() }),
            });
            console.log(`[CalllHome] webhook/status: created fallback inbound record for ${CallSid} userId=${resolvedUserId} status=${CallStatus}`);
          } catch (insertErr: unknown) {
            console.warn(`[CalllHome] webhook/status: fallback insert skipped (likely race) for ${CallSid}:`, insertErr instanceof Error ? insertErr.message : "Unknown");
          }
        } else {
          console.log(`[CalllHome] webhook/status: no record found for inbound call ${CallSid}, status=${CallStatus}, To=${To}`);
        }
      }
    }

    if (isTerminal && (CallStatus === "no-answer" || CallStatus === "busy" || CallStatus === "failed")) {
      const records = await db
        .select()
        .from(callHistoryTable)
        .where(eq(callHistoryTable.twilioCallSid, CallSid))
        .limit(1);
      const record = records[0];
      if (record && record.direction === "inbound") {
        await sendMissedCallEmail(record.userId, From ?? record.recipientNumber, record.callerName ?? undefined);
      }
    }

    res.status(204).send();
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] webhook/status error:", _msg);
    res.status(500).send("Error");
  }
});

router.post("/twilio/webhook/recording", async (req, res) => {
  try {
    if (!validateTwilioWebhook(req)) {
      console.error("[CalllHome] webhook/recording: invalid Twilio signature");
      res.status(403).send("Forbidden");
      return;
    }
    const {
      RecordingUrl,
      RecordingSid,
      CallSid,
      From: FromField,
      RecordingDuration,
      RecordingStatus,
    } = req.body;
    const userId = req.query.userId as string;
    const recordingType = req.query.type as string;

    if (RecordingStatus && RecordingStatus !== "completed") {
      res.status(204).send();
      return;
    }

    let fromNumber = FromField as string | undefined;

    if (!fromNumber && CallSid) {
      const callRows = await db
        .select()
        .from(callHistoryTable)
        .where(eq(callHistoryTable.twilioCallSid, CallSid))
        .limit(1);
      if (callRows[0]) fromNumber = callRows[0].recipientNumber;
    }

    if (recordingType === "voicemail" && userId) {
      const transcript = `[Voicemail from ${fromNumber ?? "unknown"} - ${new Date().toLocaleString()}]`;

      let fromName: string | undefined;
      let crmContactId: number | undefined;
      if (fromNumber) {
        try {
          const crmMatch = await matchContactByPhone(userId, fromNumber);
          if (crmMatch) {
            fromName = crmMatch.contactName;
            crmContactId = crmMatch.contactId;
          }
        } catch {
        }
      }

      const orgId = await getUserOrgId(userId);

      const existingVmBySid = RecordingSid
        ? await db.select().from(voicemailsTable).where(eq(voicemailsTable.recordingSid, RecordingSid)).limit(1)
        : [];
      const existingVmByCall = !existingVmBySid.length && CallSid
        ? await db.select().from(voicemailsTable).where(eq(voicemailsTable.twilioCallSid, CallSid)).limit(1)
        : [];
      const existingVm = existingVmBySid.length ? existingVmBySid : existingVmByCall;

      if (existingVm.length === 0) {
        const [vm] = await db
          .insert(voicemailsTable)
          .values({
            userId,
            orgId: orgId ?? undefined,
            fromNumber: fromNumber ?? "unknown",
            fromName: fromName ?? undefined,
            twilioCallSid: CallSid,
            contactId: crmContactId,
            recordingUrl: RecordingUrl ? `${RecordingUrl}.mp3` : undefined,
            recordingSid: RecordingSid,
            durationSeconds: RecordingDuration ? Number(RecordingDuration) : 0,
            transcript,
          })
          .returning();

        await sendMissedCallEmail(userId, fromNumber ?? "unknown", fromName);
        console.log(`[CalllHome] webhook/recording: voicemail created id=${vm.id} from=${fromNumber} orgId=${orgId}`);
      } else {
        await db
          .update(voicemailsTable)
          .set({
            recordingUrl: RecordingUrl ? `${RecordingUrl}.mp3` : undefined,
            durationSeconds: RecordingDuration ? Number(RecordingDuration) : 0,
            orgId: orgId ?? undefined,
            contactId: crmContactId,
          })
          .where(eq(voicemailsTable.id, existingVm[0].id));
      }
    } else if (CallSid && RecordingUrl) {
      await db
        .update(callHistoryTable)
        .set({
          recordingUrl: `${RecordingUrl}.mp3`,
          recordingSid: RecordingSid ?? undefined,
        })
        .where(eq(callHistoryTable.twilioCallSid, CallSid));
    }

    res.status(204).send();
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] webhook/recording error:", _msg);
    res.status(500).send("Error");
  }
});

router.post("/twilio/webhook/transcription", async (req, res) => {
  try {
    if (!validateTwilioWebhook(req)) {
      console.error("[CalllHome] webhook/transcription: invalid Twilio signature");
      res.status(403).send("Forbidden");
      return;
    }
    const { CallSid, TranscriptionText, TranscriptionStatus, RecordingSid } = req.body;

    if (TranscriptionStatus !== "completed" || !TranscriptionText) {
      res.status(204).send();
      return;
    }

    if (CallSid) {
      const callRows = await db
        .select()
        .from(callHistoryTable)
        .where(eq(callHistoryTable.twilioCallSid, CallSid))
        .limit(1);
      if (callRows[0]) {
        const summary = await generateCallSummary(TranscriptionText).catch(() => "");
        await db
          .update(callHistoryTable)
          .set({ transcript: TranscriptionText, ...(summary && { summary }) })
          .where(eq(callHistoryTable.id, callRows[0].id));
      }
    }

    if (RecordingSid) {
      const vmRows = await db
        .select()
        .from(voicemailsTable)
        .where(eq(voicemailsTable.recordingSid, RecordingSid))
        .limit(1);
      if (vmRows[0]) {
        const summary = await generateCallSummary(TranscriptionText).catch(() => "");
        await db
          .update(voicemailsTable)
          .set({ transcript: TranscriptionText, ...(summary && { summary }) })
          .where(eq(voicemailsTable.id, vmRows[0].id));
      }
    }

    res.status(204).send();
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] webhook/transcription error:", _msg);
    res.status(500).send("Error");
  }
});

router.post("/twilio/webhook/sms", async (req, res) => {
  try {
    if (!validateTwilioWebhook(req)) {
      console.error("[CalllHome] webhook/sms: invalid Twilio signature");
      res.status(403).send("Forbidden");
      return;
    }
    const { From, To, Body, MessageSid, NumMedia } = req.body;
    const userId = req.query.userId as string;

    if (!From || !Body) {
      res.type("text/xml").send("<Response></Response>");
      return;
    }

    let fromName: string | undefined;
    let contactId: number | undefined;

    if (userId) {
      try {
        const e164From = toE164(From) ?? From;
        const contacts = await db.select().from(contactsTable).where(eq(contactsTable.userId, userId)).limit(200);
        const match = contacts.find((c) => c.phone && (toE164(c.phone) === e164From || c.phone === From));
        if (match) {
          fromName = match.name;
          contactId = match.id;
        } else {
          const [newContact] = await db
            .insert(contactsTable)
            .values({
              userId,
              name: From,
              phone: e164From,
            })
            .returning();
          contactId = newContact.id;
          fromName = From;
        }
      } catch (e: unknown) {
        console.error("[CalllHome] webhook/sms: contact lookup/create error:", e instanceof Error ? e.message : "Unknown");
      }
    }

    if (contactId && userId) {
      await db.insert(contactInteractionsTable).values({
        contactId,
        userId,
        type: "sms",
        note: `Inbound SMS from ${fromName ?? From}: ${Body}`,
      });
    } else if (!userId) {
      console.warn(`[CalllHome] webhook/sms: no userId in query, SMS from ${From} not persisted to DB`);
    }

    console.log(`[CalllHome] webhook/sms: inbound SMS from ${fromName ?? From} (${From}) to ${To}: ${Body.slice(0, 100)}`);

    res.type("text/xml").send("<Response></Response>");
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] webhook/sms error:", _msg);
    res.type("text/xml").send("<Response></Response>");
  }
});

router.post("/twilio/webhook/conference-status", async (req, res) => {
  try {
    if (!validateTwilioWebhook(req)) {
      console.error("[CalllHome] webhook/conference-status: invalid Twilio signature");
      res.status(403).send("Forbidden");
      return;
    }
    const {
      ConferenceSid,
      FriendlyName,
      StatusCallbackEvent,
      CallSid,
      Muted,
      Hold,
      EndConferenceOnExit,
    } = req.body;

    if (!FriendlyName) {
      res.status(204).send();
      return;
    }

    const rooms = await db
      .select()
      .from(conferenceRoomsTable)
      .where(eq(conferenceRoomsTable.roomName, FriendlyName))
      .limit(1);
    const room = rooms[0];

    if (!room) {
      res.status(204).send();
      return;
    }

    if (ConferenceSid && !room.twilioConferenceSid) {
      await db
        .update(conferenceRoomsTable)
        .set({ twilioConferenceSid: ConferenceSid })
        .where(eq(conferenceRoomsTable.id, room.id));
    }

    if (StatusCallbackEvent === "participant-join" || StatusCallbackEvent === "participant-leave") {
      const participants: Array<{ callSid: string; phone: string; name: string; muted: boolean; hold: boolean }> = JSON.parse(room.participantsJson ?? "[]");

      if (StatusCallbackEvent === "participant-join") {
        const existing = participants.find((p) => p.callSid === CallSid);
        if (!existing && CallSid) {
          participants.push({ callSid: CallSid, phone: "", name: CallSid, muted: Muted === "true", hold: Hold === "true" });
        }
      } else if (StatusCallbackEvent === "participant-leave") {
        const idx = participants.findIndex((p) => p.callSid === CallSid);
        if (idx !== -1) participants.splice(idx, 1);
      }

      await db
        .update(conferenceRoomsTable)
        .set({ participantsJson: JSON.stringify(participants) })
        .where(eq(conferenceRoomsTable.id, room.id));
    }

    if (StatusCallbackEvent === "conference-end") {
      await db
        .update(conferenceRoomsTable)
        .set({ status: "ended", endedAt: new Date() })
        .where(eq(conferenceRoomsTable.id, room.id));
    }

    res.status(204).send();
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] webhook/conference-status error:", _msg);
    res.status(500).send("Error");
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

router.get("/twilio/admin/org-calls", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const orgId = await getUserOrgId(userId);
    if (!orgId) {
      res.status(403).json({ error: "No organization membership found" });
      return;
    }

    const membership = await db
      .select()
      .from(orgMembersTable)
      .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.status, "active")))
      .limit(1);
    const role = membership[0]?.role;
    if (role !== "owner" && role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const calls = await db
      .select()
      .from(callHistoryTable)
      .where(eq(callHistoryTable.orgId, orgId))
      .orderBy(desc(callHistoryTable.startedAt))
      .limit(limit)
      .offset(offset);

    const voicemails = await db
      .select()
      .from(voicemailsTable)
      .where(eq(voicemailsTable.orgId, orgId))
      .orderBy(desc(voicemailsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const totalCalls = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(callHistoryTable)
      .where(eq(callHistoryTable.orgId, orgId));

    const totalVoicemails = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(voicemailsTable)
      .where(eq(voicemailsTable.orgId, orgId));

    const recordedCalls = calls.filter((c) => c.recordingUrl);

    res.json({
      orgId,
      calls,
      voicemails,
      recordings: recordedCalls.map((c) => ({
        id: c.id,
        callSid: c.twilioCallSid,
        recordingUrl: c.recordingUrl,
        recordingSid: c.recordingSid,
        callerName: c.callerName,
        recipientNumber: c.recipientNumber,
        direction: c.direction,
        durationSeconds: c.durationSeconds,
        startedAt: c.startedAt,
        contactId: c.contactId,
        consentGiven: c.consentGiven,
        retainUntil: c.recordingRetainUntil,
      })),
      totalCalls: totalCalls[0]?.count ?? 0,
      totalVoicemails: totalVoicemails[0]?.count ?? 0,
      hipaaCompliance: {
        encryptionAtRest: true,
        retentionPolicyDays: HIPAA_RETENTION_DAYS,
        consentTracked: true,
        auditLogged: true,
      },
    });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] admin org-calls error:", _msg);
    res.status(500).json({ error: "Failed to fetch org calls" });
  }
});

export default router;
