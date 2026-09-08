import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, desc, and, asc, sql, gte, inArray } from "drizzle-orm";
import {
  db,
  callHistoryTable,
  contactsTable,
  voicemailsTable,
  phoneNumbersTable, phoneNumberPurchasesTable,
  secretaryConfigTable,
  dialingSessionsTable,
  conferenceRoomsTable,
  appointmentsTable,
  contactInteractionsTable,
  usersTable,
  notificationsTable,
  pabloCallSessionsTable,
  pabloOutboundCampaignsTable,
  callCenterAgentsTable,
  inboundScreeningsTable,
  orgMembersTable,
  systemConfigTable,
  smsConversationsTable,
  smsMessagesTable,
  type InsertSecretaryConfig,
} from "@workspace/db";
import twilio from "twilio";
import { randomBytes } from "crypto";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getOpenAiTextModel } from "../lib/openai-models";
import { MILA_VOICE_ID } from "../lib/mila-voice";
import { getUncachableResendClient } from "../lib/resend";
import { hasFeature } from "../lib/plan";
import { requireFeature } from "../middlewares/requirePro";
import { processPabloTurn, generateCallSummaryForSession, getOrCreateSession } from "../lib/pablo-call-agent";
import { updateLeadFromPabloCall, createOrUpdateLeadFromScreening } from "./leads";
import { recordTelephonyActivity } from "../lib/crm-recorder";
import { toE164, SUPPORTED_COUNTRIES, regulatoryRequirement, getCountryInfo, isSupportedCountry, countryForCity, DEFAULT_COUNTRY } from "../lib/phone";
import { resolveUserCountry, resolveUserCity, resolveOwningNumberCountry } from "../lib/phone-context";
import { getUserOutboundNumber } from "../lib/phone-number-service";
import { canUsePlatformTwilio } from "../lib/platform-twilio-access";
import { ObjectStorageService } from "../lib/objectStorage";
import { resolveTelephonyOwner } from "../lib/telephony-owner";

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
  if (!(await canUsePlatformTwilio(String(req.user.id), req.user.email))) {
    res.status(403).json({
      error: "Platform phone system is restricted to authorized organizations. Connect your own Twilio API credentials in Settings to enable phone features.",
      code: "TWILIO_ORG_RESTRICTED",
    });
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


function getAppHost(req?: Request): string {
  if (process.env.APP_DOMAIN) return process.env.APP_DOMAIN;
  if (process.env.REPLIT_DEPLOYMENT_URL) return process.env.REPLIT_DEPLOYMENT_URL.replace(/^https?:\/\//, "");
  if (process.env.REPLIT_DOMAINS) return process.env.REPLIT_DOMAINS.split(",")[0].trim();
  if (process.env.REPLIT_DEV_DOMAIN) return process.env.REPLIT_DEV_DOMAIN;
  const rawHost = req?.headers?.host as string | undefined;
  return rawHost ? rawHost.split(",")[0].trim() : "";
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

  const rawProto = (req.headers["x-forwarded-proto"] as string) ?? "https";
  const protocol = rawProto.split(",")[0].trim();
  const rawHost = (req.headers.host as string) ?? "";
  const host = rawHost.split(",")[0].trim();
  const url = `${protocol}://${host}${req.originalUrl}`;

  const valid = twilio.validateRequest(authToken, signature, url, req.body ?? {});
  if (!valid) {
    const appDomain = getAppHost(req);
    if (appDomain && appDomain !== host) {
      const altUrl = `https://${appDomain}${req.originalUrl}`;
      const altValid = twilio.validateRequest(authToken, signature, altUrl, req.body ?? {});
      if (altValid) return true;
    }
    console.warn("[Twilio] Webhook signature mismatch. URL tried:", url);
  }
  return valid;
}

function escapeTwiml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// ── Mila phone voice (ElevenLabs via <Play>) ────────────────────────────────
// Twilio can't speak ElevenLabs voices natively, so we cache each spoken line
// under a random token and serve a freshly-synthesized MP3 from
// /twilio/voice/mila/:token that Twilio fetches with <Play>. Falls back to a
// Google neural <Say> when no ElevenLabs key is configured.
// IMPORTANT: pass RAW (unescaped) text — escaping/encoding is handled here.
const milaTtsCache = new Map<string, { text: string; expires: number }>();
const MILA_TTS_TTL_MS = 5 * 60 * 1000;
const MILA_TTS_MAX_ENTRIES = 500;

function cacheMilaLine(text: string): string {
  const now = Date.now();
  for (const [k, v] of milaTtsCache) {
    if (v.expires <= now) milaTtsCache.delete(k);
  }
  while (milaTtsCache.size >= MILA_TTS_MAX_ENTRIES) {
    const oldest = milaTtsCache.keys().next().value;
    if (oldest === undefined) break;
    milaTtsCache.delete(oldest);
  }
  const token = randomBytes(16).toString("hex");
  milaTtsCache.set(token, { text, expires: now + MILA_TTS_TTL_MS });
  return token;
}

function milaVoice(text: string): string {
  const clean = (text ?? "").trim();
  if (!clean) return "";
  const host = getAppHost();
  if (process.env.ELEVENLABS_API_KEY && host) {
    const token = cacheMilaLine(clean);
    return `<Play>https://${host}/api/twilio/voice/mila/${token}</Play>`;
  }
  return `<Say voice="Google.en-US-Neural2-F">${escapeTwiml(clean)}</Say>`;
}

// Public (Twilio-fetched) endpoint that streams Mila's ElevenLabs MP3 for a
// previously-cached line. No auth: tokens are random + short-lived; the only
// thing exposed is the line's own audio.
router.all("/twilio/voice/mila/:token", async (req, res) => {
  try {
    const token = req.params.token;
    const entry = milaTtsCache.get(token);
    if (!entry || entry.expires <= Date.now()) {
      milaTtsCache.delete(token);
      res.status(404).send("expired");
      return;
    }
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) {
      res.status(503).send("tts unavailable");
      return;
    }
    const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${MILA_VOICE_ID}`, {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text: entry.text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
          style: 0.2,
          use_speaker_boost: true,
        },
      }),
    });
    if (!elRes.ok) {
      const errBody = await elRes.text().catch(() => "");
      console.warn("[Mila voice] ElevenLabs failed:", elRes.status, errBody.slice(0, 200));
      res.status(502).send("tts failed");
      return;
    }
    const buffer = Buffer.from(await elRes.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "no-store");
    res.end(buffer);
  } catch (err: unknown) {
    console.error("[Mila voice] error:", err instanceof Error ? err.message : "Unknown");
    res.status(502).send("tts error");
  }
});

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

async function matchContactByPhone(userId: string, phoneNumber: string, countryOverride?: string): Promise<{ contactId: number; contactName: string } | null> {
  if (!userId || !phoneNumber) return null;
  try {
    // Normalize BOTH sides with the same country default so a local Vietnamese
    // contact ("09…") matches an inbound "+84…" the same way a US contact does —
    // comparison stays internally consistent. Inbound webhooks pass the OWNING
    // (dialed) number's country so a VN line matches VN-stored contacts even for
    // a user whose home city is elsewhere; otherwise fall back to the user's
    // home country.
    const country = countryOverride ?? await resolveUserCountry(userId);
    const e164Phone = toE164(phoneNumber, country);
    if (!e164Phone) return null;
    const contacts = await db.select().from(contactsTable).where(eq(contactsTable.userId, userId)).limit(200);
    const match = contacts.find((c) => c.phone && toE164(c.phone, country) === e164Phone);
    if (match) return { contactId: match.id, contactName: match.name };
  } catch {}
  return null;
}

const RECORDING_RETENTION_DAYS = 1095;

function getRetentionDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + RECORDING_RETENTION_DAYS);
  return d;
}

async function archiveTwilioRecording(recordingUrl: string): Promise<string> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) throw new Error("Twilio credentials not configured");
  const upstream = await fetch(`${recordingUrl}.mp3`, {
    headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` },
  });
  if (!upstream.ok) throw new Error(`Twilio recording download failed (${upstream.status})`);
  const bytes = Buffer.from(await upstream.arrayBuffer());
  if (!bytes.length) throw new Error("Twilio recording was empty");
  return new ObjectStorageService().uploadBuffer(bytes, upstream.headers.get("content-type") ?? "audio/mpeg");
}

const PABLO_VOICEMAIL_GREETING = "Thank you for calling. This is Mila, your virtual office assistant. The person you are trying to reach is currently unavailable. Your call is important to us. Please leave a detailed message after the tone, including your name, number, and the reason for your call, and we will return your call as soon as possible. This call may be recorded for quality assurance and compliance purposes.";

async function generateCallSummary(transcript: string): Promise<string> {
  if (!transcript || transcript.trim().length < 20) return "";
  try {
    const completion = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 300,
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

router.get("/twilio/system-status", requireAuth, requireFeature("phone_system"), async (_req, res) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || !phoneNumber) {
    res.status(503).json({ status: "unconfigured", error: "Twilio credentials not configured. Contact admin." });
    return;
  }
  res.json({ status: "online" });
});

router.get("/twilio/contacts/:userId", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

let _cachedApiKey: { sid: string; secret: string } | null = null;
let _cachedTwimlAppSid: string | null = null;

async function getSystemConfig(key: string): Promise<string | null> {
  const rows = await db.select().from(systemConfigTable).where(eq(systemConfigTable.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

async function setSystemConfig(key: string, value: string): Promise<void> {
  const existing = await db.select().from(systemConfigTable).where(eq(systemConfigTable.key, key)).limit(1);
  if (existing.length > 0) {
    await db.update(systemConfigTable).set({ value, updatedAt: new Date() }).where(eq(systemConfigTable.key, key));
  } else {
    await db.insert(systemConfigTable).values({ key, value, category: "twilio", description: "Auto-provisioned by Salaryman" });
  }
}

async function ensureTwilioApiKey(): Promise<{ sid: string; secret: string }> {
  if (process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET) {
    return { sid: process.env.TWILIO_API_KEY_SID, secret: process.env.TWILIO_API_KEY_SECRET };
  }
  if (_cachedApiKey) return _cachedApiKey;
  const dbSid = await getSystemConfig("twilio_api_key_sid");
  const dbSecret = await getSystemConfig("twilio_api_key_secret");
  if (dbSid && dbSecret) {
    _cachedApiKey = { sid: dbSid, secret: dbSecret };
    process.env.TWILIO_API_KEY_SID = dbSid;
    process.env.TWILIO_API_KEY_SECRET = dbSecret;
    console.log("[Twilio] Restored API Key from DB:", dbSid);
    return _cachedApiKey;
  }
  const client = getTwilioClient();
  const key = await client.newKeys.create({ friendlyName: "Salaryman Voice Key" });
  _cachedApiKey = { sid: key.sid, secret: key.secret! };
  process.env.TWILIO_API_KEY_SID = key.sid;
  process.env.TWILIO_API_KEY_SECRET = key.secret!;
  await setSystemConfig("twilio_api_key_sid", key.sid);
  await setSystemConfig("twilio_api_key_secret", key.secret!);
  console.log("[Twilio] Auto-provisioned API Key:", key.sid, "(persisted to DB)");
  return _cachedApiKey;
}

async function ensureTwimlApp(): Promise<string> {
  if (_cachedTwimlAppSid) return _cachedTwimlAppSid;

  const domain = getAppHost();
  const voiceUrl = domain ? `https://${domain}/api/twilio/twiml/client-voice` : "";
  console.log("[Twilio] Resolved domain for TwiML App:", domain || "(none)");

  const dbAppSid = await getSystemConfig("twilio_twiml_app_sid");
  const configuredSid = process.env.TWILIO_TWIML_APP_SID;
  const candidates = [...new Set([dbAppSid, configuredSid].filter((sid): sid is string => Boolean(sid)))];
  const client = getTwilioClient();
  for (const candidateSid of candidates) {
    try {
      const existingApp = await client.applications(candidateSid).fetch();
      if (voiceUrl && (existingApp.voiceUrl !== voiceUrl || (existingApp.voiceMethod || "POST").toUpperCase() !== "POST")) {
        await client.applications(candidateSid).update({ voiceUrl, voiceMethod: "POST" });
        console.log("[Twilio] Updated TwiML App voice callback.");
      }
      _cachedTwimlAppSid = candidateSid;
      process.env.TWILIO_TWIML_APP_SID = candidateSid;
      if (dbAppSid !== candidateSid) await setSystemConfig("twilio_twiml_app_sid", candidateSid);
      return candidateSid;
    } catch (error) {
      console.warn("[Twilio] Ignoring invalid TwiML App SID:", error instanceof Error ? error.message : "Unknown");
    }
  }
  const app = await client.applications.create({
    friendlyName: "Salaryman Voice App",
    voiceMethod: "POST",
    voiceUrl,
  });
  _cachedTwimlAppSid = app.sid;
  process.env.TWILIO_TWIML_APP_SID = app.sid;
  await setSystemConfig("twilio_twiml_app_sid", app.sid);
  console.log("[Twilio] Auto-provisioned TwiML App:", app.sid, "voiceUrl:", voiceUrl, "(persisted to DB)");
  return app.sid;
}

router.get("/twilio/token", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    if (!accountSid) {
      res.status(503).json({ error: "Twilio not configured. TWILIO_ACCOUNT_SID is required." });
      return;
    }
    const apiKey = await ensureTwilioApiKey();
    const twimlAppSid = await ensureTwimlApp();
    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;
    const token = new AccessToken(accountSid, apiKey.sid, apiKey.secret, { identity: userId, ttl: 3600 });
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
  const from = (req.body?.From ?? req.query?.From ?? "") as string;
  const identity = from.startsWith("client:") ? from.slice("client:".length) : "";
  res.set("Content-Type", "text/xml");
  if (identity && confName.startsWith(`conf-${identity}-`)) {
    res.send(`<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">${escapeTwiml(confName)}</Conference></Dial></Response>`);
  } else {
    res.send(`<Response><Say>Unable to connect. Please try again.</Say></Response>`);
  }
});

router.post("/twilio/call", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const { recipientNumber, callerName, contactName, contactId } = req.body;
    const userId = getAuthUserId(req);
    if (!recipientNumber || !userId) {
      res.status(400).json({ error: "recipientNumber required" });
      return;
    }
    const callCountry = await resolveUserCountry(userId);
    const e164 = toE164(recipientNumber, callCountry);
    if (!e164) {
      res.status(400).json({ error: "Invalid phone number format" });
      return;
    }
    const { checkAndEnforce, recordUsage, throttleResponse } = await import("../lib/usage-meter");
    const gate = await checkAndEnforce(userId, req.user?.email, "voice_minutes", 1);
    if (!gate.allowed) {
      res.status(429).json(throttleResponse("voice_minutes", gate.used, gate.limit));
      return;
    }
    // Optimistically charge 1 minute on dial; webhook reconciliation can true-up later.
    await recordUsage(userId, "voice_minutes", 1);
    const client = getTwilioClient();
    const fromNumber = await getUserOutboundNumber(userId);

    const confName = `conf-${userId}-${Date.now()}`;

    const _protocol = "https";
    const _host = getAppHost();
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
        conferenceName: confName,
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

router.post("/twilio/call/:callSid/mute", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

router.post("/twilio/call/:callSid/hold", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

router.post("/twilio/call/:callSid/transfer", requireAuth, requireFeature("phone_system"), async (req, res) => {
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
    const e164 = toE164(transferTo, await resolveUserCountry(userId));
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

router.post("/twilio/conference/create", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

router.post("/twilio/conference/:roomName/add", requireAuth, requireFeature("phone_system"), async (req, res) => {
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
    const e164 = toE164(phoneNumber, await resolveUserCountry(userId));
    if (!e164) {
      res.status(400).json({ error: "Invalid phone number" });
      return;
    }
    const client = getTwilioClient();
    const fromNumber = await getUserOutboundNumber(userId);
    const _confHost = getAppHost();
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

router.get("/twilio/conference/list", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

router.post("/twilio/conference/:roomName/end", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

router.post("/twilio/dialing/start", requireAuth, requireFeature("phone_system"), async (req, res) => {
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
    const fromNumber = await getUserOutboundNumber(userId);
    const callerName = getAuthUserId(req);
    const dialCountry = await resolveUserCountry(userId);

    const settingsConcurrency = typeof settings?.concurrency === "number" ? Math.min(Math.max(settings.concurrency, 2), 5) : 3;
    let dialCount = mode === "predictive" ? Math.min(settingsConcurrency, numbers.length) : 1;
    const results: Array<{ ok: boolean; phone: string; name?: string; callSid?: string; error?: string; status?: string; conferenceName?: string }> = [];
    const _dialingHost = getAppHost();
    const _dialingStatusUrl = _dialingHost ? `https://${_dialingHost}/api/twilio/webhook/status` : undefined;

    const { consumeUsage, throttleResponse: throttleResp } = await import("../lib/usage-meter");
    for (let i = 0; i < dialCount; i++) {
      const entry = numbers[i];
      const e164 = toE164(entry.phone, dialCountry);
      if (!e164) {
        results.push({ ok: false, phone: entry.phone, error: "Invalid number" });
        continue;
      }
      const dialGate = await consumeUsage(userId, req.user?.email, "voice_minutes", 1);
      if (!dialGate.allowed) {
        results.push({ ok: false, phone: entry.phone, error: throttleResp("voice_minutes", dialGate.used, dialGate.limit).message });
        break;
      }
      try {
        const confName = `conf-${userId}-${Date.now()}-${i}`;
        const recordingCallback = _dialingHost ? `https://${_dialingHost}/api/twilio/webhook/recording?userId=${encodeURIComponent(userId)}&type=call` : "";
        const conference = `<Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false" waitUrl="" record="record-from-start"${recordingCallback ? ` recordingStatusCallback="${escapeTwiml(recordingCallback)}" recordingStatusCallbackMethod="POST"` : ""}>${confName}</Conference>`;
        const twiml = mode === "auto" && settings?.recordingUrl
          ? `<Response><Play>${settings.recordingUrl}</Play><Dial>${conference}</Dial></Response>`
          : `<Response><Dial>${conference}</Dial></Response>`;
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
          dialingSessionId: session.id,
          dialingQueueIndex: i,
          conferenceName: confName,
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

    res.json({ ok: true, sessionId: session.id, mode, calls: results, queue: numbers });
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

router.post("/twilio/dialing/:sessionId/next", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const sessionId = Number(req.params.sessionId);
    const claim = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(17, ${sessionId})`);
      const [locked] = await tx
        .select()
        .from(dialingSessionsTable)
        .where(and(eq(dialingSessionsTable.id, sessionId), eq(dialingSessionsTable.userId, userId)))
        .limit(1);
      if (!locked || locked.status !== "running") return { session: locked, index: -1 };
      const index = locked.dialedCount ?? 0;
      if (index < locked.totalNumbers) {
        await tx.update(dialingSessionsTable)
          .set({ dialedCount: index + 1 })
          .where(eq(dialingSessionsTable.id, sessionId));
      }
      return { session: locked, index };
    });
    const session = claim.session;
    if (!session || session.status !== "running") {
      res.status(400).json({ error: "Session not found or not running" });
      return;
    }
    const queue: Array<{ phone: string; name?: string }> = JSON.parse(session.queueJson ?? "[]");
    const dialed = claim.index;
    if (dialed >= queue.length) {
      await db.update(dialingSessionsTable).set({ status: "completed", endedAt: new Date() }).where(eq(dialingSessionsTable.id, sessionId));
      res.json({ ok: true, completed: true, message: "All numbers have been dialed" });
      return;
    }
    const entry = queue[dialed];
    const e164 = toE164(entry.phone, await resolveUserCountry(userId));
    if (!e164) {
      res.json({ ok: false, skipped: true, phone: entry.phone, error: "Invalid number" });
      return;
    }
    const client = getTwilioClient();
    const fromNumber = await getUserOutboundNumber(userId);
    const _nextHost = getAppHost();
    const _nextStatusUrl = _nextHost ? `https://${_nextHost}/api/twilio/webhook/status` : undefined;
    {
      const { consumeUsage, throttleResponse: tr } = await import("../lib/usage-meter");
      const g = await consumeUsage(userId, req.user?.email, "voice_minutes", 1);
      if (!g.allowed) { res.status(429).json(tr("voice_minutes", g.used, g.limit)); return; }
    }
    const confName = `conf-${userId}-${Date.now()}`;
    const recordingCallback = _nextHost ? `https://${_nextHost}/api/twilio/webhook/recording?userId=${encodeURIComponent(userId)}&type=call` : "";
    const call = await client.calls.create({
      to: e164,
      from: fromNumber,
      twiml: `<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false" waitUrl="" record="record-from-start"${recordingCallback ? ` recordingStatusCallback="${escapeTwiml(recordingCallback)}" recordingStatusCallbackMethod="POST"` : ""}>${confName}</Conference></Dial></Response>`,
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
      dialingSessionId: sessionId, dialingQueueIndex: dialed,
      conferenceName: confName,
      contactId: nextCrmMatch?.contactId, consentGiven: true, recordingRetainUntil: getRetentionDate(),
    });
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

router.post("/twilio/dialing/:sessionId/stop", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const sessionId = Number(req.params.sessionId);
    const [stopped] = await db
      .update(dialingSessionsTable)
      .set({ status: "stopped", endedAt: new Date() })
      .where(and(eq(dialingSessionsTable.id, sessionId), eq(dialingSessionsTable.userId, userId)))
      .returning();
    if (!stopped) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const activeLegs = await db.select({ sid: callHistoryTable.twilioCallSid })
      .from(callHistoryTable)
      .where(and(
        eq(callHistoryTable.userId, userId),
        eq(callHistoryTable.dialingSessionId, sessionId),
        inArray(callHistoryTable.status, ["queued", "initiated", "ringing", "in-progress"]),
      ));
    const client = getTwilioClient();
    const results = await Promise.allSettled(activeLegs
      .filter((row): row is { sid: string } => Boolean(row.sid))
      .map((row) => client.calls(row.sid).update({ status: "completed" })));
    const stoppedCalls = results.filter((result) => result.status === "fulfilled").length;
    res.json({ ok: true, stoppedCalls });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to stop session" });
  }
});

router.get("/twilio/dialing/sessions", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

router.post("/twilio/ai/transcribe", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

router.post("/twilio/ai/coach", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const { question, transcript, context } = req.body;
    if (!question) {
      res.status(400).json({ error: "question required" });
      return;
    }
    const completion = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 400,
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

router.post("/twilio/ai/suggest", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const { transcript, contactName, context } = req.body;
    const completion = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 400,
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

router.post("/twilio/ai/dictation", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

router.get("/twilio/voicemail", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

router.post("/twilio/voicemail/:id/read", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const id = Number(req.params.id);
    await db.update(voicemailsTable).set({ isRead: true }).where(and(eq(voicemailsTable.id, id), eq(voicemailsTable.userId, userId)));
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

router.delete("/twilio/voicemail/:id", requireAuth, requireFeature("phone_system"), async (req, res) => {
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
    const { RecordingUrl, RecordingSid, CallSid, From, To, RecordingDuration, TranscriptionText, TranscriptionStatus } = req.body;
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
    const vmOwningCountry = await resolveOwningNumberCountry(userId, To);
    const vmCrmMatch = await matchContactByPhone(userId, From, vmOwningCountry);

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

    try {
      const callerLabel = vmCrmMatch?.contactName ?? From;
      await db.insert(notificationsTable).values({
        userId,
        type: "voicemail",
        title: `New voicemail from ${callerLabel}`,
        body: transcript ? transcript.slice(0, 200) : `You received a voicemail from ${callerLabel}.`,
        link: `/phone/voicemail`,
      });
    } catch (nErr) {
      console.error("[Voicemail] notification error:", nErr);
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
    const { From, To, CallSid } = req.body;
    const hintedUserId = req.query.userId as string | undefined;
    const telephonyOwner = await resolveTelephonyOwner({
      destinationNumber: To,
      hintedUserId,
    });
    const userId = telephonyOwner?.userId;

    const host = getAppHost(req);
    const base = host ? `https://${host}/api` : "/api";

    const configRows = userId
      ? await db.select().from(secretaryConfigTable).where(eq(secretaryConfigTable.userId, userId)).limit(1)
      : [];
    const config = configRows[0] ?? null;

    // Country of the dialed (owning) number — normalize the caller against the
    // line they actually rang so VN inbound matches VN-stored contacts.
    const inbOwningCountry = userId ? await resolveOwningNumberCountry(userId, To) : DEFAULT_COUNTRY;

    let fromName: string | undefined;
    if (userId && From) {
      try {
        const contacts = await db.select().from(contactsTable).where(eq(contactsTable.userId, userId)).limit(100);
        const match = contacts.find((c) => c.phone && toE164(c.phone, inbOwningCountry) === toE164(From, inbOwningCountry));
        if (match) fromName = match.name;
      } catch {
      }
    }

    if (CallSid) {
      const inbOrgId = telephonyOwner?.orgId ?? (userId ? await getUserOrgId(userId) : null);
      const inbCrmMatch = userId && From ? await matchContactByPhone(userId, From, inbOwningCountry) : null;
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
          const greeting = config.greetingScript ?? "Thank you for calling. This is Mila, your AI assistant. How can I help you today?";
          const twiml = `<Response>
<Start><Record recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId}&amp;type=pablo_full" recordingStatusCallbackMethod="POST" /></Start>
<Gather input="speech" timeout="10" action="${base}/twilio/pablo/gather?userId=${userId}" method="POST" speechTimeout="auto">
${milaVoice(greeting)}
</Gather>
${milaVoice("I didn't catch that. Please leave a message after the tone.")}
<Record maxLength="120" transcribe="true" transcribeCallback="${base}/twilio/webhook/transcription" recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId}&amp;type=voicemail" recordingStatusCallbackMethod="POST" />
</Response>`;
          res.type("text/xml").send(twiml);
          return;
        }

        const personality = config.personality ?? "professional";
        const greeting = config.greetingScript ?? `Thank you for calling. This is Mila, your virtual office assistant. How can I help you today?`;
        const screening = config.screeningRules ?? "Ask for the caller's name and the reason for their call.";
        const routing = config.routingInstructions ?? "";
        const twiml = `<Response>
<Gather input="speech" timeout="10" action="${base}/twilio/secretary/handle?userId=${userId}&amp;personality=${encodeURIComponent(personality)}&amp;screening=${encodeURIComponent(screening)}&amp;routing=${encodeURIComponent(routing)}" method="POST" speechTimeout="auto">
${milaVoice(greeting)}
</Gather>
${milaVoice("I didn't catch that. Please leave a message after the tone.")}
<Record maxLength="120" transcribe="true" transcribeCallback="${base}/twilio/webhook/transcription" recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId}&amp;type=voicemail" recordingStatusCallbackMethod="POST" />
</Response>`;
        res.type("text/xml").send(twiml);
        return;
      }
    }

    const greeting = config?.greetingScript ?? PABLO_VOICEMAIL_GREETING;
    const twiml = `<Response>
${milaVoice(greeting)}
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
    const { SpeechResult, From, To, CallSid } = req.body;
    const userId = req.query.userId as string;

    const configs = await db.select().from(secretaryConfigTable).where(eq(secretaryConfigTable.userId, userId)).limit(1);
    const config = configs[0];

    const personality = (typeof req.query.personality === "string" ? decodeURIComponent(req.query.personality) : null) ?? config?.personality ?? "professional";
    const screening = (typeof req.query.screening === "string" ? decodeURIComponent(req.query.screening) : null) ?? config?.screeningRules ?? "Ask for the caller's name and the reason for their call.";
    const routing = (typeof req.query.routing === "string" ? decodeURIComponent(req.query.routing) : null) ?? config?.routingInstructions ?? "";

    const completion = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 300,
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
      const secOwningCountry = await resolveOwningNumberCountry(userId, To);
      const secCrmMatch = From ? await matchContactByPhone(userId, From, secOwningCountry) : null;
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

    const secHost = getAppHost(req);
    const secBase = secHost ? `https://${secHost}/api` : "/api";

    const forwardTo = config?.forwardToNumber;
    let action = "";
    if (forwardTo && response.toLowerCase().includes("transfer")) {
      const safeForward = escapeTwiml(forwardTo);
      action = `<Dial>${safeForward}</Dial>`;
    } else {
      const secGatherUrl = `${secBase}/twilio/secretary/handle?userId=${userId}&amp;personality=${encodeURIComponent(personality)}&amp;screening=${encodeURIComponent(screening)}&amp;routing=${encodeURIComponent(routing)}`;
      action = `<Gather input="speech" timeout="10" action="${secGatherUrl}" method="POST" speechTimeout="auto">${milaVoice(response)}</Gather><Gather input="speech" timeout="10" action="${secGatherUrl}" method="POST" speechTimeout="auto">${milaVoice("Are you still there? I'm here to help.")}</Gather>${milaVoice("I didn't hear anything. Please leave a message after the tone.")}<Record maxLength="120" transcribe="true" transcribeCallback="${secBase}/twilio/webhook/transcription" recordingStatusCallback="${secBase}/twilio/webhook/recording?userId=${userId}&amp;type=voicemail" />`;
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
      res.type("text/xml").send(`<Response>${milaVoice("Thank you for calling. Goodbye.")}<Hangup/></Response>`);
      return;
    }

    const host = getAppHost(req);
    const base = host ? `https://${host}/api` : "/api";

    const action = await processPabloTurn(userId, CallSid, SpeechResult, From, "inbound");

    const milaResponse = milaVoice(action.response);

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
      res.type("text/xml").send(`<Response>${milaResponse}<Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false" waitUrl="">${safeConf}</Conference></Dial></Response>`);
      generateCallSummaryForSession(CallSid).catch(() => {});
      updateLeadFromPabloCall(From, userId, "transfer", action.response, null).catch(() => {});
      await db.update(callHistoryTable).set({ callType: "pablo_transfer" }).where(and(eq(callHistoryTable.twilioCallSid, CallSid), eq(callHistoryTable.userId, userId)));
      return;
    }

    if (action.type === "end_call" || action.type === "take_message") {
      let twiml = `<Response>${milaResponse}`;
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
<Gather input="speech" timeout="10" action="${base}/twilio/pablo/gather?userId=${userId}" method="POST" speechTimeout="auto">
${milaResponse}
</Gather>
<Gather input="speech" timeout="10" action="${base}/twilio/pablo/gather?userId=${userId}" method="POST" speechTimeout="auto">
${milaVoice("I didn't catch that. Could you repeat that?")}
</Gather>
<Gather input="speech" timeout="10" action="${base}/twilio/pablo/gather?userId=${userId}" method="POST" speechTimeout="auto">
${milaVoice("Are you still there? Take your time.")}
</Gather>
${milaVoice("It seems like you may have stepped away. Please leave a message after the tone, or call back anytime.")}
<Record maxLength="120" transcribe="true" transcribeCallback="${base}/twilio/webhook/transcription" recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId}&amp;type=voicemail" recordingStatusCallbackMethod="POST" />
</Response>`);
  } catch (err: unknown) {
    console.error("[Pablo] gather error:", err instanceof Error ? err.message : "Unknown");
    res.type("text/xml").send(`<Response>${milaVoice("I apologize, but I'm having trouble right now. Please try again later.")}</Response>`);
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
      res.type("text/xml").send(`<Response>${milaVoice("Thank you for calling. Goodbye.")}<Hangup/></Response>`);
      return;
    }

    const host = getAppHost(req);
    const base = host ? `https://${host}/api` : "/api";

    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    if (elapsedSeconds >= timeLimit) {
      const twiml = `<Response>
${milaVoice("Thank you for your patience. Let me connect you with an available agent now.")}
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
    const milaResponse = milaVoice(action.response);

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
${milaResponse}
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

      let twiml = `<Response>${milaResponse}`;
      if (action.type === "take_message") {
        twiml += `<Record maxLength="120" transcribe="true" transcribeCallback="${base}/twilio/webhook/transcription" recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId}&amp;type=voicemail" recordingStatusCallbackMethod="POST" />`;
      }
      twiml += `</Response>`;
      res.type("text/xml").send(twiml);
      generateCallSummaryForSession(CallSid).catch(() => {});
      return;
    }

    res.type("text/xml").send(`<Response>
<Gather input="speech" timeout="10" action="${base}/twilio/pablo/screening-gather?userId=${userId}&amp;timeLimit=${timeLimit}&amp;startTime=${startTime}" method="POST" speechTimeout="auto">
${milaResponse}
</Gather>
${milaVoice("I didn't catch that. Could you repeat that?")}
<Gather input="speech" timeout="10" action="${base}/twilio/pablo/screening-gather?userId=${userId}&amp;timeLimit=${timeLimit}&amp;startTime=${startTime}" method="POST" speechTimeout="auto">
${milaVoice("Are you still there?")}
</Gather>
<Redirect method="POST">${base}/twilio/pablo/screening-transfer?userId=${userId}&amp;callSid=${CallSid}</Redirect>
</Response>`);
  } catch (err: unknown) {
    console.error("[Pablo] screening-gather error:", err instanceof Error ? err.message : "Unknown");
    res.type("text/xml").send(`<Response>${milaVoice("I apologize for the difficulty. Let me connect you now.")}</Response>`);
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
      res.type("text/xml").send(`<Response>${milaVoice("Sorry, we could not connect you. Please try again later.")}<Hangup/></Response>`);
      return;
    }

    const host = getAppHost(req);
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

        const callerId = await getUserOutboundNumber(userId);
        res.type("text/xml").send(`<Response>
${milaVoice("Let me connect you now. Please hold.")}
<Dial callerId="${escapeTwiml(callerId)}" timeout="30" action="${base}/twilio/webhook/status?userId=${userId}">
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
${milaVoice("I'm sorry, but no agents are currently available. Please leave a message after the tone and someone will get back to you shortly.")}
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
    const agentCallerId = await getUserOutboundNumber(userId);
    client.calls.create({
      to: agent.phone,
      from: agentCallerId,
      twiml: `<Response>${milaVoice("Incoming screened call for you. Connecting now.")}<Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">${escapeTwiml(confName)}</Conference></Dial></Response>`,
      statusCallback: `${base}/twilio/webhook/status?userId=${userId}`,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    }).catch(err => console.error("[Pablo] conference agent dial error:", err instanceof Error ? err.message : "Unknown"));

    res.type("text/xml").send(`<Response>
${milaVoice(`I'll connect you with ${agent.name} now. Please hold for just a moment.`)}
<Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false" waitUrl="http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical">${escapeTwiml(confName)}</Conference></Dial>
</Response>`);
  } catch (err: unknown) {
    console.error("[Pablo] screening-transfer error:", err instanceof Error ? err.message : "Unknown");
    res.type("text/xml").send(`<Response>${milaVoice("I apologize for the difficulty. Please try again later.")}<Hangup/></Response>`);
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
      res.type("text/xml").send(`<Response>${milaVoice("Thank you for your time. Goodbye.")}<Hangup/></Response>`);
      return;
    }

    const host = getAppHost(req);
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
    const milaResponse = milaVoice(action.response);

    if (action.type === "end_call" || action.type === "take_message" || action.type === "create_lead") {
      res.type("text/xml").send(`<Response>${milaResponse}</Response>`);
      generateCallSummaryForSession(CallSid).catch(() => {});
      updateLeadFromPabloCall(To, userId, action.type, action.response, null).catch(() => {});
      return;
    }

    res.type("text/xml").send(`<Response>
<Gather input="speech" timeout="10" action="${base}/twilio/pablo/outbound/gather?userId=${userId}&amp;campaignId=${campaignId || ""}" method="POST" speechTimeout="auto">
${milaResponse}
</Gather>
${milaVoice("Thank you for your time. Goodbye.")}
</Response>`);
  } catch (err: unknown) {
    console.error("[Pablo] outbound gather error:", err instanceof Error ? err.message : "Unknown");
    res.type("text/xml").send(`<Response>${milaVoice("Thank you for your time. Goodbye.")}</Response>`);
  }
});

router.post("/twilio/pablo/outbound/dial", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const { phoneNumber, leadName, campaignId, script } = req.body;

    if (!phoneNumber) {
      res.status(400).json({ error: "Phone number is required" });
      return;
    }
    {
      const { consumeUsage, throttleResponse: tr } = await import("../lib/usage-meter");
      const g = await consumeUsage(userId, req.user?.email, "voice_minutes", 1);
      if (!g.allowed) { res.status(429).json(tr("voice_minutes", g.used, g.limit)); return; }
    }

    const secConfigs = await db.select().from(secretaryConfigTable).where(eq(secretaryConfigTable.userId, userId)).limit(1);
    const outboundDid = secConfigs[0]?.outboundDid ?? null;
    const fromNumber = outboundDid || await getUserOutboundNumber(userId);

    const client = getTwilioClient();
    const host = getAppHost(req);
    const base = host ? `https://${host}/api` : "/api";

    const outboundScript = script ?? "";
    const greeting = outboundScript
      ? `Hello, this is Mila calling on behalf of our team. ${outboundScript.split('.')[0]}.`
      : `Hello, this is Mila, an AI assistant calling on behalf of our team. Do you have a moment to chat?`;

    const call = await client.calls.create({
      to: phoneNumber,
      from: fromNumber,
      twiml: `<Response><Start><Record recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId}&amp;type=pablo_full" recordingStatusCallbackMethod="POST" /></Start><Gather input="speech" timeout="10" action="${base}/twilio/pablo/outbound/gather?userId=${userId}&amp;campaignId=${campaignId || ""}" method="POST" speechTimeout="auto">${milaVoice(greeting)}</Gather>${milaVoice("Thank you for your time. Goodbye.")}</Response>`,
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

router.get("/twilio/pablo/campaigns", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const campaigns = await db.select().from(pabloOutboundCampaignsTable).where(eq(pabloOutboundCampaignsTable.userId, userId)).orderBy(desc(pabloOutboundCampaignsTable.createdAt));
    res.json({ campaigns });
  } catch {
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

router.post("/twilio/pablo/campaigns", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

router.post("/twilio/pablo/campaigns/:id/start", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

    const secConfigs = await db.select().from(secretaryConfigTable).where(eq(secretaryConfigTable.userId, userId)).limit(1);
    const campaignFromNumber = secConfigs[0]?.outboundDid || await getUserOutboundNumber(userId);

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
    const host = getAppHost(req);
    const base = host ? `https://${host}/api` : "/api";
    const greeting = campaign.script.split('.')[0] + ".";
    let dialed = 0;
    const batchSize = Math.min(leads.length, 50);

    const { consumeUsage: _consumeUsage_pc } = await import("../lib/usage-meter");
    for (const lead of leads.slice(0, batchSize)) {
      const _g = await _consumeUsage_pc(userId, req.user?.email, "voice_minutes", 1);
      if (!_g.allowed) break;
      try {
        const call = await client.calls.create({
          to: lead.phone,
          from: campaignFromNumber,
          twiml: `<Response><Start><Record recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId}&amp;type=pablo_full" recordingStatusCallbackMethod="POST" /></Start><Gather input="speech" timeout="10" action="${base}/twilio/pablo/outbound/gather?userId=${userId}&amp;campaignId=${campaignId}" method="POST" speechTimeout="auto">${milaVoice(`Hello${lead.name ? `, ${lead.name}` : ""}. ${greeting}`)}</Gather>${milaVoice("Thank you for your time. Goodbye.")}</Response>`,
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

router.get("/twilio/call-center/agents", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const agents = await db.select().from(callCenterAgentsTable).where(eq(callCenterAgentsTable.userId, userId)).orderBy(callCenterAgentsTable.createdAt);
    res.json({ agents });
  } catch {
    res.status(500).json({ error: "Failed to fetch agents" });
  }
});

router.post("/twilio/call-center/agents", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const { name, phone, email } = req.body;
    if (!name || !phone) {
      res.status(400).json({ error: "Name and phone are required" });
      return;
    }
    const e164 = toE164(phone, await resolveUserCountry(userId));
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

router.post("/twilio/call-center/agents/:id/toggle", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

router.delete("/twilio/call-center/agents/:id", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

router.get("/twilio/call-center/screenings", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const screenings = await db.select().from(inboundScreeningsTable).where(eq(inboundScreeningsTable.userId, userId)).orderBy(desc(inboundScreeningsTable.createdAt)).limit(50);
    res.json({ screenings });
  } catch {
    res.status(500).json({ error: "Failed to fetch screenings" });
  }
});

router.get("/twilio/call-center/metrics", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

router.get("/twilio/secretary/config", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const configs = await db.select().from(secretaryConfigTable).where(eq(secretaryConfigTable.userId, userId)).limit(1);
    res.json({ config: configs[0] ?? null });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to fetch secretary config" });
  }
});

router.post("/twilio/secretary/config", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

router.get("/twilio/phone-numbers", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const numbers = await db
      .select()
      .from(phoneNumbersTable)
      .where(eq(phoneNumbersTable.userId, userId))
      .orderBy(phoneNumbersTable.createdAt);

    const defaultNumber = process.env.TWILIO_PHONE_NUMBER || null;
    res.json({
      numbers,
      defaultNumber,
      outboundNumber: numbers.find((number) => number.isActive)?.number || defaultNumber,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to fetch phone numbers" });
  }
});

router.post("/twilio/phone-numbers", requireAuth, requireFeature("phone_system"), async (req, res) => {
  res.status(410).json({ error: "Adding arbitrary existing numbers is disabled. Buy a verified number through Stripe checkout." });
});

router.put("/twilio/phone-numbers/:id", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const id = Number(req.params.id);
    const { label, greeting, routingMode, isActive } = req.body;
    if (routingMode !== undefined && !["voicemail", "secretary", "forward"].includes(routingMode)) {
      res.status(400).json({ error: "Invalid routing mode" });
      return;
    }
    const [updated] = await db.transaction(async (tx) => {
      if (isActive === true) {
        await tx.update(phoneNumbersTable).set({ isActive: false }).where(eq(phoneNumbersTable.userId, userId));
      }
      return tx
        .update(phoneNumbersTable)
        .set({
          ...(label !== undefined && { label: String(label).slice(0, 64), friendlyName: String(label).slice(0, 64) }),
          ...(greeting !== undefined && { greeting: String(greeting).slice(0, 1000) }),
          ...(routingMode !== undefined && { routingMode }),
          ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        })
        .where(and(eq(phoneNumbersTable.id, id), eq(phoneNumbersTable.userId, userId)))
        .returning();
    });
    if (!updated) {
      res.status(404).json({ error: "Phone number not found" });
      return;
    }
    res.json({ ok: true, phoneNumber: updated });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to update phone number" });
  }
});

router.delete("/twilio/phone-numbers/:id", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const id = Number(req.params.id);
    const [owned] = await db.select().from(phoneNumbersTable)
      .where(and(eq(phoneNumbersTable.id, id), eq(phoneNumbersTable.userId, userId))).limit(1);
    if (!owned) {
      res.status(404).json({ error: "Phone number not found" });
      return;
    }
    if (owned.twilioSid) {
      const [paidOwnership] = await db.select({ id: phoneNumberPurchasesTable.id })
        .from(phoneNumberPurchasesTable)
        .where(and(
          eq(phoneNumberPurchasesTable.userId, userId),
          eq(phoneNumberPurchasesTable.phoneNumber, owned.number),
          eq(phoneNumberPurchasesTable.twilioSid, owned.twilioSid),
          eq(phoneNumberPurchasesTable.status, "completed"),
        ))
        .limit(1);
      if (paidOwnership && owned.number !== process.env.TWILIO_PHONE_NUMBER) {
        await getTwilioClient().incomingPhoneNumbers(owned.twilioSid).remove();
      }
    }
    await db.delete(phoneNumbersTable).where(and(eq(phoneNumbersTable.id, id), eq(phoneNumbersTable.userId, userId)));
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to delete phone number" });
  }
});

// ── Country-aware number provisioning ───────────────────────────────────────
// Region defaults: tells the client which country the current user buys numbers
// in (Huda → VN, Minx → US) plus the full supported-country registry so the UI
// can render selectors/examples without hard-coding dial codes.
router.get("/twilio/region-defaults", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const cityId = await resolveUserCity(userId);
    const country = countryForCity(cityId);
    res.json({
      cityId,
      country,
      countryInfo: getCountryInfo(country),
      countries: Object.values(SUPPORTED_COUNTRIES),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to resolve region defaults" });
  }
});

// Regulatory requirements for a country (e.g. Vietnam needs a Twilio bundle).
// Surfaced before purchase so the UI can warn loudly instead of failing on a
// raw Twilio error code.
router.get("/twilio/regulatory", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const raw = Array.isArray(req.query.country) ? req.query.country[0] : req.query.country;
    const country = isSupportedCountry(typeof raw === "string" ? raw : undefined)
      ? (raw as string)
      : countryForCity(await resolveUserCity(userId));
    res.json({ country, requirement: regulatoryRequirement(country) });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to fetch regulatory requirements" });
  }
});

// Search Twilio for buyable local numbers in a country. Defaults to the user's
// home-city country; an explicit ?country= (supported only) overrides it.
router.get("/twilio/available-numbers", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const rawCountry = Array.isArray(req.query.country) ? req.query.country[0] : req.query.country;
    const country = isSupportedCountry(typeof rawCountry === "string" ? rawCountry : undefined)
      ? (rawCountry as string)
      : countryForCity(await resolveUserCity(userId));
    const rawContains = Array.isArray(req.query.contains) ? req.query.contains[0] : req.query.contains;
    const contains = typeof rawContains === "string" && rawContains.trim() ? rawContains.trim() : undefined;

    const client = getTwilioClient();
    const list = await client.availablePhoneNumbers(country).local.list({
      limit: 20,
      ...(contains ? { contains } : {}),
    });
    const numbers = list.map((n) => ({
      phoneNumber: n.phoneNumber,
      friendlyName: n.friendlyName,
      locality: n.locality ?? null,
      region: n.region ?? null,
      capabilities: (n.capabilities ?? null) as Record<string, boolean> | null,
    }));
    res.json({ country, countryInfo: getCountryInfo(country), numbers });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] available-numbers error:", msg);
    if (msg.includes("not configured")) {
      res.status(503).json({ error: "Phone system not configured. Contact admin." });
    } else {
      res.status(502).json({ error: "Failed to search numbers", detail: msg });
    }
  }
});

router.post("/twilio/purchase-number", requireAuth, requireFeature("phone_system"), async (req, res) => {
  res.status(410).json({ error: "Direct provisioning is disabled. Use Stripe checkout to buy a custom number." });
});

router.post("/twilio/call/:callSid/schedule-followup", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

router.post("/twilio/history/:callId/link-contact", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

router.post("/twilio/batch-call", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const { numbers, callerName } = req.body;
    const userId = getAuthUserId(req);
    if (!Array.isArray(numbers) || numbers.length === 0 || !userId) {
      res.status(400).json({ error: "numbers (array of {phone, name}) required" });
      return;
    }
    const { consumeUsage: _consumeUsage_bc, throttleResponse: _tr_bc } = await import("../lib/usage-meter");
    const _gateBatch = await _consumeUsage_bc(userId, req.user?.email, "voice_minutes", numbers.length);
    if (!_gateBatch.allowed) {
      res.status(429).json(_tr_bc("voice_minutes", _gateBatch.used, _gateBatch.limit));
      return;
    }
    const client = getTwilioClient();
    const fromNumber = await getUserOutboundNumber(userId);
    const protocol = process.env.NODE_ENV === "production" ? "https" : "https";
    const host = getAppHost();
    const statusCallbackUrl = host ? `${protocol}://${host}/api/twilio/webhook/status` : undefined;
    const batchCountry = await resolveUserCountry(userId);
    const results = await Promise.allSettled(
      numbers.map(async (entry: { phone: string; name?: string }) => {
        const e164 = toE164(entry.phone, batchCountry);
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

router.get("/twilio/call-status/:callSid", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

router.post("/twilio/call-status-batch", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

router.post("/twilio/hangup/:callSid", requireAuth, requireFeature("phone_system"), async (req, res) => {
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
    try {
      await client.calls(callSid).update({ status: "completed" });
    } catch (error: any) {
      if (error?.code !== 20404) throw error;
    }
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

router.post("/twilio/hangup-all", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const { callSids } = req.body;
    if (!Array.isArray(callSids) || callSids.length === 0) {
      res.status(400).json({ error: "callSids array required" });
      return;
    }
    const client = getTwilioClient();
    const ownership = await Promise.all(callSids.map((sid: string) => verifyCallOwnership(userId, sid)));
    if (ownership.some((owned) => !owned)) {
      res.status(403).json({ error: "Not authorized to hang up one or more calls" });
      return;
    }
    const results = await Promise.all(
      callSids.map(async (sid: string) => {
        try {
          let lastError: unknown;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await client.calls(sid).update({ status: "completed" });
              lastError = undefined;
              break;
            } catch (e: unknown) {
              if ((e as { code?: number })?.code === 20404) {
                lastError = undefined;
                break;
              }
              lastError = e;
              if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
            }
          }
          if (lastError) throw lastError;
          await db.update(callHistoryTable).set({ status: "completed", endedAt: new Date() }).where(and(eq(callHistoryTable.twilioCallSid, sid), eq(callHistoryTable.userId, userId)));
          return { sid, ok: true };
        } catch (e: unknown) {
          console.error("[CalllHome] hangup-all individual error:", e instanceof Error ? e.message : "Unknown");
          return { sid, ok: false, error: e instanceof Error ? e.message : "Twilio cleanup failed" };
        }
      })
    );
    const failed = results.filter((result) => !result.ok);
    if (failed.length > 0) {
      res.status(502).json({ error: "One or more calls could not be ended", failed });
      return;
    }
    res.json({ ok: true });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] hangup-all error:", _msg);
    res.status(500).json({ error: "Failed to end calls" });
  }
});

router.get("/twilio/history/:userId", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

// Stream a Twilio recording (MP3) to an authenticated user. Twilio recording
// URLs require Basic auth (AccountSid + AuthToken), so the browser can't fetch
// them directly — we proxy with auth and verify ownership first.
router.get("/twilio/recording/:callId", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const callId = Number(req.params.callId);
    if (!userId || !Number.isFinite(callId)) {
      res.status(400).json({ error: "callId required" });
      return;
    }
    const rows = await db
      .select()
      .from(callHistoryTable)
      .where(and(eq(callHistoryTable.id, callId), eq(callHistoryTable.userId, userId)))
      .limit(1);
    const call = rows[0];
    if (!call) {
      res.status(404).json({ error: "Call not found" });
      return;
    }
    if (!call.recordingUrl) {
      res.status(404).json({ error: "No recording on file for this call" });
      return;
    }
    if (call.recordingUrl.startsWith("/objects/")) {
      const file = await new ObjectStorageService().getObjectEntityFile(call.recordingUrl);
      const [bytes] = await file.download();
      const disposition = req.query.download === "1" ? "attachment" : "inline";
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", bytes.length);
      res.setHeader("Content-Disposition", `${disposition}; filename="call-${callId}.mp3"`);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(bytes);
      return;
    }
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      res.status(503).json({ error: "Twilio credentials not configured" });
      return;
    }
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const upstream = await fetch(call.recordingUrl, { headers: { Authorization: `Basic ${auth}` } });
    if (!upstream.ok || !upstream.body) {
      res.status(upstream.status || 502).json({ error: `Twilio responded ${upstream.status}` });
      return;
    }
    const disposition = (req.query.download === "1") ? "attachment" : "inline";
    res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "audio/mpeg");
    const cl = upstream.headers.get("content-length");
    if (cl) res.setHeader("Content-Length", cl);
    res.setHeader("Content-Disposition", `${disposition}; filename="call-${callId}.mp3"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    // Stream the body straight through.
    const reader = upstream.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) res.write(Buffer.from(value));
    }
    res.end();
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] recording proxy error:", _msg);
    if (!res.headersSent) res.status(500).json({ error: "Failed to fetch recording" });
  }
});

// Same proxy for voicemails.
router.get("/twilio/voicemail-recording/:vmId", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const vmId = Number(req.params.vmId);
    if (!userId || !Number.isFinite(vmId)) {
      res.status(400).json({ error: "vmId required" });
      return;
    }
    const rows = await db
      .select()
      .from(voicemailsTable)
      .where(and(eq(voicemailsTable.id, vmId), eq(voicemailsTable.userId, userId)))
      .limit(1);
    const vm = rows[0];
    if (!vm || !vm.recordingUrl) {
      res.status(404).json({ error: "Voicemail recording not found" });
      return;
    }
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      res.status(503).json({ error: "Twilio credentials not configured" });
      return;
    }
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const upstream = await fetch(vm.recordingUrl, { headers: { Authorization: `Basic ${auth}` } });
    if (!upstream.ok || !upstream.body) {
      res.status(upstream.status || 502).json({ error: `Twilio responded ${upstream.status}` });
      return;
    }
    const disposition = (req.query.download === "1") ? "attachment" : "inline";
    res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "audio/mpeg");
    const cl = upstream.headers.get("content-length");
    if (cl) res.setHeader("Content-Length", cl);
    res.setHeader("Content-Disposition", `${disposition}; filename="voicemail-${vmId}.mp3"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    const reader = upstream.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) res.write(Buffer.from(value));
    }
    res.end();
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] voicemail proxy error:", _msg);
    if (!res.headersSent) res.status(500).json({ error: "Failed to fetch voicemail" });
  }
});

// Diagnostic — quick health check for the recording pipeline. Returns recent
// call counts, how many have recordingUrl, and what's misconfigured.
router.get("/twilio/recording-diagnostics", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "auth required" }); return; }
    const calls = await db
      .select()
      .from(callHistoryTable)
      .where(eq(callHistoryTable.userId, userId))
      .orderBy(desc(callHistoryTable.startedAt))
      .limit(50);
    const vms = await db
      .select()
      .from(voicemailsTable)
      .where(eq(voicemailsTable.userId, userId))
      .orderBy(desc(voicemailsTable.createdAt))
      .limit(50);
    const callsWithRecording = calls.filter((c) => !!c.recordingUrl).length;
    const vmsWithRecording = vms.filter((v) => !!v.recordingUrl).length;
    const host = getAppHost(req);
    const publicHost = !!host && !host.includes("localhost");
    res.json({
      summary: {
        totalCallsLast50: calls.length,
        callsWithRecordingUrl: callsWithRecording,
        callsMissingRecording: calls.length - callsWithRecording,
        totalVoicemailsLast50: vms.length,
        voicemailsWithRecordingUrl: vmsWithRecording,
      },
      checklist: {
        twilioCredentialsConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER),
        publicHostAvailable: publicHost,
        publicHost: host || "(none — webhooks won't reach this server)",
        retentionDays: RECORDING_RETENTION_DAYS,
      },
      recentCalls: calls.slice(0, 10).map((c) => ({
        id: c.id,
        startedAt: c.startedAt,
        direction: c.direction,
        status: c.status,
        durationSeconds: c.durationSeconds,
        hasRecording: !!c.recordingUrl,
        twilioCallSid: c.twilioCallSid,
      })),
    });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: _msg });
  }
});

router.get("/twilio/webhook-config", requireAuth, requireFeature("phone_system"), async (req, res) => {
  const host = getAppHost(req);
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
    const hintedUserId = req.query.userId as string | undefined;
    const telephonyOwner = await resolveTelephonyOwner({
      destinationNumber: To,
      hintedUserId,
    });
    const userId = telephonyOwner?.userId;

    const host = getAppHost(req);
    const base = host ? `https://${host}/api` : "/api";

    const configRows = userId
      ? await db.select().from(secretaryConfigTable).where(eq(secretaryConfigTable.userId, userId)).limit(1)
      : [];
    const config = configRows[0] ?? null;

    let fromName: string | undefined;
    let inbCrmContactId: number | undefined;
    if (userId && From) {
      try {
        const voiceOwningCountry = await resolveOwningNumberCountry(userId, To);
        const crmMatch = await matchContactByPhone(userId, From, voiceOwningCountry);
        if (crmMatch) {
          fromName = crmMatch.contactName;
          inbCrmContactId = crmMatch.contactId;
        }
      } catch {
      }
    }

    const inbOrgId2 = telephonyOwner?.orgId ?? (userId ? await getUserOrgId(userId) : null);

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
        ?? "Thank you for calling. This is Mila, I'll be helping to connect you with the right person. May I ask who's calling and what this is regarding?";
      await db.insert(inboundScreeningsTable).values({
        userId,
        twilioCallSid: CallSid,
        callerNumber: From ?? "unknown",
        callerName: fromName ?? null,
        outcome: "screening",
      });
      const timeLimit = config.screeningTimeLimit ?? 120;
      const twiml = `<Response>
<Gather input="speech" timeout="10" action="${base}/twilio/pablo/screening-gather?userId=${userId}&amp;timeLimit=${timeLimit}&amp;startTime=${Date.now()}" method="POST" speechTimeout="auto">
${milaVoice(screeningGreeting)}
</Gather>
${milaVoice("I didn't catch that. Let me transfer you now.")}
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
          const greeting = config.greetingScript ?? "Thank you for calling. This is Mila, your AI assistant. How can I help you today?";
          const twiml = `<Response>
<Start><Record recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId}&amp;type=pablo_full" recordingStatusCallbackMethod="POST" /></Start>
<Gather input="speech" timeout="10" action="${base}/twilio/pablo/gather?userId=${userId}" method="POST" speechTimeout="auto">
${milaVoice(greeting)}
</Gather>
${milaVoice("I didn't catch that. Please leave a message after the tone.")}
<Record maxLength="120" transcribe="true" transcribeCallback="${base}/twilio/webhook/transcription" recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId}&amp;type=voicemail" recordingStatusCallbackMethod="POST" />
</Response>`;
          res.type("text/xml").send(twiml);
          return;
        }

        const personality = config.personality ?? "professional";
        const greeting = config.greetingScript ?? `Thank you for calling. This is Mila, your virtual office assistant. How can I help you today?`;
        const screening = config.screeningRules ?? "Ask for the caller's name and the reason for their call.";
        const routing = config.routingInstructions ?? "";
        const twiml = `<Response>
<Gather input="speech" timeout="10" action="${base}/twilio/secretary/handle?userId=${userId}&amp;personality=${encodeURIComponent(personality)}&amp;screening=${encodeURIComponent(screening)}&amp;routing=${encodeURIComponent(routing)}" method="POST" speechTimeout="auto">
${milaVoice(greeting)}
</Gather>
${milaVoice("I didn't catch that. Please leave a message after the tone.")}
<Record maxLength="120" transcribe="true" transcribeCallback="${base}/twilio/webhook/transcription" recordingStatusCallback="${base}/twilio/webhook/recording?userId=${userId}&amp;type=voicemail" recordingStatusCallbackMethod="POST" />
</Response>`;
        res.type("text/xml").send(twiml);
        return;
      }
    }

    const greeting = config?.greetingScript ?? PABLO_VOICEMAIL_GREETING;
    const twiml = `<Response>
${milaVoice(greeting)}
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

    if (updated[0]) {
      const c = updated[0];
      await recordTelephonyActivity({
        userId: c.userId,
        orgId: c.orgId ?? null,
        channel: "call",
        direction: (c.direction === "inbound" ? "inbound" : "outbound"),
        phone: c.recipientNumber,
        contactName: c.callerName ?? undefined,
        contactId: c.contactId ?? undefined,
        durationSeconds: c.durationSeconds ?? (CallDuration ? parseInt(CallDuration, 10) : undefined),
        status: CallStatus,
        twilioSid: CallSid,
      }).catch(() => {});
    }

    if (updated.length === 0 && Direction === "inbound") {
      const existing = await db
        .select({ id: callHistoryTable.id })
        .from(callHistoryTable)
        .where(and(eq(callHistoryTable.twilioCallSid, CallSid), eq(callHistoryTable.direction, "inbound")))
        .limit(1);
      if (existing.length === 0) {
        const telephonyOwner = await resolveTelephonyOwner({
          destinationNumber: To,
          hintedUserId: req.query.userId as string | undefined,
        });
        const resolvedUserId = telephonyOwner?.userId ?? null;
        if (resolvedUserId) {
          try {
            const fallbackOrgId = telephonyOwner?.orgId ?? await getUserOrgId(resolvedUserId);
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
            await recordTelephonyActivity({
              userId: resolvedUserId,
              orgId: fallbackOrgId ?? null,
              channel: "call",
              direction: "inbound",
              phone: From ?? "unknown",
              durationSeconds: CallDuration ? parseInt(CallDuration, 10) : undefined,
              status: CallStatus,
              twilioSid: CallSid,
            }).catch(() => {});
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
        const callerLabel = record.callerName ?? From ?? record.recipientNumber;
        await sendMissedCallEmail(record.userId, From ?? record.recipientNumber, record.callerName ?? undefined);
        try {
          await db.insert(notificationsTable).values({
            userId: record.userId,
            type: "missed_call",
            title: `Missed call from ${callerLabel}`,
            body: `You missed an inbound call from ${callerLabel}.`,
            link: `/phone/history`,
          });
        } catch (nErr) {
          console.error("[MissedCall] notification error:", nErr);
        }
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
    const hintedUserId = req.query.userId as string | undefined;
    const recordingType = req.query.type as string;

    if (RecordingStatus && RecordingStatus !== "completed") {
      res.status(204).send();
      return;
    }

    let fromNumber = FromField as string | undefined;
    let callOwner: { userId: string; orgId: number | null } | null = null;

    if (!fromNumber && CallSid) {
      const callRows = await db
        .select()
        .from(callHistoryTable)
        .where(eq(callHistoryTable.twilioCallSid, CallSid))
        .limit(1);
      if (callRows[0]) {
        fromNumber = callRows[0].recipientNumber;
        callOwner = { userId: callRows[0].userId, orgId: callRows[0].orgId ?? null };
      }
    }

    const telephonyOwner = callOwner ?? await resolveTelephonyOwner({
      destinationNumber: req.body.To as string | undefined,
      hintedUserId,
    });
    const userId = telephonyOwner?.userId;

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

      const orgId = telephonyOwner?.orgId ?? await getUserOrgId(userId);

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
        await recordTelephonyActivity({
          userId,
          orgId: orgId ?? null,
          channel: "voicemail",
          direction: "inbound",
          phone: fromNumber ?? "unknown",
          contactName: fromName,
          contactId: crmContactId,
          body: transcript,
          recordingUrl: RecordingUrl ? `${RecordingUrl}.mp3` : undefined,
          durationSeconds: RecordingDuration ? Number(RecordingDuration) : undefined,
          twilioSid: CallSid,
        }).catch(() => {});
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
      const storedRecordingUrl = process.env.NODE_ENV === "test"
        ? `${RecordingUrl}.mp3`
        : await archiveTwilioRecording(RecordingUrl);
      const callRows = await db
        .update(callHistoryTable)
        .set({
          recordingUrl: storedRecordingUrl,
          recordingSid: RecordingSid ?? undefined,
          recordingRetainUntil: getRetentionDate(),
        })
        .where(eq(callHistoryTable.twilioCallSid, CallSid))
        .returning();
      if (callRows[0]) {
        const c = callRows[0];
        await recordTelephonyActivity({
          userId: c.userId,
          orgId: c.orgId ?? null,
          channel: "call",
          direction: c.direction === "inbound" ? "inbound" : "outbound",
          phone: c.recipientNumber,
          contactName: c.callerName ?? undefined,
          contactId: c.contactId ?? undefined,
          recordingUrl: storedRecordingUrl,
          durationSeconds: c.durationSeconds ?? undefined,
          twilioSid: CallSid,
        }).catch(() => {});
      }
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
        const c = callRows[0];
        await recordTelephonyActivity({
          userId: c.userId,
          orgId: c.orgId ?? null,
          channel: "call",
          direction: c.direction === "inbound" ? "inbound" : "outbound",
          phone: c.recipientNumber,
          contactName: c.callerName ?? undefined,
          contactId: c.contactId ?? undefined,
          body: TranscriptionText,
          summary: summary || undefined,
          durationSeconds: c.durationSeconds ?? undefined,
          twilioSid: CallSid,
        }).catch(() => {});
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

    if (!From || !Body) {
      res.type("text/xml").send("<Response></Response>");
      return;
    }
    if (MessageSid) {
      const [alreadyProcessed] = await db.select({ id: smsMessagesTable.id })
        .from(smsMessagesTable)
        .where(eq(smsMessagesTable.twilioMessageSid, MessageSid))
        .limit(1);
      if (alreadyProcessed) {
        res.type("text/xml").send("<Response></Response>");
        return;
      }
    }

    const e164From = toE164(From) ?? From;
    const e164To = toE164(To) ?? To;
    const telephonyOwner = await resolveTelephonyOwner({
      destinationNumber: To,
      hintedUserId: req.query.userId as string | undefined,
    });
    let userId: string | undefined = telephonyOwner?.userId;
    const ownerOrgId = telephonyOwner?.orgId ?? (userId ? await getUserOrgId(userId) : null);
    if (!userId && e164To === process.env.TWILIO_PHONE_NUMBER) {
      const recentOutbound = await db.select({ userId: smsMessagesTable.userId })
        .from(smsMessagesTable)
        .where(and(
          eq(smsMessagesTable.direction, "outbound"),
          eq(smsMessagesTable.fromPhone, e164To),
          eq(smsMessagesTable.toPhone, e164From),
          gte(smsMessagesTable.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
        ))
        .orderBy(desc(smsMessagesTable.createdAt))
        .limit(20);
      const candidates = [...new Set(recentOutbound.map((row) => row.userId))];
      if (candidates.length === 1) userId = candidates[0];
    }

    let fromName: string | undefined;
    let contactId: number | undefined;

    if (userId) {
      try {
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

    // Persist the inbound text to the SMS thread tables (the phone/comms hub
    // reads these) AND to the CRM interaction log (legacy / contact timeline).
    let conversationId: number | undefined;
    if (userId) {
      try {
        let [conv] = await db
          .select()
          .from(smsConversationsTable)
          .where(and(eq(smsConversationsTable.userId, userId), eq(smsConversationsTable.contactPhone, e164From)));
        if (!conv) {
          [conv] = await db
            .insert(smsConversationsTable)
            .values({
              userId,
              contactId: contactId ?? null,
              contactPhone: e164From,
              contactName: fromName ?? From,
              lastMessageAt: new Date(),
              unreadCount: 0,
            })
            .returning();
        }
        conversationId = conv.id;

        const inserted = await db.insert(smsMessagesTable).values({
            conversationId: conv.id,
            userId,
            direction: "inbound",
            body: Body,
            fromPhone: e164From,
            toPhone: To ?? getTwilioNumber(),
            twilioMessageSid: MessageSid || null,
            status: "received",
            isRead: false,
          })
          .onConflictDoNothing()
          .returning({ id: smsMessagesTable.id });
        if (MessageSid && inserted.length === 0) {
          res.type("text/xml").send("<Response></Response>");
          return;
        }
        await db
          .update(smsConversationsTable)
          .set({
            lastMessageAt: new Date(),
            unreadCount: sql`${smsConversationsTable.unreadCount} + 1`,
            contactName: conv.contactName || fromName || From,
            contactId: conv.contactId ?? contactId ?? null,
          })
          .where(eq(smsConversationsTable.id, conv.id));

        await recordTelephonyActivity({
          userId,
          orgId: ownerOrgId,
          channel: "sms",
          direction: "inbound",
          phone: e164From,
          contactName: fromName ?? From,
          contactId: contactId ?? undefined,
          body: Body,
          twilioSid: MessageSid || undefined,
        }).catch(() => {});
      } catch (e: unknown) {
        console.error("[CalllHome] webhook/sms: thread persist error:", e instanceof Error ? e.message : "Unknown");
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
      console.warn(`[CalllHome] webhook/sms: could not resolve an unambiguous owner for ${To}; SMS from ${From} not persisted`);
    }

    console.log(`[CalllHome] webhook/sms: inbound SMS from ${fromName ?? From} (${From}) to ${To}: ${Body.slice(0, 100)}`);
    if (!userId) {
      res.type("text/xml").send("<Response></Response>");
      return;
    }

    // MILA auto-reply: warm, sharp AI concierge over SMS. No state, no toggle —
    // she just chats and is allowed to drop a single binary choice mid-conversation
    // when it actually fits.
    const MILA_SMS_PROMPT = `You are MILA — a warm, sharp, slightly playful AI concierge from SALARYMAN by Picasso.AI. You are texting back over SMS.
Style:
- Warm but quick-witted. Confident, never cold. You make the user feel looked-after.
- Short. SMS short. 1-3 lines, hard cap ~280 characters total. No emojis. No markdown.
- Never glaze. Never start with "Great question" or "Sure thing".
- When it actually fits the conversation, end with a single binary choice — NEVER as boring "yes/no", and NEVER use the word "text" or "texting". Frame it as a cheeky scenario the user is in, then offer two short reply tokens. Format EXACTLY like: "Reply X or Y." where X and Y are short cheeky words/phrases (1–4 words each, ALL CAPS works well). Riff on framings like: "If you want to keep us a secret — reply ON THE LOW. If you can wave it around — reply CONFETTI.", "Can't talk now? Reply HIDE ME. Got time? Reply COME CLOSER.", "What should I call you? Reply BOSS or reply TROUBLE.", "Reply WHISPER or HOLLER.", "Reply DOUBLE DOWN or FOLD.", "Reply MORE COFFEE or MORE WHISKEY.". Match the user's vibe; be playful, never corporate. Invent new pairs every time. Don't ask one every message — only when it actually fits.
- If the user's reply matches one of your offered options (case-insensitive, including yes/no/y/n shortcuts), treat it as the answer and push the conversation forward. Don't re-ask the same question.
Currency is FIAT (ƒ). Never say "crypto", never say "coin", never say "$".`;

    let milaReplyText = "";
    try {
      const recent = contactId
        ? await db
            .select()
            .from(contactInteractionsTable)
            .where(and(eq(contactInteractionsTable.contactId, contactId), eq(contactInteractionsTable.type, "sms")))
            .orderBy(desc(contactInteractionsTable.createdAt))
            .limit(8)
        : [];
      const history = recent.reverse().map((row) => {
        const isInbound = (row.note ?? "").startsWith("Inbound SMS");
        const text = (row.note ?? "").replace(/^Inbound SMS from [^:]+:\s*/, "").replace(/^(Mila|Pablo) SMS reply:\s*/, "").slice(0, 400);
        return { role: (isInbound ? "user" : "assistant") as "user" | "assistant", content: text };
      }).filter((m) => m.content.trim().length > 0);

      const completion = await openai.chat.completions.create({
        model: getOpenAiTextModel(),
        max_completion_tokens: 300,
        messages: [
          { role: "system", content: MILA_SMS_PROMPT },
          ...history,
          { role: "user", content: Body.slice(0, 1000) },
        ],
      });
      milaReplyText = (completion.choices[0]?.message?.content ?? "").trim().slice(0, 480);
    } catch (e) {
      console.error("[Mila SMS] LLM error:", e instanceof Error ? e.message : e);
      milaReplyText = "Mila here. Reception's spotty right now — try me again in a minute.";
    }

    if (milaReplyText && userId) {
      if (contactId) {
        await db.insert(contactInteractionsTable).values({
          contactId,
          userId,
          type: "sms",
          note: `Mila SMS reply: ${milaReplyText}`,
        }).catch(() => {});
      }
      if (conversationId) {
        await db.insert(smsMessagesTable).values({
          conversationId,
          userId,
          direction: "outbound",
          body: milaReplyText,
          fromPhone: To ?? getTwilioNumber(),
          toPhone: e164From,
          status: "sent",
          isRead: true,
        }).catch(() => {});
        await db
          .update(smsConversationsTable)
          .set({ lastMessageAt: new Date() })
          .where(eq(smsConversationsTable.id, conversationId))
          .catch(() => {});
      }
      await recordTelephonyActivity({
        userId,
        channel: "sms",
        direction: "outbound",
        phone: e164From,
        contactName: fromName ?? From,
        contactId: contactId ?? undefined,
        body: milaReplyText,
      }).catch(() => {});
    }

    const escapedReply = milaReplyText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    res.type("text/xml").send(
      milaReplyText
        ? `<Response><Message>${escapedReply}</Message></Response>`
        : "<Response></Response>"
    );
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

router.post("/twilio/history/:callId/email-summary", requireAuth, requireFeature("phone_system"), async (req, res) => {
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

router.get("/twilio/admin/org-calls", requireAuth, requireFeature("phone_system"), async (req, res) => {
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
      activeCalls: calls
        .filter((c) => ["queued", "initiated", "ringing", "in-progress"].includes(c.status))
        .map((c) => ({
          id: c.id,
          userId: c.userId,
          memberLabel: c.userId,
          partyName: c.callerName,
          partyNumber: c.recipientNumber,
          status: c.status,
          direction: c.direction,
          startedAt: c.startedAt,
          conferenceName: c.conferenceName,
          recording: true,
        })),
      totalCalls: totalCalls[0]?.count ?? 0,
      totalVoicemails: totalVoicemails[0]?.count ?? 0,
      recordingPolicy: {
        encryptionAtRest: true,
        retentionPolicyDays: RECORDING_RETENTION_DAYS,
        consentTracked: true,
        auditLogged: true,
        expiryWarningDays: 30,
        expiryWarningChannel: "email",
      },
    });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] admin org-calls error:", _msg);
    res.status(500).json({ error: "Failed to fetch org calls" });
  }
});

export default router;
