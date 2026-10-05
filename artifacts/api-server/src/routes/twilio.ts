import { Router, type Request, type Response, type NextFunction } from "express";
import { spawn } from "child_process";
import { eq, desc, and, asc, sql, gte, inArray, isNull } from "drizzle-orm";
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
  leadRecordsTable,
  systemConfigTable,
  smsConversationsTable,
  smsMessagesTable,
  contactChannelPrefsTable,
  organizationsTable,
  sharedMediaTable,
  chatChannelsTable,
  chatMessagesTable,
  type InsertSecretaryConfig,
} from "@workspace/db";
import {
  GetPhoneInternalDirectoryResponse,
  AssignPhoneInternalLineParams,
  AssignPhoneInternalLineBody,
  AssignPhoneInternalLineResponse,
  SendPabloInternalDeliveryBody,
  SendPabloInternalDeliveryResponse,
} from "@workspace/api-zod";
import twilio from "twilio";
import { randomBytes } from "crypto";
import { openai } from "@workspace/integrations-openai-ai-server";
import { speechToText } from "@workspace/integrations-openai-ai-server/audio";
import { getOpenAiTextModel } from "../lib/openai-models";
import { synthesizePabloLine } from "../lib/pablo-elevenlabs";
import { buildPabloOrgIndustryContext, PABLO_CORE_PERSONA } from "../lib/pablo-persona";
import { resolvePabloOrgContext } from "../lib/pablo-org-context";
import {
  classifyPabloCallAnswer,
  interpolatePabloScript,
  parsePabloOutboundScript,
} from "../lib/pablo-outbound-script";
import { getUncachableResendClient } from "../lib/resend";
import { hasFeature } from "../lib/plan";
import { requireFeature } from "../middlewares/requirePro";
import { processPabloTurn, generateCallSummaryForSession, getOrCreateSession } from "../lib/pablo-call-agent";
import { updateLeadFromPabloCall, createOrUpdateLeadFromScreening } from "./leads";
import { recordTelephonyActivity } from "../lib/crm-recorder";
import { extractCallerIdentityEvidence } from "../lib/crm-recorder";
import {
  findContractualHighlights,
  readRecordingWorkflowState,
  updateRecordingWorkflowState,
  validateRecordingExcerpts,
} from "../lib/recording-excerpts";
import { toE164, SUPPORTED_COUNTRIES, regulatoryRequirement, getCountryInfo, isSupportedCountry, countryForCity, DEFAULT_COUNTRY } from "../lib/phone";
import { resolveUserCountry, resolveUserCity, resolveOwningNumberCountry } from "../lib/phone-context";
import { getUserOutboundNumber } from "../lib/phone-number-service";
import { canUsePlatformTwilio } from "../lib/platform-twilio-access";
import { ObjectStorageService } from "../lib/objectStorage";
import { resolveTelephonyOwner } from "../lib/telephony-owner";
import { broadcastChatMessage } from "../chatServer";
import { canDoInOrg, resolveCurrentOrgId } from "../lib/org-permissions";
import { getCallRecordingAccess } from "../lib/phone-recording-access";

const router = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const has = await hasFeature(req.user.id, req.user.email, "phone_system");
  if (!has) {
    res.status(403).json({ error: "CALLL HOME subscription required ($50/mo)", feature: "phone_system", price: 50, upgrade: "/pricing" });
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

function appAbsoluteUrl(req: Request, path: string): string {
  const host = getAppHost(req);
  const origin = /^https?:\/\//i.test(host) ? host.replace(/\/+$/, "") : `https://${host}`;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
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

// ── Pablo phone voice (ElevenLabs via <Play>) ───────────────────────────────
// Twilio can't speak ElevenLabs voices natively, so we cache each spoken line
// under a random token and serve a freshly-synthesized MP3 from
// /twilio/voice/pablo/:token that Twilio fetches with <Play>. If the assigned
// voice is unavailable, fail closed rather than silently substituting a voice.
// IMPORTANT: pass RAW (unescaped) text — escaping/encoding is handled here.
const pabloTtsCache = new Map<string, { text: string; expires: number }>();
const PABLO_TTS_TTL_MS = 5 * 60 * 1000;
const PABLO_TTS_MAX_ENTRIES = 500;

function cachePabloLine(text: string): string {
  const now = Date.now();
  for (const [k, v] of pabloTtsCache) {
    if (v.expires <= now) pabloTtsCache.delete(k);
  }
  while (pabloTtsCache.size >= PABLO_TTS_MAX_ENTRIES) {
    const oldest = pabloTtsCache.keys().next().value;
    if (oldest === undefined) break;
    pabloTtsCache.delete(oldest);
  }
  const token = randomBytes(16).toString("hex");
  pabloTtsCache.set(token, { text, expires: now + PABLO_TTS_TTL_MS });
  return token;
}

function pabloVoice(text: string, request?: Request): string {
  const clean = (text ?? "").trim();
  if (!clean) return "";
  const host = getAppHost(request);
  if (process.env.ELEVENLABS_API_KEY && host) {
    const token = cachePabloLine(clean);
    return `<Play>https://${host}/api/twilio/voice/pablo/${token}</Play>`;
  }
  return "";
}
// Existing TwiML builders share this helper name; the rendered voice and token
// route are Pablo's, backed exclusively by PABLO_VOICE_ID.
const milaVoice = pabloVoice;

// Public (Twilio-fetched) endpoint that streams Pablo's ElevenLabs MP3 for a
// previously-cached line. No auth: tokens are random + short-lived; the only
// thing exposed is the line's own audio.
router.all("/twilio/voice/pablo/:token", async (req, res) => {
  try {
    const token = req.params.token;
    const entry = pabloTtsCache.get(token);
    if (!entry || entry.expires <= Date.now()) {
      pabloTtsCache.delete(token);
      res.status(404).send("expired");
      return;
    }
    const buffer = await synthesizePabloLine(entry.text);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "no-store");
    res.end(buffer);
  } catch (err: unknown) {
    console.error("[Pablo voice] error:", err instanceof Error ? err.message : "Unknown");
    res.status(502).send("tts error");
  }
});

async function getUserOrgId(userId: string): Promise<number | null> {
  if (!userId) return null;
  try {
    const [user] = await db.select({ currentOrgId: usersTable.currentOrgId })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const currentOrgId = user?.currentOrgId ? Number(user.currentOrgId) : null;
    if (Number.isFinite(currentOrgId)) {
      const [current] = await db.select({ orgId: orgMembersTable.orgId })
        .from(orgMembersTable)
        .where(and(
          eq(orgMembersTable.userId, userId),
          eq(orgMembersTable.orgId, currentOrgId!),
          eq(orgMembersTable.status, "active"),
        )).limit(1);
      if (current) return current.orgId;
    }
    const rows = await db
      .select({ orgId: orgMembersTable.orgId })
      .from(orgMembersTable)
      .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
      .limit(1);
    return rows[0]?.orgId ?? null;
  } catch { return null; }
}

async function getCurrentPhoneOrgId(userId: string): Promise<number | null> {
  const [user] = await db.select({ currentOrgId: usersTable.currentOrgId })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const currentOrgId = user?.currentOrgId ? Number(user.currentOrgId) : null;
  if (Number.isFinite(currentOrgId) && currentOrgId) {
    const [membership] = await db.select({ orgId: orgMembersTable.orgId })
      .from(orgMembersTable)
      .where(and(
        eq(orgMembersTable.userId, userId),
        eq(orgMembersTable.orgId, currentOrgId),
        eq(orgMembersTable.status, "active"),
      )).limit(1);
    const [ownedOrg] = await db.select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, currentOrgId), eq(organizationsTable.ownerUserId, userId)))
      .limit(1);
    if (membership || ownedOrg) return currentOrgId;
  }
  const memberOrgId = await getUserOrgId(userId);
  if (memberOrgId) return memberOrgId;
  const [ownedOrg] = await db.select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.ownerUserId, userId))
    .limit(1);
  return ownedOrg?.id ?? null;
}

async function getPhoneSupervisionOrgId(userId: string): Promise<number | null> {
  const orgId = await resolveCurrentOrgId(userId);
  if (!orgId) return null;
  const permission = await canDoInOrg(userId, orgId, "phone.supervise");
  return permission.allowed ? orgId : null;
}

type InternalPhoneEmployee = {
  userId: string;
  orgId: number;
  role: string;
  title: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  email: string | null;
};

async function getActivePhoneEmployee(orgId: number, userId: string): Promise<InternalPhoneEmployee | null> {
  const [member] = await db.select({
    userId: orgMembersTable.userId,
    orgId: orgMembersTable.orgId,
    role: orgMembersTable.role,
    title: orgMembersTable.title,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    username: usersTable.username,
    email: usersTable.email,
  })
    .from(orgMembersTable)
    .innerJoin(usersTable, eq(orgMembersTable.userId, usersTable.id))
    .where(and(
      eq(orgMembersTable.orgId, orgId),
      eq(orgMembersTable.userId, userId),
      eq(orgMembersTable.status, "active"),
      eq(orgMembersTable.memberType, "employee"),
    ))
    .limit(1);
  if (!member || !await hasFeature(userId, member.email ?? "", "phone_system")) return null;
  return member;
}

const PHONE_ROLE_RANK: Record<string, number> = {
  specialist: 20,
  manager: 40,
  director: 60,
  executive: 80,
  ceo: 90,
  owner: 100,
  admin: 100,
};

type PhoneDialingPolicy = {
  maxConcurrency: number;
  minDelaySeconds: number;
  maxQueueSize: number;
};

const DEFAULT_PHONE_DIALING_POLICY: PhoneDialingPolicy = {
  maxConcurrency: 5,
  minDelaySeconds: 1,
  maxQueueSize: 250,
};

async function getPhoneOrgContext(userId: string): Promise<{ orgId: number | null; role: string; rank: number }> {
  const rows = await db.select({ orgId: orgMembersTable.orgId, role: orgMembersTable.role })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
    .limit(1);
  const row = rows[0];
  const role = row?.role ?? "user";
  return { orgId: row?.orgId ?? null, role, rank: PHONE_ROLE_RANK[role] ?? 0 };
}

function sanitizePhoneDialingPolicy(value: unknown): PhoneDialingPolicy {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawDelay = Number(raw.minDelaySeconds);
  return {
    maxConcurrency: Math.min(10, Math.max(1, Math.floor(Number(raw.maxConcurrency) || DEFAULT_PHONE_DIALING_POLICY.maxConcurrency))),
    minDelaySeconds: Math.min(30, Math.max(0, Number.isFinite(rawDelay) ? rawDelay : DEFAULT_PHONE_DIALING_POLICY.minDelaySeconds)),
    maxQueueSize: Math.min(1000, Math.max(1, Math.floor(Number(raw.maxQueueSize) || DEFAULT_PHONE_DIALING_POLICY.maxQueueSize))),
  };
}

async function getPhoneDialingPolicy(orgId: number | null): Promise<PhoneDialingPolicy> {
  if (!orgId) return DEFAULT_PHONE_DIALING_POLICY;
  const stored = await getSystemConfig(`phone_dialing_policy_org_${orgId}`);
  if (!stored) return DEFAULT_PHONE_DIALING_POLICY;
  try { return sanitizePhoneDialingPolicy(JSON.parse(stored)); } catch { return DEFAULT_PHONE_DIALING_POLICY; }
}

async function canAccessDialingSession(actorId: string, sessionOwnerId: string): Promise<boolean> {
  if (actorId === sessionOwnerId) return true;
  const [actor, owner] = await Promise.all([getPhoneOrgContext(actorId), getPhoneOrgContext(sessionOwnerId)]);
  return Boolean(actor.orgId && actor.orgId === owner.orgId && actor.rank >= PHONE_ROLE_RANK.manager);
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

async function hasRecordedPhoneCallConsent(userId: string, contactId: number): Promise<boolean> {
  const prefs = await db
    .select()
    .from(contactChannelPrefsTable)
    .where(and(
      eq(contactChannelPrefsTable.userId, userId),
      eq(contactChannelPrefsTable.contactId, contactId),
    ))
    .orderBy(desc(contactChannelPrefsTable.updatedAt))
    .limit(1);
  const pref = prefs[0];
  return Boolean(
    pref?.phoneCallOptIn &&
    pref.phoneCallConsentedAt &&
    !pref.phoneCallOptedOutAt
  );
}

async function persistSmsPreference(userId: string, contactId: number, smsOptIn: boolean): Promise<void> {
  const where = and(
    eq(contactChannelPrefsTable.userId, userId),
    eq(contactChannelPrefsTable.contactId, contactId),
  );
  const [existing] = await db.select({ id: contactChannelPrefsTable.id })
    .from(contactChannelPrefsTable)
    .where(where)
    .orderBy(desc(contactChannelPrefsTable.updatedAt))
    .limit(1);
  const now = new Date();
  const smsOptedOutAt = smsOptIn ? null : now;
  if (existing) {
    await db.update(contactChannelPrefsTable)
      .set({
        smsOptIn,
        smsOptedOutAt,
        ...(smsOptIn ? { smsConsentedAt: now } : {}),
        updatedAt: now,
      })
      .where(where);
    return;
  }
  await db.insert(contactChannelPrefsTable).values({
    userId,
    contactId,
    smsOptIn,
    smsOptedOutAt,
    smsConsentedAt: smsOptIn ? now : null,
  });
}

const RECORDING_RETENTION_DAYS = 1095;

function userRecordingPreferenceKey(userId: string): string {
  return `phone_recording_user_${userId}`;
}

function orgRecordingPreferenceKey(orgId: number): string {
  return `phone_recording_org_${orgId}`;
}

async function readRecordingPreference(key: string): Promise<boolean> {
  const [row] = await db.select({ value: systemConfigTable.value })
    .from(systemConfigTable)
    .where(eq(systemConfigTable.key, key))
    .limit(1);
  return row ? row.value === "true" : true;
}

async function writeRecordingPreference(key: string, enabled: boolean, userId: string, description: string) {
  const updatedAt = new Date();
  await db.insert(systemConfigTable).values({
    key,
    value: String(enabled),
    category: "phone_recording",
    description,
    updatedBy: userId,
    updatedAt,
  }).onConflictDoUpdate({
    target: systemConfigTable.key,
    set: { value: String(enabled), description, updatedBy: userId, updatedAt },
  });
}

async function isCallRecordingEnabled(userId: string, orgId: number | null): Promise<boolean> {
  if (!userId) return false;
  const [userEnabled, orgEnabled] = await Promise.all([
    readRecordingPreference(userRecordingPreferenceKey(userId)),
    orgId ? readRecordingPreference(orgRecordingPreferenceKey(orgId)) : Promise.resolve(true),
  ]);
  return userEnabled && orgEnabled;
}

function recordingAttrs(
  enabled: boolean,
  mode: "record-from-start" | "record-from-answer",
  callback?: string,
): string {
  if (!enabled) return "";
  return ` record="${mode}"${callback ? ` recordingStatusCallback="${escapeTwiml(callback)}" recordingStatusCallbackMethod="POST"` : ""}`;
}

function startRecordingTwiml(enabled: boolean, callback: string): string {
  return enabled
    ? `<Start><Recording recordingStatusCallback="${escapeTwiml(callback)}" recordingStatusCallbackMethod="POST" /></Start>`
    : "";
}

function getRetentionDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + RECORDING_RETENTION_DAYS);
  return d;
}

const TERMINAL_CALL_STATUSES = new Set(["completed", "failed", "busy", "no-answer", "canceled"]);
const CALL_STATUS_RANK: Record<string, number> = {
  queued: 0,
  initiated: 1,
  ringing: 2,
  answered: 3,
  "in-progress": 3,
  completed: 4,
  failed: 4,
  busy: 4,
  "no-answer": 4,
  canceled: 4,
};

function shouldAdvanceCallStatus(current: string, next: string): boolean {
  if (current === next) return true;
  if (TERMINAL_CALL_STATUSES.has(current)) return false;
  return (CALL_STATUS_RANK[next] ?? 0) > (CALL_STATUS_RANK[current] ?? 0);
}

async function downloadTwilioRecording(recordingUrl: string): Promise<{ bytes: Buffer; contentType: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) throw new Error("Twilio credentials not configured");
  const upstream = await fetch(`${recordingUrl}.mp3`, {
    headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` },
  });
  if (!upstream.ok) throw new Error(`Twilio recording download failed (${upstream.status})`);
  const bytes = Buffer.from(await upstream.arrayBuffer());
  if (!bytes.length) throw new Error("Twilio recording was empty");
  return { bytes, contentType: upstream.headers.get("content-type") ?? "audio/mpeg" };
}

async function archiveTwilioRecording(bytes: Buffer, contentType: string): Promise<string> {
  return new ObjectStorageService().uploadBuffer(bytes, contentType);
}

type CallHistoryInsert = typeof callHistoryTable.$inferInsert;

/**
 * Twilio can invoke status/recording callbacks before calls.create() returns.
 * Serialize by CallSid and merge creator details into any callback-first row.
 */
async function persistCallHistory(values: CallHistoryInsert) {
  if (!values.twilioCallSid) {
    const [row] = await db.insert(callHistoryTable).values(values).returning();
    return row;
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${values.twilioCallSid}))`);
    const [existing] = await tx.select()
      .from(callHistoryTable)
      .where(eq(callHistoryTable.twilioCallSid, values.twilioCallSid!))
      .limit(1);

    if (!existing) {
      const [inserted] = await tx.insert(callHistoryTable).values(values).onConflictDoNothing().returning();
      if (inserted) return inserted;
      const [raced] = await tx.select()
        .from(callHistoryTable)
        .where(eq(callHistoryTable.twilioCallSid, values.twilioCallSid!))
        .limit(1);
      if (!raced) throw new Error(`Call history conflict could not be recovered for ${values.twilioCallSid}`);
      return raced;
    }

    const patch: Partial<CallHistoryInsert> = {};
    if (existing.userId === "unknown" && values.userId !== "unknown") patch.userId = values.userId;
    if (existing.orgId == null && values.orgId != null) patch.orgId = values.orgId;
    if (existing.callerName == null && values.callerName) patch.callerName = values.callerName;
    if ((existing.recipientNumber === "unknown" || !existing.recipientNumber) && values.recipientNumber) {
      patch.recipientNumber = values.recipientNumber;
    }
    if (existing.callType === "single" && values.callType && values.callType !== "single") patch.callType = values.callType;
    if (values.consentGiven != null && values.consentGiven !== existing.consentGiven) {
      patch.consentGiven = values.consentGiven;
    }
    if (["initiated", "ringing"].includes(existing.status) && values.status
      && !["initiated", "ringing"].includes(values.status)) patch.status = values.status;
    if ((!existing.durationSeconds || existing.durationSeconds === 0) && values.durationSeconds != null) {
      patch.durationSeconds = values.durationSeconds;
    }
    if (existing.endedAt == null && values.endedAt) patch.endedAt = values.endedAt;
    if (existing.transcript == null && values.transcript) patch.transcript = values.transcript;
    if (existing.summary == null && values.summary) patch.summary = values.summary;
    if (existing.recordingUrl == null && values.recordingUrl) patch.recordingUrl = values.recordingUrl;
    if (existing.recordingSid == null && values.recordingSid) patch.recordingSid = values.recordingSid;
    if (existing.recordingRetainUntil == null && values.recordingRetainUntil) {
      patch.recordingRetainUntil = values.recordingRetainUntil;
    }
    if (existing.conferenceName == null && values.conferenceName) patch.conferenceName = values.conferenceName;
    if (existing.contactId == null && values.contactId != null) patch.contactId = values.contactId;
    if (existing.dialingSessionId == null && values.dialingSessionId != null) patch.dialingSessionId = values.dialingSessionId;
    if (existing.dialingQueueIndex == null && values.dialingQueueIndex != null) {
      patch.dialingQueueIndex = values.dialingQueueIndex;
    }
    if (existing.notes == null && values.notes) patch.notes = values.notes;

    if (Object.keys(patch).length === 0) return existing;
    const [merged] = await tx.update(callHistoryTable)
      .set(patch)
      .where(eq(callHistoryTable.id, existing.id))
      .returning();
    return merged;
  });
}

type CampaignCaptureField = "email" | "company" | "timezone";

function parseCampaignCaptureField(value: unknown): CampaignCaptureField | null {
  return value === "email" || value === "company" || value === "timezone" ? value : null;
}

function cleanCampaignCapture(field: CampaignCaptureField, value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > 250) return null;
  if (field === "email" && (cleaned.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned))) return null;
  if (field === "timezone") {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: cleaned }).format();
    } catch {
      return null;
    }
  }
  return cleaned;
}

async function saveCampaignContactCapture(
  userId: string,
  contactId: number,
  callSid: string,
  field: CampaignCaptureField,
  value: string,
): Promise<"updated" | "unchanged" | "review" | "missing"> {
  return db.transaction(async (tx) => {
    const [call] = await tx.select().from(callHistoryTable).where(and(
      eq(callHistoryTable.userId, userId),
      eq(callHistoryTable.twilioCallSid, callSid),
      eq(callHistoryTable.contactId, contactId),
    )).for("update").limit(1);
    if (!call) return "missing";
    const [contact] = await tx.select().from(contactsTable).where(and(
      eq(contactsTable.userId, userId),
      eq(contactsTable.id, contactId),
    )).for("update").limit(1);
    if (!contact) return "missing";

    let snapshot: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = call.contactSnapshotJson ? JSON.parse(call.contactSnapshotJson) : null;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) snapshot = parsed as Record<string, unknown>;
    } catch {}

    const currentValue = contact[field] ?? null;
    const hasBaseline = snapshot && Object.prototype.hasOwnProperty.call(snapshot, field);
    const baselineValue = hasBaseline && snapshot![field] != null ? String(snapshot![field]) : null;
    const label = field === "email" ? "email" : field === "company" ? "company" : "timezone";
    if (!hasBaseline || currentValue !== baselineValue) {
      await tx.insert(contactInteractionsTable).values({
        contactId,
        userId,
        type: "call_capture_review",
        note: `Caller shared ${label} "${value}" during a consented campaign call, but the CRM field changed after the call began. Review before applying.`,
      });
      return "review";
    }
    if (currentValue === value) return "unchanged";

    const baselinePredicate = baselineValue == null
      ? isNull(contactsTable[field])
      : eq(contactsTable[field], baselineValue);
    const changes = field === "email"
      ? { email: value }
      : field === "company"
        ? { company: value }
        : { timezone: value };
    const updated = await tx.update(contactsTable)
      .set(changes)
      .where(and(
        eq(contactsTable.userId, userId),
        eq(contactsTable.id, contactId),
        baselinePredicate,
      ))
      .returning({ id: contactsTable.id });
    if (!updated.length) {
      await tx.insert(contactInteractionsTable).values({
        contactId,
        userId,
        type: "call_capture_review",
        note: `Caller shared ${label} "${value}" during a consented campaign call, but the CRM field changed during capture. Review before applying.`,
      });
      return "review";
    }
    await tx.insert(contactInteractionsTable).values({
      contactId,
      userId,
      type: "call_capture",
      note: `Updated ${label} from a consented campaign call.`,
    });
    return "updated";
  });
}

const PABLO_VOICEMAIL_GREETING = "Thank you for calling. This is Pablo, your virtual office assistant. The person you are trying to reach is currently unavailable. Your call is important to us. Please leave a detailed message after the tone, including your name, number, and the reason for your call, and we will return your call as soon as possible.";

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

const recordingTranscriptionJobs = new Map<string, Promise<{ transcript: string; summary: string }>>();

async function transcribeRecordingOnce(recordingKey: string, audio: Buffer): Promise<{ transcript: string; summary: string }> {
  const existing = recordingTranscriptionJobs.get(recordingKey);
  if (existing) return existing;
  const job = (async () => {
    const transcript = (await speechToText(audio, "mp3")).trim();
    const summary = transcript ? await generateCallSummary(transcript) : "";
    return { transcript, summary };
  })();
  recordingTranscriptionJobs.set(recordingKey, job);
  try {
    return await job;
  } finally {
    if (recordingTranscriptionJobs.get(recordingKey) === job) recordingTranscriptionJobs.delete(recordingKey);
  }
}

async function sendMissedCallEmail(
  userId: string,
  fromNumber: string,
  fromName?: string,
  voicemailId?: number,
  req?: Request,
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const userEmail = (users[0] as { email?: string } | undefined)?.email;
    if (!userEmail) return;
    const voicemailLink = voicemailId && req
      ? appAbsoluteUrl(req, `/phone?tab=rec&voicemailId=${voicemailId}`)
      : "";
    await client.emails.send({
      from: fromEmail,
      to: [userEmail],
      subject: `Missed Call from ${fromName || fromNumber}`,
      html: `<div style="font-family:monospace;background:#030803;color:#00ff41;padding:24px;max-width:480px;">
<h2 style="color:#00ff41;letter-spacing:0.1em">[ MISSED CALL ]</h2>
<p><strong>From:</strong> ${htmlEscape(fromName || "Unknown")}</p>
<p><strong>Number:</strong> ${htmlEscape(fromNumber)}</p>
<p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
${voicemailLink ? `<p><a href="${htmlEscape(voicemailLink)}" style="color:#00ff41">Sign in to listen to the voicemail</a></p>` : ""}
<p style="color:rgba(0,255,65,0.5);font-size:0.8em">Calll Home · Business Phone System</p>
</div>`,
    });
  } catch (e: unknown) {
    console.error("[CalllHome] missed call email error:", e instanceof Error ? e.message : "Unknown");
  }
}

async function sendRecordingReadyEmailOnce(callId: number, userId: string, req: Request): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`recording-email:${callId}`}))`);
    const [call] = await tx.select().from(callHistoryTable)
      .where(and(eq(callHistoryTable.id, callId), eq(callHistoryTable.userId, userId)))
      .for("update")
      .limit(1);
    if (!call?.recordingUrl) return;
    if (readRecordingWorkflowState(call.transcriptEventsJson).emailSentAt) return;

    const [user] = await tx.select({ email: usersTable.email }).from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user?.email) return;
    const { client, fromEmail } = await getUncachableResendClient();
    const title = call.callerName || call.recipientNumber || "Call recording";
    const recordingLink = appAbsoluteUrl(req, `/phone?tab=rec&callId=${call.id}`);
    await client.emails.send({
      from: fromEmail,
      to: [user.email],
      subject: `Call recording ready: ${title}`,
      html: `<div style="font-family:Arial,sans-serif;color:#191919;padding:24px;max-width:560px">
<h2 style="margin:0 0 14px">Your call recording is ready</h2>
<p style="line-height:1.6">The recording has been saved to SALARYMAN. Sign in to view the transcript, playback, and any saved excerpts.</p>
<p><strong>Contact:</strong> ${htmlEscape(title)}<br><strong>Number:</strong> ${htmlEscape(call.recipientNumber)}</p>
<p><a href="${htmlEscape(recordingLink)}" style="display:inline-block;background:#151515;color:#fff;padding:10px 16px;text-decoration:none;border-radius:4px">Sign in to open recording</a></p>
<p style="font-size:12px;color:#666">This link does not grant recording access by itself. SALARYMAN sign-in and recording permissions are still required.</p>
</div>`,
    });
    await tx.update(callHistoryTable).set({
      transcriptEventsJson: updateRecordingWorkflowState(call.transcriptEventsJson, {
        ...readRecordingWorkflowState(call.transcriptEventsJson),
        emailSentAt: new Date().toISOString(),
      }),
    }).where(eq(callHistoryTable.id, call.id));
  });
}

async function saveRecordingAnalysis(
  callId: number,
  contractHighlights: ReturnType<typeof findContractualHighlights>,
  callerName?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [call] = await tx.select({
      callerName: callHistoryTable.callerName,
      transcriptEventsJson: callHistoryTable.transcriptEventsJson,
    }).from(callHistoryTable)
      .where(eq(callHistoryTable.id, callId))
      .for("update")
      .limit(1);
    if (!call) return;
    const state = readRecordingWorkflowState(call.transcriptEventsJson);
    await tx.update(callHistoryTable).set({
      transcriptEventsJson: updateRecordingWorkflowState(call.transcriptEventsJson, {
        ...state,
        contractHighlights,
      }),
      ...(!call.callerName && callerName ? { callerName: callerName.slice(0, 64) } : {}),
    }).where(eq(callHistoryTable.id, callId));
  });
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

router.get("/twilio/contacts", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Login required" });
      return;
    }
    const contacts = await db
      .select()
      .from(contactsTable)
      .where(eq(contactsTable.userId, userId))
      .orderBy(contactsTable.createdAt);
    res.json({
      contacts,
      total: contacts.length,
      dialable: contacts.filter(contact => contact.phone.trim() !== "").length,
    });
  } catch (err: unknown) {
    req.log.error({ error: err instanceof Error ? err.message : "Unknown error" }, "Failed to fetch CRM contacts for Phone Contacts");
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
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
let _apiKeyPromise: Promise<{ sid: string; secret: string }> | null = null;
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

async function isValidTwilioApiKey(candidate: { sid: string; secret: string }): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  if (!accountSid) return false;
  try {
    const keyClient = twilio(candidate.sid, candidate.secret, { accountSid });
    // Standard API keys intentionally cannot read the Accounts resource.
    // Calls is a supported Voice resource and therefore validates the exact
    // credential capability the browser phone needs.
    await keyClient.calls.list({ limit: 1 });
    return true;
  } catch (error) {
    console.warn(
      "[Twilio] Browser Voice API key rejected; replacing it:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return false;
  }
}

async function resolveTwilioApiKey(): Promise<{ sid: string; secret: string }> {
  if (_cachedApiKey) return _cachedApiKey;
  const envSid = process.env.TWILIO_API_KEY_SID;
  const envSecret = process.env.TWILIO_API_KEY_SECRET;
  const dbSid = await getSystemConfig("twilio_api_key_sid");
  const dbSecret = await getSystemConfig("twilio_api_key_secret");
  const candidates = [
    envSid && envSecret ? { sid: envSid, secret: envSecret } : null,
    dbSid && dbSecret ? { sid: dbSid, secret: dbSecret } : null,
  ].filter((candidate): candidate is { sid: string; secret: string } => Boolean(candidate));

  for (const candidate of candidates) {
    if (await isValidTwilioApiKey(candidate)) {
      _cachedApiKey = candidate;
      process.env.TWILIO_API_KEY_SID = candidate.sid;
      process.env.TWILIO_API_KEY_SECRET = candidate.secret;
      if (dbSid !== candidate.sid || dbSecret !== candidate.secret) {
        await setSystemConfig("twilio_api_key_sid", candidate.sid);
        await setSystemConfig("twilio_api_key_secret", candidate.secret);
      }
      return candidate;
    }
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

async function ensureTwilioApiKey(): Promise<{ sid: string; secret: string }> {
  if (_cachedApiKey) return _cachedApiKey;
  if (!_apiKeyPromise) {
    _apiKeyPromise = resolveTwilioApiKey().finally(() => {
      _apiKeyPromise = null;
    });
  }
  return _apiKeyPromise;
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

  if (String(req.query.event ?? "") === "internal-result") {
    if (!validateTwilioWebhook(req)) {
      res.status(403).send("Forbidden");
      return;
    }
    const callerUserId = String(req.query.callerUserId ?? "");
    const callSid = String(req.body?.CallSid ?? "");
    const dialStatus = String(req.body?.DialCallStatus ?? "failed");
    const duration = Number(req.body?.DialCallDuration);
    if (callerUserId && callSid) {
      await db.update(callHistoryTable).set({
        status: dialStatus,
        ...(Number.isFinite(duration) && duration >= 0 ? { durationSeconds: Math.floor(duration) } : {}),
        endedAt: new Date(),
      }).where(and(
        eq(callHistoryTable.userId, callerUserId),
        eq(callHistoryTable.twilioCallSid, callSid),
        eq(callHistoryTable.callType, "internal_employee"),
      ));
    }
    if (dialStatus === "completed") {
      res.send("<Response><Hangup/></Response>");
    } else {
      res.send("<Response><Say>The employee is unavailable right now. Please try again later.</Say><Hangup/></Response>");
    }
    return;
  }

  if (identity && confName.startsWith("employee:")) {
    if (!validateTwilioWebhook(req)) {
      res.status(403).send("Forbidden");
      return;
    }
    const targetUserId = confName.slice("employee:".length);
    const callSid = String(req.body?.CallSid ?? "");
    try {
      const orgId = await getCurrentPhoneOrgId(identity);
      const [caller, target] = orgId
        ? await Promise.all([
            getActivePhoneEmployee(orgId, identity),
            getActivePhoneEmployee(orgId, targetUserId),
          ])
        : [null, null];
      const [callerCanUseTwilio, targetCanUseTwilio] = caller && target
        ? await Promise.all([
            canUsePlatformTwilio(identity, caller.email ?? ""),
            canUsePlatformTwilio(targetUserId, target.email ?? ""),
          ])
        : [false, false];
      if (!orgId || !callSid || identity === targetUserId || !caller || !target
        || !callerCanUseTwilio || !targetCanUseTwilio) {
        res.send("<Response><Say>This employee is unavailable on your CALLL HOME plan.</Say><Hangup/></Response>");
        return;
      }

      const host = getAppHost(req);
      const base = host ? `https://${host}/api` : "/api";
      const actionUrl = `${base}/twilio/twiml/client-voice?event=internal-result&amp;callerUserId=${encodeURIComponent(identity)}`;
      const targetName = `${target.firstName ?? ""} ${target.lastName ?? ""}`.trim() || target.username || "CALLL HOME employee";
      await persistCallHistory({
        userId: identity,
        orgId,
        callerName: targetName,
        recipientNumber: "CALLL HOME employee",
        twilioCallSid: callSid,
        status: "initiated",
        direction: "outbound",
        callType: "internal_employee",
        consentGiven: true,
      });
      const recordingCallback = `${base}/twilio/webhook/recording?userId=${encodeURIComponent(identity)}&amp;type=call&amp;callType=internal_employee`;
      const recordingEnabled = await isCallRecordingEnabled(identity, orgId);
      res.send(`<Response><Dial action="${actionUrl}" method="POST" timeout="25"${recordingAttrs(recordingEnabled, "record-from-answer", recordingCallback)}><Client>${escapeTwiml(targetUserId)}</Client></Dial></Response>`);
      return;
    } catch (err) {
      req.log.error({ err }, "CALLL HOME internal call could not be started");
      res.send("<Response><Say>Unable to connect this call. Please try again later.</Say><Hangup/></Response>");
      return;
    }
  }

  if (identity && confName.startsWith(`conf-${identity}-`)) {
    res.send(`<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">${escapeTwiml(confName)}</Conference></Dial></Response>`);
  } else {
    res.send(`<Response><Say>Unable to connect. Please try again.</Say></Response>`);
  }
});

router.post("/twilio/call", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const { recipientNumber, callerName, contactName, contactId, leadId, countryCode } = req.body;
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(400).json({ error: "recipientNumber required" });
      return;
    }
    const orgId = await getUserOrgId(userId);
    let authoritativeNumber = recipientNumber;
    let authoritativeName = contactName || callerName;
    let resolvedLeadId: number | undefined;
    let resolvedContactId = contactId ? Number(contactId) : undefined;

    if (leadId != null) {
      const numericLeadId = Number(leadId);
      const [lead] = await db.select({
        id: leadRecordsTable.id,
        orgId: leadRecordsTable.orgId,
        name: leadRecordsTable.name,
        phone: leadRecordsTable.phone,
      }).from(leadRecordsTable)
        .where(and(eq(leadRecordsTable.id, numericLeadId), orgId ? eq(leadRecordsTable.orgId, orgId) : sql`false`))
        .limit(1);
      if (!lead) {
        res.status(404).json({ error: "CRM lead not found in your organization" });
        return;
      }
      if (!lead.phone) {
        res.status(400).json({ error: "CRM lead has no phone number" });
        return;
      }
      authoritativeNumber = lead.phone;
      authoritativeName = lead.name;
      resolvedLeadId = lead.id;
    } else if (resolvedContactId) {
      const [contact] = await db.select({
        id: contactsTable.id,
        name: contactsTable.name,
        phone: contactsTable.phone,
      }).from(contactsTable)
        .where(and(eq(contactsTable.id, resolvedContactId), eq(contactsTable.userId, userId)))
        .limit(1);
      if (!contact) {
        res.status(404).json({ error: "Contact not found" });
        return;
      }
      if (!contact.phone) {
        res.status(400).json({ error: "Contact has no phone number" });
        return;
      }
      authoritativeNumber = contact.phone;
      authoritativeName = contact.name;
    }
    if (!authoritativeNumber) {
      res.status(400).json({ error: "recipientNumber required" });
      return;
    }
    const callCountry = typeof countryCode === "string" && /^[A-Za-z]{2}$/.test(countryCode)
      ? countryCode.toUpperCase()
      : DEFAULT_COUNTRY;
    const e164 = toE164(authoritativeNumber, callCountry);
    if (!e164) {
      res.status(400).json({ error: "Invalid phone number format" });
      return;
    }
    const { checkAndEnforce, throttleResponse } = await import("../lib/usage-meter");
    const gate = await checkAndEnforce(userId, req.user?.email, "voice_minutes", 1);
    if (!gate.allowed) {
      res.status(429).json(throttleResponse("voice_minutes", gate.used, gate.limit));
      return;
    }
    // checkAndEnforce atomically consumes one usage unit before dialing.
    const client = getTwilioClient();
    const fromNumber = await getUserOutboundNumber(userId);

    const confName = `conf-${userId}-${Date.now()}`;

    const _protocol = "https";
    const _host = getAppHost();
    const _baseUrl = _host ? `${_protocol}://${_host}/api` : "/api";
    const _statusCallbackUrl = _host
      ? `${_baseUrl}/twilio/webhook/status?userId=${encodeURIComponent(userId)}&callType=conference`
      : undefined;
    const _recordingCallback = _host
      ? `${_baseUrl}/twilio/webhook/recording?userId=${encodeURIComponent(userId)}&type=call&callType=conference&conferenceName=${encodeURIComponent(confName)}`
      : undefined;

    const recordingEnabled = await isCallRecordingEnabled(userId, orgId);
    const twiml = `<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false" waitUrl=""${recordingAttrs(recordingEnabled, "record-from-start", _recordingCallback)}>${confName}</Conference></Dial></Response>`;

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

    let resolvedContactName = (authoritativeName || "").slice(0, 64) || null;
    if (!resolvedContactId) {
      const crmMatch = await matchContactByPhone(userId, e164);
      if (crmMatch) {
        resolvedContactId = crmMatch.contactId;
        resolvedContactName = resolvedContactName || crmMatch.contactName;
      }
    }

    const record = await persistCallHistory({
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
      });

    const crmActivityId = await recordTelephonyActivity({
      userId,
      orgId,
      leadId: resolvedLeadId,
      contactId: resolvedContactId,
      channel: "call",
      direction: "outbound",
      phone: e164,
      contactName: resolvedContactName,
      status: call.status ?? "initiated",
      twilioSid: call.sid,
    });

    res.json({
      ok: true,
      callSid: call.sid,
      callId: record.id,
      crmActivityId,
      leadId: resolvedLeadId,
      contactId: resolvedContactId,
      status: call.status,
      to: e164,
      conferenceName: confName,
    });
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
    const transferCountry = typeof req.body?.countryCode === "string" && /^[A-Za-z]{2}$/.test(req.body.countryCode)
      ? req.body.countryCode.toUpperCase()
      : DEFAULT_COUNTRY;
    const e164 = toE164(transferTo, transferCountry);
    if (!e164) {
      res.status(400).json({ error: "Invalid transfer number" });
      return;
    }
    const client = getTwilioClient();
    const orgId = await getUserOrgId(userId);
    const recordingEnabled = await isCallRecordingEnabled(userId, orgId);
    const transferHost = getAppHost(req);
    if (recordingEnabled && !transferHost) {
      res.status(503).json({ error: "Call recording is unavailable. Please retry the transfer." });
      return;
    }
    const transferRecordingCallback = transferHost
      ? `https://${transferHost}/api/twilio/webhook/recording?userId=${encodeURIComponent(userId)}&type=call&callType=transfer`
      : undefined;
    await client.calls(callSid).update({
      twiml: `<Response><Dial${recordingAttrs(recordingEnabled, "record-from-answer", transferRecordingCallback)}><Number>${e164}</Number></Dial></Response>`,
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
    const conferenceCountry = typeof req.body?.countryCode === "string" && /^[A-Za-z]{2}$/.test(req.body.countryCode)
      ? req.body.countryCode.toUpperCase()
      : DEFAULT_COUNTRY;
    const e164 = toE164(phoneNumber, conferenceCountry);
    if (!e164) {
      res.status(400).json({ error: "Invalid phone number" });
      return;
    }
    const client = getTwilioClient();
    const fromNumber = await getUserOutboundNumber(userId);
    const _confHost = getAppHost();
    const _confStatusUrl = _confHost
      ? `https://${_confHost}/api/twilio/webhook/status?userId=${encodeURIComponent(userId)}&callType=conference`
      : undefined;
    const _confEventUrl = _confHost ? `https://${_confHost}/api/twilio/webhook/conference-status` : undefined;
    const _confRecordingUrl = _confHost
      ? `https://${_confHost}/api/twilio/webhook/recording?userId=${encodeURIComponent(userId)}&type=call&callType=conference&conferenceName=${encodeURIComponent(roomName)}`
      : undefined;
    const recordingEnabled = await isCallRecordingEnabled(userId, await getUserOrgId(userId));
    const confTwiml = _confEventUrl
      ? `<Response><Say voice="Google.en-US-Neural2-F">You are being connected to a conference call.</Say><Dial><Conference${recordingAttrs(recordingEnabled, "record-from-start", _confRecordingUrl)} statusCallback="${_confEventUrl}" statusCallbackEvent="start end join leave mute hold" statusCallbackMethod="POST">${roomName}</Conference></Dial></Response>`
      : `<Response><Say voice="Google.en-US-Neural2-F">You are being connected to a conference call.</Say><Dial><Conference${recordingAttrs(recordingEnabled, "record-from-start", _confRecordingUrl)}>${roomName}</Conference></Dial></Response>`;
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
    // Conference participants are real outbound calls too. Persist the owner
    // before Twilio can deliver a status callback, then let all callbacks
    // enrich this same CRM activity by CallSid.
    const conferenceOrgId = await getUserOrgId(userId);
    const conferenceContact = await matchContactByPhone(userId, e164);
    await persistCallHistory({
      userId,
      orgId: conferenceOrgId ?? undefined,
      callerName: name ?? conferenceContact?.contactName ?? null,
      recipientNumber: e164,
      twilioCallSid: call.sid,
      status: call.status ?? "initiated",
      direction: "outbound",
      callType: "conference",
      conferenceName: roomName,
      contactId: conferenceContact?.contactId,
      consentGiven: true,
      recordingRetainUntil: getRetentionDate(),
    });
    await recordTelephonyActivity({
      userId,
      orgId: conferenceOrgId,
      channel: "call",
      direction: "outbound",
      phone: e164,
      contactName: name ?? conferenceContact?.contactName,
      contactId: conferenceContact?.contactId,
      status: call.status ?? "initiated",
      twilioSid: call.sid,
    }).catch(() => {});

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
    const [ownedRoom] = await db
      .select({ id: conferenceRoomsTable.id })
      .from(conferenceRoomsTable)
      .where(and(
        eq(conferenceRoomsTable.roomName, roomName),
        eq(conferenceRoomsTable.userId, userId),
        eq(conferenceRoomsTable.status, "active"),
      ))
      .limit(1);
    if (!ownedRoom) {
      res.status(403).json({ error: "Not authorized to end this conference" });
      return;
    }
    await db
      .update(conferenceRoomsTable)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(conferenceRoomsTable.id, ownedRoom.id));
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
    const { mode, numbers, contactIds, settings } = req.body;
    if (!["power", "auto", "predictive"].includes(mode)) {
      res.status(400).json({ error: "mode must be power, auto, or predictive" });
      return;
    }
    const orgContext = await getPhoneOrgContext(userId);
    const policy = await getPhoneDialingPolicy(orgContext.orgId);
    const dialCountry = typeof req.body?.countryCode === "string" && /^[A-Za-z]{2}$/.test(req.body.countryCode)
      ? req.body.countryCode.toUpperCase()
      : DEFAULT_COUNTRY;
    const requiresContactConsent = mode === "auto" || mode === "predictive";
    type DialingQueueEntry = { phone: string; name?: string; contactId?: number; consentGiven: boolean };
    let queue: DialingQueueEntry[] = [];
    if (contactIds !== undefined) {
      if (!Array.isArray(contactIds) || contactIds.length === 0 ||
        contactIds.some((id: unknown) => !Number.isInteger(id) || Number(id) <= 0) ||
        new Set(contactIds).size !== contactIds.length) {
        res.status(400).json({ error: "Choose unique saved contacts for the dialing queue." });
        return;
      }
      const ids = contactIds as number[];
      const contacts = await db.select().from(contactsTable).where(and(
        eq(contactsTable.userId, userId),
        inArray(contactsTable.id, ids),
      ));
      if (contacts.length !== ids.length) {
        res.status(400).json({ error: "Dialing sessions can only use your saved contacts." });
        return;
      }
      const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
      const prefs = await db.select().from(contactChannelPrefsTable).where(and(
        eq(contactChannelPrefsTable.userId, userId),
        inArray(contactChannelPrefsTable.contactId, ids),
      )).orderBy(desc(contactChannelPrefsTable.updatedAt));
      const consentById = new Map<number, boolean>();
      for (const pref of prefs) {
        if (!consentById.has(pref.contactId)) {
          consentById.set(pref.contactId, Boolean(
            pref.phoneCallOptIn && pref.phoneCallConsentedAt && !pref.phoneCallOptedOutAt
          ));
        }
      }
      queue = ids.map((contactId) => {
        const contact = contactsById.get(contactId)!;
        return {
          phone: toE164(contact.phone, dialCountry) ?? "",
          name: contact.name?.slice(0, 128),
          contactId,
          consentGiven: consentById.get(contactId) === true,
        };
      });
      if (queue.some((entry) => !entry.phone)) {
        res.status(400).json({ error: "Every selected contact needs a valid saved phone number." });
        return;
      }
      if (requiresContactConsent && queue.some((entry) => !entry.consentGiven)) {
        res.status(409).json({ error: "Auto and predictive dialing require recorded phone-call permission for every saved contact." });
        return;
      }
    } else if (requiresContactConsent) {
      res.status(400).json({ error: "Auto and predictive dialing require selected saved contact IDs; pasted phone numbers are not accepted." });
      return;
    } else if (Array.isArray(numbers)) {
      const seen = new Set<string>();
      queue = numbers.flatMap((entry: unknown) => {
        if (!entry || typeof entry !== "object") return [];
        const raw = entry as { phone?: unknown; name?: unknown };
        const phone = toE164(String(raw.phone ?? ""), dialCountry);
        if (!phone || seen.has(phone)) return [];
        seen.add(phone);
        return [{ phone, name: typeof raw.name === "string" ? raw.name.slice(0, 128) : undefined, consentGiven: false }];
      });
    } else {
      res.status(400).json({ error: "Saved contact IDs or a numbers array is required." });
      return;
    }
    if (queue.length === 0) {
      res.status(400).json({ error: "No valid phone numbers supplied" });
      return;
    }
    if (queue.length > policy.maxQueueSize) {
      res.status(400).json({ error: `Queue exceeds the organization limit of ${policy.maxQueueSize} numbers` });
      return;
    }
    const requestedConcurrency = Math.floor(Number(settings?.concurrency) || 3);
    const requestedDelay = Number(settings?.delayBetweenCalls);
    const effectiveSettings = {
      concurrency: Math.min(policy.maxConcurrency, Math.max(1, requestedConcurrency)),
      delayBetweenCalls: Math.max(policy.minDelaySeconds, Number.isFinite(requestedDelay) ? requestedDelay : 5),
      countryCode: dialCountry,
      recording: await isCallRecordingEnabled(userId, orgContext.orgId),
    };
    const client = getTwilioClient();
    const fromNumber = await getUserOutboundNumber(userId);
    const [session] = await db
      .insert(dialingSessionsTable)
      .values({
        userId,
        mode,
        status: "running",
        totalNumbers: queue.length,
        queueJson: JSON.stringify(queue),
        settingsJson: JSON.stringify(effectiveSettings),
      })
      .returning();

    const callerName = getAuthUserId(req);
    const settingsConcurrency = effectiveSettings.concurrency;
    let dialCount = mode === "predictive" ? Math.min(settingsConcurrency, queue.length) : 1;
    const results: Array<{ ok: boolean; phone: string; name?: string; callSid?: string; error?: string; status?: string; conferenceName?: string }> = [];
    const _dialingHost = getAppHost();
    const _dialingStatusUrl = _dialingHost
      ? `https://${_dialingHost}/api/twilio/webhook/status?userId=${encodeURIComponent(userId)}&callType=${encodeURIComponent(`${mode}_dialing`)}`
      : undefined;
    let pauseReason: string | undefined;

    const { consumeUsage, throttleResponse: throttleResp } = await import("../lib/usage-meter");
    for (let i = 0; i < dialCount; i++) {
      const entry = queue[i];
      const e164 = toE164(entry.phone, dialCountry);
      if (!e164) {
        pauseReason = "A queued number is invalid. The dialing session was stopped.";
        results.push({ ok: false, phone: entry.phone, error: "Invalid number" });
        break;
      }
      const dialCrmMatch = entry.contactId
        ? { contactId: entry.contactId }
        : await matchContactByPhone(userId, e164, dialCountry);
      const consentGiven = dialCrmMatch
        ? await hasRecordedPhoneCallConsent(userId, dialCrmMatch.contactId)
        : false;
      entry.consentGiven = consentGiven;
      if (requiresContactConsent && (!entry.contactId || !consentGiven)) {
        pauseReason = "Recorded phone-call permission is no longer active. The dialing session was stopped.";
        results.push({ ok: false, phone: e164, name: entry.name, error: pauseReason });
        break;
      }
      const dialGate = await consumeUsage(userId, req.user?.email, "voice_minutes", 1);
      if (!dialGate.allowed) {
        pauseReason = throttleResp("voice_minutes", dialGate.used, dialGate.limit).message;
        results.push({ ok: false, phone: entry.phone, error: pauseReason });
        break;
      }
      let createdCallSid: string | undefined;
      try {
        const confName = `conf-${userId}-${Date.now()}-${i}`;
        const recordingCallback = _dialingHost
          ? `https://${_dialingHost}/api/twilio/webhook/recording?userId=${encodeURIComponent(userId)}&type=call&callType=${encodeURIComponent(`${mode}_dialing`)}&conferenceName=${encodeURIComponent(confName)}`
          : "";
        const conference = `<Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false" waitUrl=""${recordingAttrs(effectiveSettings.recording, "record-from-start", recordingCallback)}>${confName}</Conference>`;
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
        createdCallSid = call.sid;
        const dialOrgId = await getUserOrgId(userId);
        await persistCallHistory({
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
          consentGiven,
          recordingRetainUntil: getRetentionDate(),
        });
        await recordTelephonyActivity({
          userId,
          orgId: dialOrgId,
          channel: "call",
          direction: "outbound",
          phone: e164,
          contactName: (entry.name || callerName || "").slice(0, 64) || undefined,
          contactId: dialCrmMatch?.contactId,
          status: call.status ?? "initiated",
          twilioSid: call.sid,
        }).catch(() => {});
        results.push({ ok: true, phone: e164, name: entry.name, callSid: call.sid, conferenceName: confName });
      } catch (e: unknown) {
        if (createdCallSid) {
          await client.calls(createdCallSid).update({ status: "completed" }).catch(() => {});
        }
        pauseReason = "Call creation could not be confirmed. The session stopped; review call history before restarting.";
        results.push({ ok: false, phone: e164, name: entry.name, error: pauseReason });
        break;
      }
    }

    const paused = Boolean(pauseReason);
    await db.update(dialingSessionsTable).set({
      dialedCount: results.filter((r) => r.ok).length,
      queueJson: JSON.stringify(queue),
      ...(paused ? { status: "stopped", endedAt: new Date() } : {}),
    }).where(eq(dialingSessionsTable.id, session.id));

    res.json({
      ok: true,
      sessionId: session.id,
      mode,
      calls: results,
      queue,
      settings: effectiveSettings,
      policy,
      paused,
      ...(pauseReason ? { error: pauseReason } : {}),
    });
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

router.get("/twilio/dialing/policy", requireAuth, requireFeature("phone_system"), async (req, res) => {
  const actor = await getPhoneOrgContext(getAuthUserId(req));
  const policy = await getPhoneDialingPolicy(actor.orgId);
  res.json({ policy, role: actor.role, canManage: actor.rank >= PHONE_ROLE_RANK.manager });
});

router.put("/twilio/dialing/policy", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const actor = await getPhoneOrgContext(getAuthUserId(req));
    if (!actor.orgId || actor.rank < PHONE_ROLE_RANK.manager) {
      res.status(403).json({ error: "Organization manager or director access required" });
      return;
    }
    const policy = sanitizePhoneDialingPolicy(req.body);
    await setSystemConfig(`phone_dialing_policy_org_${actor.orgId}`, JSON.stringify(policy));
    res.json({ ok: true, policy });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update dialing policy" });
  }
});

router.post("/twilio/dialing/:sessionId/next", requireAuth, requireFeature("phone_system"), async (req, res) => {
  let claimedSessionId: number | undefined;
  let userId: string | undefined;
  let createdCallSid: string | undefined;
  try {
    const currentUserId = getAuthUserId(req);
    userId = currentUserId;
    const sessionId = Number(req.params.sessionId);
    claimedSessionId = sessionId;
    const claim = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(17, ${sessionId})`);
      const [locked] = await tx
        .select()
        .from(dialingSessionsTable)
        .where(and(eq(dialingSessionsTable.id, sessionId), eq(dialingSessionsTable.userId, currentUserId)))
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
    const stopClaimedSession = async () => {
      await db.update(dialingSessionsTable)
        .set({ status: "stopped", endedAt: new Date() })
        .where(and(
          eq(dialingSessionsTable.id, sessionId),
          eq(dialingSessionsTable.userId, userId!),
          eq(dialingSessionsTable.status, "running"),
        ));
    };
    if (!session || session.status !== "running") {
      res.status(409).json({ paused: true, error: "The dialing session is no longer running." });
      return;
    }
    const queue: Array<{ phone: string; name?: string; contactId?: number; consentGiven?: boolean }> = JSON.parse(session.queueJson ?? "[]");
    const sessionSettings = JSON.parse(session.settingsJson ?? "{}");
    const dialCountry = typeof sessionSettings.countryCode === "string" && /^[A-Za-z]{2}$/.test(sessionSettings.countryCode)
      ? sessionSettings.countryCode.toUpperCase()
      : DEFAULT_COUNTRY;
    const requiresContactConsent = session.mode === "auto" || session.mode === "predictive";
    const dialed = claim.index;
    if (dialed >= queue.length) {
      await db.update(dialingSessionsTable).set({ status: "completed", endedAt: new Date() }).where(eq(dialingSessionsTable.id, sessionId));
      res.json({ ok: true, completed: true, message: "All numbers have been dialed" });
      return;
    }
    const entry = queue[dialed];
    let e164 = toE164(entry.phone, dialCountry);
    if (!e164) {
      await stopClaimedSession();
      res.status(409).json({ paused: true, error: "The queued number is invalid. The dialing session was stopped." });
      return;
    }
    let contactId = entry.contactId;
    if (contactId) {
      const [contact] = await db.select({ id: contactsTable.id, phone: contactsTable.phone })
        .from(contactsTable)
        .where(and(eq(contactsTable.id, contactId), eq(contactsTable.userId, userId)))
        .limit(1);
      const currentPhone = contact ? toE164(contact.phone, dialCountry) : null;
      if (!contact || !currentPhone || currentPhone !== e164) {
        await stopClaimedSession();
        res.status(409).json({ paused: true, error: "A saved contact was removed or its phone number changed. Review the queue and restart it." });
        return;
      }
      e164 = currentPhone;
    }
    if (requiresContactConsent && !contactId) {
      await stopClaimedSession();
      res.status(409).json({ paused: true, error: "This automatic queue has no saved contact permission record. The session was stopped." });
      return;
    }
    if (requiresContactConsent && !await hasRecordedPhoneCallConsent(userId, contactId!)) {
      await stopClaimedSession();
      res.status(409).json({ paused: true, error: "Recorded phone-call permission is no longer active. The session was stopped." });
      return;
    }
    const nextCrmMatch = contactId
      ? { contactId }
      : await matchContactByPhone(userId, e164, dialCountry);
    const consentGiven = nextCrmMatch
      ? await hasRecordedPhoneCallConsent(userId, nextCrmMatch.contactId)
      : false;
    if (requiresContactConsent && !consentGiven) {
      await stopClaimedSession();
      res.status(409).json({ paused: true, error: "Recorded phone-call permission is no longer active. The session was stopped." });
      return;
    }
    const client = getTwilioClient();
    const fromNumber = await getUserOutboundNumber(userId);
    const _nextHost = getAppHost();
    const _nextStatusUrl = _nextHost
      ? `https://${_nextHost}/api/twilio/webhook/status?userId=${encodeURIComponent(userId)}&callType=${encodeURIComponent(`${session.mode}_dialing`)}`
      : undefined;
    const { consumeUsage, throttleResponse: tr } = await import("../lib/usage-meter");
    const g = await consumeUsage(userId, req.user?.email, "voice_minutes", 1);
    if (!g.allowed) {
      await stopClaimedSession();
      res.status(429).json({ ...tr("voice_minutes", g.used, g.limit), paused: true });
      return;
    }
    const confName = `conf-${userId}-${Date.now()}`;
    const recordingCallback = _nextHost
      ? `https://${_nextHost}/api/twilio/webhook/recording?userId=${encodeURIComponent(userId)}&type=call&callType=${encodeURIComponent(`${session.mode}_dialing`)}&conferenceName=${encodeURIComponent(confName)}`
      : "";
    const nextOrgId = await getUserOrgId(userId);
    const recordingEnabled = await isCallRecordingEnabled(userId, nextOrgId);
    try {
      const call = await client.calls.create({
        to: e164,
        from: fromNumber,
        twiml: `<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false" waitUrl=""${recordingAttrs(recordingEnabled, "record-from-start", recordingCallback)}>${confName}</Conference></Dial></Response>`,
        ...(_nextStatusUrl && {
          statusCallback: _nextStatusUrl,
          statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
          statusCallbackMethod: "POST",
        }),
      });
      createdCallSid = call.sid;
      await persistCallHistory({
        userId, orgId: nextOrgId ?? undefined, recipientNumber: e164, twilioCallSid: call.sid, callerName: entry.name ?? null,
        status: call.status ?? "initiated", direction: "outbound", callType: session.mode + "_dialing",
        dialingSessionId: sessionId, dialingQueueIndex: dialed,
        conferenceName: confName,
        contactId: nextCrmMatch?.contactId, consentGiven, recordingRetainUntil: getRetentionDate(),
      });
      await recordTelephonyActivity({
        userId,
        orgId: nextOrgId,
        channel: "call",
        direction: "outbound",
        phone: e164,
        contactName: entry.name,
        contactId: nextCrmMatch?.contactId,
        status: call.status ?? "initiated",
        twilioSid: call.sid,
      }).catch(() => {});
      const rawDelay = typeof sessionSettings.delayBetweenCalls === "number" ? sessionSettings.delayBetweenCalls : 5;
      const delayBetweenCalls = Math.min(Math.max(rawDelay, 0), 30);
      res.json({ ok: true, callSid: call.sid, phone: e164, name: entry.name, remaining: queue.length - dialed - 1, conferenceName: confName, delayBetweenCalls });
    } catch {
      if (createdCallSid) await client.calls(createdCallSid).update({ status: "completed" }).catch(() => {});
      await stopClaimedSession();
      res.status(503).json({
        paused: true,
        error: "Call creation could not be confirmed. The session stopped; review call history before restarting.",
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] dialing next error:", msg);
    if (claimedSessionId && userId) {
      await db.update(dialingSessionsTable)
        .set({ status: "stopped", endedAt: new Date() })
        .where(and(
          eq(dialingSessionsTable.id, claimedSessionId),
          eq(dialingSessionsTable.userId, userId),
          eq(dialingSessionsTable.status, "running"),
        ))
        .catch(() => {});
      res.status(503).json({
        paused: true,
        error: "The dialing request failed after claiming a queue item. The session stopped; review call history before restarting.",
      });
    } else {
      res.status(500).json({ error: msg });
    }
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
    const actor = await getPhoneOrgContext(userId);
    let visibleUserIds = [userId];
    if (actor.orgId && actor.rank >= PHONE_ROLE_RANK.manager) {
      const members = await db.select({ userId: orgMembersTable.userId })
        .from(orgMembersTable)
        .where(and(eq(orgMembersTable.orgId, actor.orgId), eq(orgMembersTable.status, "active")));
      visibleUserIds = members.map(member => member.userId);
    }
    const sessions = await db
      .select()
      .from(dialingSessionsTable)
      .where(inArray(dialingSessionsTable.userId, visibleUserIds))
      .orderBy(desc(dialingSessionsTable.startedAt))
      .limit(20);
    res.json({ sessions, scope: actor.rank >= PHONE_ROLE_RANK.manager ? "organization" : "user" });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

router.get("/twilio/dialing/:sessionId/attempts", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const actorId = getAuthUserId(req);
    const sessionId = Number(req.params.sessionId);
    const [session] = await db.select().from(dialingSessionsTable).where(eq(dialingSessionsTable.id, sessionId)).limit(1);
    if (!session || !await canAccessDialingSession(actorId, session.userId)) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const attempts = await db.select({
      id: callHistoryTable.id,
      queueIndex: callHistoryTable.dialingQueueIndex,
      phone: callHistoryTable.recipientNumber,
      name: callHistoryTable.callerName,
      contactId: callHistoryTable.contactId,
      callSid: callHistoryTable.twilioCallSid,
      status: callHistoryTable.status,
      durationSeconds: callHistoryTable.durationSeconds,
      recordingSid: callHistoryTable.recordingSid,
      recordingUrl: callHistoryTable.recordingUrl,
      startedAt: callHistoryTable.startedAt,
      endedAt: callHistoryTable.endedAt,
    }).from(callHistoryTable)
      .where(eq(callHistoryTable.dialingSessionId, sessionId))
      .orderBy(asc(callHistoryTable.dialingQueueIndex));
    res.json({ session, attempts });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch session attempts" });
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
    const inbOrgId = telephonyOwner?.orgId ?? (userId ? await getUserOrgId(userId) : null);
    const recordingEnabled = userId ? await isCallRecordingEnabled(userId, inbOrgId) : false;
    const fullRecordingCallback = `${base}/twilio/webhook/recording?userId=${encodeURIComponent(userId ?? "")}&amp;type=call`;
    const fullCallRecording = startRecordingTwiml(recordingEnabled, fullRecordingCallback);

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
      const inbCrmMatch = userId && From ? await matchContactByPhone(userId, From, inbOwningCountry) : null;
      await persistCallHistory({
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
${fullCallRecording}
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
        const greeting = config.greetingScript ?? `Thank you for calling. This is Pablo, your virtual office assistant. How can I help you today?`;
        const screening = config.screeningRules ?? "Ask for the caller's name and the reason for their call.";
        const routing = config.routingInstructions ?? "";
        const twiml = `<Response>
${fullCallRecording}
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
${fullCallRecording}
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
      await persistCallHistory({
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
          const transferOrgId = await getUserOrgId(userId);
          const recordingEnabled = await isCallRecordingEnabled(userId, transferOrgId);
          const transferRecordingCallback = `${base}/twilio/webhook/recording?userId=${encodeURIComponent(userId)}&amp;type=call&amp;callType=pablo_transfer&amp;conferenceName=${encodeURIComponent(confName)}`;
          const transferCall = await client.calls.create({
            to: action.transferTo,
            from: fromNumber,
            twiml: `<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false"${recordingAttrs(recordingEnabled, "record-from-start", transferRecordingCallback)}>${safeConf}</Conference></Dial></Response>`,
            statusCallback: `${base}/twilio/webhook/status?userId=${encodeURIComponent(userId)}&callType=pablo_transfer`,
            statusCallbackMethod: "POST",
            statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
          });
          await persistCallHistory({
            userId,
            orgId: transferOrgId ?? undefined,
            recipientNumber: action.transferTo,
            twilioCallSid: transferCall.sid,
            status: transferCall.status ?? "initiated",
            direction: "outbound",
            callType: "pablo_transfer",
            conferenceName: confName,
            consentGiven: true,
            recordingRetainUntil: getRetentionDate(),
          });
          await recordTelephonyActivity({
            userId,
            orgId: transferOrgId,
            channel: "call",
            direction: "outbound",
            phone: action.transferTo,
            status: transferCall.status ?? "initiated",
            twilioSid: transferCall.sid,
          }).catch(() => {});
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
    const agentOrgId = await getUserOrgId(userId);
    const recordingEnabled = await isCallRecordingEnabled(userId, agentOrgId);
    const agentRecordingCallback = `${base}/twilio/webhook/recording?userId=${encodeURIComponent(userId)}&amp;type=call&amp;callType=screening_transfer&amp;conferenceName=${encodeURIComponent(confName)}`;
    const agentCall = await client.calls.create({
      to: agent.phone,
      from: agentCallerId,
      twiml: `<Response>${milaVoice("Incoming screened call for you. Connecting now.")}<Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false"${recordingAttrs(recordingEnabled, "record-from-start", agentRecordingCallback)}>${escapeTwiml(confName)}</Conference></Dial></Response>`,
      statusCallback: `${base}/twilio/webhook/status?userId=${encodeURIComponent(userId)}&callType=screening_transfer`,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    });
    await persistCallHistory({
      userId,
      orgId: agentOrgId ?? undefined,
      callerName: agent.name,
      recipientNumber: agent.phone,
      twilioCallSid: agentCall.sid,
      status: agentCall.status ?? "initiated",
      direction: "outbound",
      callType: "screening_transfer",
      conferenceName: confName,
      consentGiven: true,
      recordingRetainUntil: getRetentionDate(),
    });
    await recordTelephonyActivity({
      userId,
      orgId: agentOrgId,
      channel: "call",
      direction: "outbound",
      phone: agent.phone,
      contactName: agent.name,
      status: agentCall.status ?? "initiated",
      twilioSid: agentCall.sid,
    }).catch(() => {});

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

    if (!userId) {
      res.type("text/xml").send(`<Response>${milaVoice("Thank you for your time. Goodbye.")}<Hangup/></Response>`);
      return;
    }

    const host = getAppHost(req);
    const base = host ? `https://${host}/api` : "/api";

    if (campaignId) {
      const campaignNumber = Number(campaignId);
      const contactId = Number(req.query.contactId);
      const campaigns = await db.select().from(pabloOutboundCampaignsTable).where(and(
        eq(pabloOutboundCampaignsTable.id, campaignNumber),
        eq(pabloOutboundCampaignsTable.userId, userId),
      )).limit(1);
      const campaign = campaigns[0];
      const contacts = Number.isInteger(contactId) && contactId > 0
        ? await db.select().from(contactsTable).where(and(
            eq(contactsTable.id, contactId),
            eq(contactsTable.userId, userId),
          )).limit(1)
        : [];
      if (!campaign || !contacts[0] || !await hasRecordedPhoneCallConsent(userId, contactId)) {
        res.type("text/xml").send(`<Response>${milaVoice("I can't continue this call. Goodbye.", req)}<Hangup/></Response>`);
        return;
      }

      let script;
      try {
        script = parsePabloOutboundScript(campaign.script);
      } catch {
        res.type("text/xml").send(`<Response>${milaVoice("I can't continue this call. Goodbye.", req)}<Hangup/></Response>`);
        return;
      }

      const contact = contacts[0];
      const nodeId = String(req.query.nodeId || script.startNodeId);
      const node = script.nodes.find((item) => item.id === nodeId);
      if (!node) {
        res.type("text/xml").send(`<Response>${milaVoice("I can't continue this call. Goodbye.", req)}<Hangup/></Response>`);
        return;
      }
      const leadName = contact.name || "";
      const company = contact.company || script.businessName;
      const actionUrl = `${base}/twilio/pablo/outbound/gather?userId=${encodeURIComponent(userId)}&amp;campaignId=${campaignNumber}&amp;contactId=${contactId}&amp;nodeId=${encodeURIComponent(node.id)}`;
      const gather = (spokenText: string, clarify: number) =>
        `<Gather input="speech" timeout="10" action="${actionUrl}&amp;clarify=${clarify}" method="POST" speechTimeout="auto">${milaVoice(interpolatePabloScript(spokenText, leadName, company), req)}</Gather>`;
      const answer = classifyPabloCallAnswer(typeof SpeechResult === "string" ? SpeechResult : "");
      const captureRequested = req.query.captureField !== undefined;
      const captureField = parseCampaignCaptureField(req.query.captureField);
      const transferConsentStep = String(req.query.transferConsent || "") === "1";
      const finishCall = (spokenText: string) => {
        res.type("text/xml").send(`<Response>${milaVoice(interpolatePabloScript(spokenText, leadName, company), req)}<Hangup/></Response>`);
      };

      if (answer === "stop") {
        const now = new Date();
        await db.update(contactChannelPrefsTable).set({
          phoneCallOptIn: false,
          phoneCallOptedOutAt: now,
          updatedAt: now,
        }).where(and(
          eq(contactChannelPrefsTable.userId, userId),
          eq(contactChannelPrefsTable.contactId, contactId),
        ));
        res.type("text/xml").send(`<Response>${milaVoice("Understood. I'll remove this number from future calls. Goodbye.", req)}<Hangup/></Response>`);
        return;
      }

      const affirmativeBranch = node.yes;
      const affirmativeResponse = interpolatePabloScript(affirmativeBranch.response, leadName, company);
      const connectEmployee = async (targetUserId: string) => {
        const orgId = await getCurrentPhoneOrgId(userId);
        const target = orgId ? await getActivePhoneEmployee(orgId, targetUserId) : null;
        const [caller] = await db.select({ email: usersTable.email })
          .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
        const [callerCanUseTwilio, targetCanUseTwilio] = orgId && target
          ? await Promise.all([
              canUsePlatformTwilio(userId, caller?.email ?? ""),
              canUsePlatformTwilio(target.userId, target.email ?? ""),
            ])
          : [false, false];
        const safeCallSid = typeof CallSid === "string" ? CallSid.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) : "";
        if (!orgId || !target || target.userId === userId || !callerCanUseTwilio || !targetCanUseTwilio || !safeCallSid) {
          finishCall(`${affirmativeResponse} ${interpolatePabloScript(script.closing, leadName, company)}`);
          return;
        }

        const transferRoom = `calll-home-transfer-${safeCallSid}`;
        const transferRecordingEnabled = await isCallRecordingEnabled(target.userId, orgId);
        const transferRecordingCallback = `${base}/twilio/webhook/recording?userId=${encodeURIComponent(target.userId)}&amp;type=call&amp;callType=pablo_internal_transfer&amp;conferenceName=${encodeURIComponent(transferRoom)}`;
        let transferCallSid: string | null = null;
        try {
          const transferCall = await getTwilioClient().calls.create({
            to: `client:${target.userId}`,
            from: await getUserOutboundNumber(userId),
            timeout: 25,
            twiml: `<Response><Dial><Conference startConferenceOnEnter="false" endConferenceOnExit="true" beep="false"${recordingAttrs(transferRecordingEnabled, "record-from-start", transferRecordingCallback)}>${escapeTwiml(transferRoom)}</Conference></Dial></Response>`,
            statusCallback: `${base}/twilio/webhook/status?userId=${encodeURIComponent(target.userId)}&callType=pablo_internal_transfer&transferCallerUserId=${encodeURIComponent(userId)}&transferCallerSid=${encodeURIComponent(CallSid)}&transferOrgId=${orgId}`,
            statusCallbackMethod: "POST",
            statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
          });
          transferCallSid = transferCall.sid;
          const transferLabel = `${script.businessName} via Pablo PRIME`;
          await persistCallHistory({
            userId: target.userId,
            orgId,
            callerName: transferLabel,
            recipientNumber: "CALLL HOME employee",
            twilioCallSid: transferCall.sid,
            status: transferCall.status ?? "initiated",
            direction: "inbound",
            callType: "pablo_internal_transfer",
            conferenceName: transferRoom,
            contactId,
            consentGiven: true,
          });
          await db.update(callHistoryTable).set({ conferenceName: transferRoom }).where(and(
            eq(callHistoryTable.userId, userId),
            eq(callHistoryTable.twilioCallSid, CallSid),
            eq(callHistoryTable.contactId, contactId),
          ));
          await recordTelephonyActivity({
            userId: target.userId,
            orgId,
            channel: "call",
            direction: "inbound",
            phone: "CALLL HOME employee",
            contactName: transferLabel,
            status: transferCall.status ?? "initiated",
            twilioSid: transferCall.sid,
          }).catch(() => {});

          const transcriptionCallback = `${base}/twilio/webhook/realtime-transcription?userId=${encodeURIComponent(userId)}&contactId=${contactId}&orgId=${orgId}&conferenceName=${encodeURIComponent(transferRoom)}`;
          res.type("text/xml").send(`<Response><Start><Transcription name="${escapeTwiml(`call-${safeCallSid}`)}" track="both_tracks" partialResults="false" statusCallbackUrl="${escapeTwiml(transcriptionCallback)}" statusCallbackMethod="POST" /></Start>${milaVoice(affirmativeResponse, req)}<Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false" waitUrl="http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical">${escapeTwiml(transferRoom)}</Conference></Dial></Response>`);
        } catch (err) {
          if (transferCallSid) {
            await getTwilioClient().calls(transferCallSid).update({ status: "completed" }).catch(() => {});
          }
          req.log.error({ err, orgId }, "Pablo PRIME employee transfer could not be started");
          finishCall(`${affirmativeResponse} ${interpolatePabloScript(script.closing, leadName, company)}`);
        }
      };

      if (transferConsentStep) {
        const targetUserId = affirmativeBranch.transferToUserId;
        if (!targetUserId) {
          finishCall(interpolatePabloScript(script.closing, leadName, company));
          return;
        }
        if (answer === "no") {
          finishCall(`No problem. I won't connect you to an employee. ${interpolatePabloScript(script.closing, leadName, company)}`);
          return;
        }
        if (answer !== "yes") {
          if (String(req.query.clarify || "0") === "1") {
            finishCall(interpolatePabloScript(script.closing, leadName, company));
            return;
          }
          const targetOrgId = await getCurrentPhoneOrgId(userId);
          const target = targetOrgId ? await getActivePhoneEmployee(targetOrgId, targetUserId) : null;
        const targetName = target
            ? [target.firstName, target.lastName].filter(Boolean).join(" ") || target.username || "an employee"
            : "an employee";
          const transferUrl = `${actionUrl}&amp;transferConsent=1&amp;clarify=1`;
          res.type("text/xml").send(`<Response><Gather input="speech" timeout="10" action="${transferUrl}" method="POST" speechTimeout="auto">${milaVoice(`Please answer yes or no. Would you like me to connect you to ${targetName}?`, req)}</Gather>${milaVoice(interpolatePabloScript(script.closing, leadName, company), req)}<Hangup/></Response>`);
          return;
        }
        await connectEmployee(targetUserId);
        return;
      }

      if (captureRequested) {
        if (!captureField || affirmativeBranch.captureField !== captureField) {
          finishCall(interpolatePabloScript(script.closing, leadName, company));
          return;
        }
        const rawValue = typeof SpeechResult === "string" ? SpeechResult : "";
        const capturedValue = cleanCampaignCapture(captureField, rawValue);
        let captureFeedback = "I couldn't confirm that detail, so I left the contact record unchanged.";
        if (answer === "no" || answer === "yes") {
          captureFeedback = answer === "no"
            ? "That's fine. I won't change that contact detail."
            : "I didn't hear the detail itself, so I left the contact record unchanged.";
        } else if (capturedValue) {
          const result = await saveCampaignContactCapture(userId, contactId, String(CallSid || ""), captureField, capturedValue);
          captureFeedback = result === "updated" || result === "unchanged"
            ? "Thank you. I've updated the contact record."
            : result === "review"
              ? "That contact detail changed during the call, so I've flagged it for review instead of replacing it."
              : "I couldn't update that contact record. No CRM details were changed.";
        }
        if (affirmativeBranch.nextNodeId) {
          const nextNode = script.nodes.find((item) => item.id === affirmativeBranch.nextNodeId);
          if (!nextNode) {
            finishCall(`${captureFeedback} ${interpolatePabloScript(script.closing, leadName, company)}`);
            return;
          }
          const followUpUrl = `${base}/twilio/pablo/outbound/gather?userId=${encodeURIComponent(userId)}&amp;campaignId=${campaignNumber}&amp;contactId=${contactId}&amp;nodeId=${encodeURIComponent(nextNode.id)}&amp;clarify=0`;
          res.type("text/xml").send(`<Response><Gather input="speech" timeout="10" action="${followUpUrl}" method="POST" speechTimeout="auto">${milaVoice(`${captureFeedback} ${interpolatePabloScript(nextNode.question, leadName, company)}`, req)}</Gather>${milaVoice(interpolatePabloScript(script.closing, leadName, company), req)}<Hangup/></Response>`);
          return;
        }
        finishCall(`${captureFeedback} ${interpolatePabloScript(script.closing, leadName, company)}`);
        return;
      }

      if (!answer) {
        const hasClarified = String(req.query.clarify || "0") === "1";
        if (hasClarified) {
          res.type("text/xml").send(`<Response>${milaVoice(interpolatePabloScript(script.closing, leadName, company), req)}<Hangup/></Response>`);
          return;
        }
        const repeat = `Sorry, I didn't catch that. Please answer yes or no. ${node.question}`;
        res.type("text/xml").send(`<Response>${gather(repeat, 1)}${milaVoice(interpolatePabloScript(script.closing, leadName, company), req)}<Hangup/></Response>`);
        return;
      }

      const branch = node[answer];
      const branchResponse = interpolatePabloScript(branch.response, leadName, company);
      if (branch.captureField) {
        const prompts: Record<CampaignCaptureField, string> = {
          email: "Would you like to share an email address for the contact record? Say the address, or say no to skip.",
          company: "Would you like to share a company name for the contact record? Say the name, or say no to skip.",
          timezone: "Would you like to share your time zone for the contact record? Say the time zone, or say no to skip.",
        };
        const captureUrl = `${actionUrl}&amp;captureField=${encodeURIComponent(branch.captureField)}`;
        res.type("text/xml").send(`<Response><Gather input="speech" timeout="10" action="${captureUrl}" method="POST" speechTimeout="auto">${milaVoice(`${branchResponse} ${prompts[branch.captureField]}`, req)}</Gather>${milaVoice(interpolatePabloScript(script.closing, leadName, company), req)}<Hangup/></Response>`);
        return;
      }
      if (branch.transferToUserId) {
        const orgId = await getCurrentPhoneOrgId(userId);
        const target = orgId ? await getActivePhoneEmployee(orgId, branch.transferToUserId) : null;
        const [caller] = await db.select({
          email: usersTable.email,
        }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
        const [callerCanUseTwilio, targetCanUseTwilio] = orgId && target
          ? await Promise.all([
              canUsePlatformTwilio(userId, caller?.email ?? ""),
              canUsePlatformTwilio(target.userId, target.email ?? ""),
            ])
          : [false, false];
        const safeCallSid = typeof CallSid === "string" ? CallSid.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) : "";
        if (!orgId || !target || target.userId === userId || !callerCanUseTwilio || !targetCanUseTwilio || !safeCallSid) {
          finishCall(`${branchResponse} I can't connect you to an employee right now. ${interpolatePabloScript(script.closing, leadName, company)}`);
          return;
        }

        const targetName = [target.firstName, target.lastName].filter(Boolean).join(" ") || target.username || "an employee";
        const transferUrl = `${actionUrl}&amp;transferConsent=1&amp;clarify=0`;
        res.type("text/xml").send(`<Response><Gather input="speech" timeout="10" action="${transferUrl}" method="POST" speechTimeout="auto">${milaVoice(`${branchResponse} Would you like me to connect you to ${targetName}? Please say yes or no.`, req)}</Gather>${milaVoice(interpolatePabloScript(script.closing, leadName, company), req)}<Hangup/></Response>`);
        return;
      }

      if (branch.nextNodeId) {
        const nextNode = script.nodes.find((item) => item.id === branch.nextNodeId);
        if (!nextNode) {
          res.type("text/xml").send(`<Response>${milaVoice(interpolatePabloScript(script.closing, leadName, company), req)}<Hangup/></Response>`);
          return;
        }
        const followUpUrl = `${base}/twilio/pablo/outbound/gather?userId=${encodeURIComponent(userId)}&amp;campaignId=${campaignNumber}&amp;contactId=${contactId}&amp;nodeId=${encodeURIComponent(nextNode.id)}&amp;clarify=0`;
        res.type("text/xml").send(`<Response><Gather input="speech" timeout="10" action="${followUpUrl}" method="POST" speechTimeout="auto">${milaVoice(`${branchResponse} ${interpolatePabloScript(nextNode.question, leadName, company)}`, req)}</Gather>${milaVoice(interpolatePabloScript(script.closing, leadName, company), req)}<Hangup/></Response>`);
        return;
      }

      res.type("text/xml").send(`<Response>${milaVoice(`${branchResponse} ${interpolatePabloScript(script.closing, leadName, company)}`, req)}<Hangup/></Response>`);
      generateCallSummaryForSession(CallSid).catch(() => {});
      return;
    }

    const directContactId = Number(req.query.contactId);
    if (Number.isInteger(directContactId) && directContactId > 0) {
      const [contact] = await db.select({ id: contactsTable.id }).from(contactsTable).where(and(
        eq(contactsTable.id, directContactId),
        eq(contactsTable.userId, userId),
      )).limit(1);
      if (!contact || !await hasRecordedPhoneCallConsent(userId, directContactId)) {
        res.type("text/xml").send(`<Response>${milaVoice("I can't continue this call. Goodbye.", req)}<Hangup/></Response>`);
        return;
      }
      const answer = classifyPabloCallAnswer(typeof SpeechResult === "string" ? SpeechResult : "");
      if (answer === "stop") {
        const now = new Date();
        await db.update(contactChannelPrefsTable).set({
          phoneCallOptIn: false,
          phoneCallOptedOutAt: now,
          updatedAt: now,
        }).where(and(
          eq(contactChannelPrefsTable.userId, userId),
          eq(contactChannelPrefsTable.contactId, directContactId),
        ));
        res.type("text/xml").send(`<Response>${milaVoice("Understood. I'll remove this number from future calls. Goodbye.", req)}<Hangup/></Response>`);
        return;
      }
    }

    if (!SpeechResult) {
      res.type("text/xml").send(`<Response>${milaVoice("Thank you for your time. Goodbye.", req)}<Hangup/></Response>`);
      return;
    }

    let outboundScript: string | undefined;
    const configs = await db.select().from(secretaryConfigTable).where(eq(secretaryConfigTable.userId, userId)).limit(1);
    outboundScript = configs[0]?.outboundScript ?? undefined;
    const action = await processPabloTurn(userId, CallSid, SpeechResult, To, "outbound", outboundScript);
    const milaResponse = milaVoice(action.response, req);

    if (action.type === "end_call" || action.type === "take_message" || action.type === "create_lead") {
      res.type("text/xml").send(`<Response>${milaResponse}</Response>`);
      generateCallSummaryForSession(CallSid).catch(() => {});
      updateLeadFromPabloCall(To, userId, action.type, action.response, null).catch(() => {});
      return;
    }

    res.type("text/xml").send(`<Response>
<Gather input="speech" timeout="10" action="${base}/twilio/pablo/outbound/gather?userId=${encodeURIComponent(userId)}" method="POST" speechTimeout="auto">
${milaResponse}
</Gather>
${milaVoice("Thank you for your time. Goodbye.", req)}
</Response>`);
  } catch (err: unknown) {
    console.error("[Pablo] outbound gather error:", err instanceof Error ? err.message : "Unknown");
    res.type("text/xml").send(`<Response>${milaVoice("Thank you for your time. Goodbye.")}</Response>`);
  }
});

router.post("/twilio/pablo/outbound/dial", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const { phoneNumber, script } = req.body;
    const hasContactId = req.body.contactId !== undefined && req.body.contactId !== null;
    const hasLeadId = req.body.leadId !== undefined && req.body.leadId !== null;
    if (hasContactId && hasLeadId) {
      res.status(400).json({ error: "Choose one CRM contact or lead." });
      return;
    }
    const hasCrmRecord = hasContactId || hasLeadId;
    if (hasCrmRecord && phoneNumber != null) {
      res.status(400).json({ error: "The call destination must come from the selected CRM record." });
      return;
    }

    let pabloOrgId = await getUserOrgId(userId);
    let resolvedLeadId: number | undefined;
    let authoritativeNumber = "";
    let authoritativeName = "";
    let pabloCrmMatch: { contactId: number; contactName: string } | null = null;

    if (hasLeadId) {
      const leadId = Number(req.body.leadId);
      if (!Number.isInteger(leadId) || leadId <= 0) {
        res.status(400).json({ error: "Invalid CRM lead." });
        return;
      }
      const [lead] = await db.select({
        id: leadRecordsTable.id,
        name: leadRecordsTable.name,
        phone: leadRecordsTable.phone,
      }).from(leadRecordsTable).where(and(
        eq(leadRecordsTable.id, leadId),
        pabloOrgId ? eq(leadRecordsTable.orgId, pabloOrgId) : sql`false`,
      )).limit(1);
      if (!lead) {
        res.status(404).json({ error: "CRM lead not found in your active organization." });
        return;
      }
      if (!lead.phone?.trim()) {
        res.status(400).json({ error: "CRM lead has no phone number." });
        return;
      }
      resolvedLeadId = lead.id;
      authoritativeNumber = lead.phone;
      authoritativeName = lead.name;
      pabloCrmMatch = await matchContactByPhone(userId, lead.phone);
    } else if (hasContactId) {
      const contactId = Number(req.body.contactId);
      if (!Number.isInteger(contactId) || contactId <= 0) {
        res.status(400).json({ error: "Invalid CRM contact." });
        return;
      }
      const [contact] = await db.select({
        id: contactsTable.id,
        name: contactsTable.name,
        phone: contactsTable.phone,
      }).from(contactsTable).where(and(
        eq(contactsTable.id, contactId),
        eq(contactsTable.userId, userId),
      )).limit(1);
      if (!contact) {
        res.status(404).json({ error: "CRM contact not found." });
        return;
      }
      authoritativeNumber = contact.phone;
      authoritativeName = contact.name;
      pabloCrmMatch = { contactId: contact.id, contactName: contact.name };
    } else if (phoneNumber) {
      // Backward-compatible path: still resolve a saved, user-owned contact;
      // never dial the caller-provided number directly.
      pabloCrmMatch = await matchContactByPhone(userId, String(phoneNumber));
      authoritativeNumber = String(phoneNumber);
      authoritativeName = typeof req.body.leadName === "string" ? req.body.leadName : "";
    } else {
      res.status(400).json({ error: "Choose a CRM record to call." });
      return;
    }

    if (!pabloCrmMatch || !await hasRecordedPhoneCallConsent(userId, pabloCrmMatch.contactId)) {
      res.status(403).json({ error: "Pablo can only call a saved contact with recorded phone-call permission. Record permission in Phone Call Center first." });
      return;
    }
    const [contact] = await db.select().from(contactsTable).where(and(
      eq(contactsTable.id, pabloCrmMatch.contactId),
      eq(contactsTable.userId, userId),
    )).limit(1);
    if (!contact?.phone) {
      res.status(403).json({ error: "Contact must have a saved phone number." });
      return;
    }
    const callTo = toE164(authoritativeNumber || contact.phone, await resolveUserCountry(userId));
    if (!callTo) {
      res.status(400).json({ error: "CRM record has an invalid phone number." });
      return;
    }
    try {
      await synthesizePabloLine("This is Pablo. Please confirm that my voice is clear.");
    } catch {
      res.status(503).json({ error: "Pablo's ElevenLabs voice is unavailable. No call was placed.", code: "voice_unavailable" });
      return;
    }
    if (!await hasRecordedPhoneCallConsent(userId, pabloCrmMatch.contactId)) {
      res.status(403).json({ error: "Phone-call permission was withdrawn before Pablo could place the call." });
      return;
    }
    if (resolvedLeadId) {
      const currentOrgId = await getUserOrgId(userId);
      const [stillAuthorized] = await db.select({ id: leadRecordsTable.id }).from(leadRecordsTable).where(and(
        eq(leadRecordsTable.id, resolvedLeadId),
        currentOrgId ? eq(leadRecordsTable.orgId, currentOrgId) : sql`false`,
      )).limit(1);
      if (!stillAuthorized || currentOrgId !== pabloOrgId) {
        res.status(404).json({ error: "CRM lead is no longer available in your active organization." });
        return;
      }
      pabloOrgId = currentOrgId;
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
      ? `Hello, this is Pablo calling on behalf of our team. ${outboundScript.split('.')[0]}.`
      : `Hello, this is Pablo, an AI assistant calling on behalf of our team. Do you have a moment to chat?`;

    const recordingEnabled = await isCallRecordingEnabled(userId, pabloOrgId);
    const outboundRecordingCallback = `${base}/twilio/webhook/recording?userId=${encodeURIComponent(userId)}&amp;type=call&amp;callType=pablo_agent`;
    const call = await client.calls.create({
      to: callTo,
      from: fromNumber,
      twiml: `<Response>${startRecordingTwiml(recordingEnabled, outboundRecordingCallback)}<Gather input="speech" timeout="10" action="${base}/twilio/pablo/outbound/gather?userId=${encodeURIComponent(userId)}&amp;contactId=${pabloCrmMatch.contactId}" method="POST" speechTimeout="auto">${milaVoice(greeting, req)}</Gather>${milaVoice("Thank you for your time. Goodbye.", req)}</Response>`,
      statusCallback: `${base}/twilio/webhook/status?userId=${encodeURIComponent(userId)}&callType=pablo_agent`,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    });

    await persistCallHistory({
      userId,
      orgId: pabloOrgId ?? undefined,
      callerName: authoritativeName || contact.name || null,
      recipientNumber: callTo,
      twilioCallSid: call.sid,
      status: "initiated",
      direction: "outbound",
      callType: "pablo_agent",
      contactId: pabloCrmMatch?.contactId,
      consentGiven: true,
      recordingRetainUntil: getRetentionDate(),
    });
    const crmActivityId = await recordTelephonyActivity({
      userId,
      orgId: pabloOrgId,
      leadId: resolvedLeadId,
      channel: "call",
      direction: "outbound",
      phone: callTo,
      contactName: authoritativeName || contact.name,
      contactId: pabloCrmMatch?.contactId,
      status: "initiated",
      twilioSid: call.sid,
    }).catch(() => {});

    res.json({
      ok: true,
      callSid: call.sid,
      crmActivityId,
      leadId: resolvedLeadId,
      contactId: pabloCrmMatch.contactId,
      to: callTo,
      status: "initiated",
    });
  } catch (err: unknown) {
    req.log.error({ err }, "Pablo outbound dial error");
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

router.get("/twilio/pablo/campaign-contacts", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const [contacts, prefs] = await Promise.all([
      db.select().from(contactsTable)
        .where(eq(contactsTable.userId, userId))
        .orderBy(desc(contactsTable.createdAt))
        .limit(500),
      db.select().from(contactChannelPrefsTable)
        .where(eq(contactChannelPrefsTable.userId, userId))
        .orderBy(desc(contactChannelPrefsTable.updatedAt)),
    ]);
    const latestPrefs = new Map<number, typeof prefs[number]>();
    for (const pref of prefs) {
      if (!latestPrefs.has(pref.contactId)) latestPrefs.set(pref.contactId, pref);
    }
    res.json({
      contacts: contacts
        .filter((contact) => Boolean(contact.phone?.trim()))
        .map((contact) => {
          const pref = latestPrefs.get(contact.id);
          return {
            id: contact.id,
            name: contact.name,
            phone: contact.phone,
            company: contact.company,
            phoneCallOptIn: Boolean(pref?.phoneCallOptIn && pref.phoneCallConsentedAt && !pref.phoneCallOptedOutAt),
            phoneCallConsentedAt: pref?.phoneCallConsentedAt ?? null,
          };
        }),
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch campaign contacts" });
  }
});

router.post("/twilio/pablo/voice-check", requireAuth, requireFeature("phone_system"), async (_req, res) => {
  try {
    const audio = await synthesizePabloLine("This is Pablo. Please confirm that my voice is clear.");
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audio.length);
    res.setHeader("Cache-Control", "no-store");
    res.end(audio);
  } catch {
    res.status(503).json({
      error: "Pablo's assigned ElevenLabs voice is unavailable. Campaigns cannot start until it is working.",
      code: "voice_unavailable",
    });
  }
});

router.post("/twilio/pablo/campaigns", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const contactIds: unknown = req.body.contactIds;
    if (!name || name.length > 256) {
      res.status(400).json({ error: "Campaign name is required (maximum 256 characters)." });
      return;
    }
    if (!Array.isArray(contactIds) || contactIds.length < 1 || contactIds.length > 50 ||
      contactIds.some((id) => !Number.isInteger(id) || id <= 0) ||
      new Set(contactIds).size !== contactIds.length) {
      res.status(400).json({ error: "Choose between 1 and 50 unique saved contacts." });
      return;
    }

    let script;
    try {
      script = parsePabloOutboundScript(String(req.body.script ?? ""));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Script matrix is invalid." });
      return;
    }

    const ids = contactIds as number[];
    const contacts = await db.select().from(contactsTable).where(and(
      eq(contactsTable.userId, userId),
      inArray(contactsTable.id, ids),
    ));
    if (contacts.length !== ids.length) {
      res.status(400).json({ error: "Campaigns can only use your saved CRM contacts." });
      return;
    }
    const prefs = await db.select().from(contactChannelPrefsTable).where(and(
      eq(contactChannelPrefsTable.userId, userId),
      inArray(contactChannelPrefsTable.contactId, ids),
    )).orderBy(desc(contactChannelPrefsTable.updatedAt));
    const latestPrefs = new Map<number, typeof prefs[number]>();
    for (const pref of prefs) {
      if (!latestPrefs.has(pref.contactId)) latestPrefs.set(pref.contactId, pref);
    }
    const notConsented = ids.filter((id) => {
      const pref = latestPrefs.get(id);
      return !pref?.phoneCallOptIn || !pref.phoneCallConsentedAt || Boolean(pref.phoneCallOptedOutAt);
    });
    if (notConsented.length) {
      res.status(400).json({ error: "Every selected contact must have recorded phone-call permission." });
      return;
    }
    const country = await resolveUserCountry(userId);
    const leads = contacts.map((contact) => ({
      contactId: contact.id,
      phone: toE164(contact.phone, country),
      name: contact.name,
      company: contact.company,
    }));
    if (leads.some((lead) => !lead.phone)) {
      res.status(400).json({ error: "Every selected contact needs a valid saved phone number." });
      return;
    }

    const [campaign] = await db.insert(pabloOutboundCampaignsTable).values({
      userId,
      name,
      script: JSON.stringify(script),
      leadsJson: JSON.stringify(leads),
      scheduleJson: typeof req.body.scheduleJson === "string" ? req.body.scheduleJson : null,
      status: "draft",
      totalLeads: leads.length,
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
    const campaignId = Number(req.params.id);
    if (!Number.isInteger(campaignId) || campaignId <= 0) {
      res.status(400).json({ error: "Invalid campaign ID" });
      return;
    }

    const campaigns = await db.select().from(pabloOutboundCampaignsTable).where(and(eq(pabloOutboundCampaignsTable.id, campaignId), eq(pabloOutboundCampaignsTable.userId, userId))).limit(1);
    if (!campaigns[0]) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    const campaign = campaigns[0];
    if (campaign.status !== "draft") {
      res.status(409).json({ error: "This campaign has already been started." });
      return;
    }
    let script;
    let contactIds: number[];
    try {
      script = parsePabloOutboundScript(campaign.script);
      const savedLeads: unknown = JSON.parse(campaign.leadsJson ?? "[]");
      if (!Array.isArray(savedLeads) || savedLeads.length < 1 || savedLeads.length > 50 ||
        savedLeads.some((lead) => !lead || typeof lead !== "object" ||
          !Number.isInteger((lead as { contactId?: unknown }).contactId) ||
          (lead as { contactId: number }).contactId <= 0)) {
        throw new Error("Campaign contacts are invalid.");
      }
      contactIds = savedLeads.map((lead) => (lead as { contactId: number }).contactId);
      if (new Set(contactIds).size !== contactIds.length) throw new Error("Campaign contacts must be unique.");
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Campaign script or contacts are invalid." });
      return;
    }

    const [contacts, prefs] = await Promise.all([
      db.select().from(contactsTable).where(and(
        eq(contactsTable.userId, userId),
        inArray(contactsTable.id, contactIds),
      )),
      db.select().from(contactChannelPrefsTable).where(and(
        eq(contactChannelPrefsTable.userId, userId),
        inArray(contactChannelPrefsTable.contactId, contactIds),
      )).orderBy(desc(contactChannelPrefsTable.updatedAt)),
    ]);
    const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
    const prefsById = new Map<number, typeof prefs[number]>();
    for (const pref of prefs) {
      if (!prefsById.has(pref.contactId)) prefsById.set(pref.contactId, pref);
    }
    const country = await resolveUserCountry(userId);
    const invalidConsent = contactIds.some((id) => {
      const pref = prefsById.get(id);
      return !contactsById.has(id) || !pref?.phoneCallOptIn || !pref.phoneCallConsentedAt || Boolean(pref.phoneCallOptedOutAt);
    });
    if (invalidConsent) {
      res.status(409).json({ error: "A selected contact no longer has recorded phone-call permission. Update the list before starting." });
      return;
    }
    const leads = contactIds.map((contactId) => {
      const contact = contactsById.get(contactId)!;
      return {
        contactId,
        phone: toE164(contact.phone, country),
        name: contact.name,
        company: contact.company,
      };
    });
    if (leads.some((lead) => !lead.phone)) {
      res.status(409).json({ error: "A selected contact no longer has a valid phone number." });
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

    try {
      await synthesizePabloLine("This is Pablo. Please confirm that my voice is clear.");
    } catch {
      res.status(503).json({
        error: "Pablo's assigned ElevenLabs voice is unavailable. No campaign calls were placed.",
        code: "voice_unavailable",
      });
      return;
    }

    const [claimedCampaign] = await db.update(pabloOutboundCampaignsTable)
      .set({ status: "active", updatedAt: new Date() })
      .where(and(
        eq(pabloOutboundCampaignsTable.id, campaignId),
        eq(pabloOutboundCampaignsTable.userId, userId),
        eq(pabloOutboundCampaignsTable.status, "draft"),
      ))
      .returning({ id: pabloOutboundCampaignsTable.id });
    if (!claimedCampaign) {
      res.status(409).json({ error: "This campaign has already been started." });
      return;
    }

    const [dialingSession] = await db.insert(dialingSessionsTable).values({
      userId,
      mode: "pablo",
      status: "active",
      totalNumbers: leads.length,
      queueJson: JSON.stringify(leads),
      settingsJson: JSON.stringify({ campaignId, script }),
    }).returning();

    const client = getTwilioClient();
    const host = getAppHost(req);
    const base = host ? `https://${host}/api` : "/api";
    let dialed = 0;

    const { consumeUsage: _consumeUsage_pc } = await import("../lib/usage-meter");
    let processed = 0;
    for (const lead of leads) {
      const contactBeforeCharge = await db.select().from(contactsTable).where(and(
        eq(contactsTable.id, lead.contactId),
        eq(contactsTable.userId, userId),
      )).limit(1);
      if (!contactBeforeCharge[0] || !await hasRecordedPhoneCallConsent(userId, lead.contactId)) {
        processed++;
        continue;
      }
      const _g = await _consumeUsage_pc(userId, req.user?.email, "voice_minutes", 1);
      if (!_g.allowed) break;
      try {
        const [freshContact] = await db.select().from(contactsTable).where(and(
          eq(contactsTable.id, lead.contactId),
          eq(contactsTable.userId, userId),
        )).limit(1);
        if (!freshContact || !await hasRecordedPhoneCallConsent(userId, lead.contactId)) continue;
        const freshPhone = toE164(freshContact.phone, country);
        if (!freshPhone) continue;
        const opening = interpolatePabloScript(
          script.opening,
          freshContact.name,
          freshContact.company || script.businessName,
        );
        const firstQuestion = script.nodes.find((node) => node.id === script.startNodeId)!;
        const greeting = `Hello${freshContact.name ? `, ${freshContact.name}` : ""}. This is Pablo, an AI assistant calling on behalf of ${freshContact.company || script.businessName}. ${opening} ${interpolatePabloScript(firstQuestion.question, freshContact.name, freshContact.company || script.businessName)}`;
        const actionUrl = `${base}/twilio/pablo/outbound/gather?userId=${encodeURIComponent(userId)}&amp;campaignId=${campaignId}&amp;contactId=${lead.contactId}&amp;nodeId=${encodeURIComponent(script.startNodeId)}&amp;clarify=0`;
        const campOrgId = await getUserOrgId(userId);
        const recordingEnabled = await isCallRecordingEnabled(userId, campOrgId);
        const campaignRecordingCallback = `${base}/twilio/webhook/recording?userId=${encodeURIComponent(userId)}&amp;type=call&amp;callType=pablo_agent`;
        const call = await client.calls.create({
          to: freshPhone,
          from: campaignFromNumber,
          twiml: `<Response>${startRecordingTwiml(recordingEnabled, campaignRecordingCallback)}<Gather input="speech" timeout="10" action="${actionUrl}" method="POST" speechTimeout="auto">${milaVoice(greeting, req)}</Gather>${milaVoice(interpolatePabloScript(script.closing, freshContact.name, freshContact.company || script.businessName), req)}<Hangup/></Response>`,
          statusCallback: `${base}/twilio/webhook/status?userId=${encodeURIComponent(userId)}&callType=pablo_agent`,
          statusCallbackMethod: "POST",
          statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        });
        await persistCallHistory({
          userId,
          orgId: campOrgId ?? undefined,
          callerName: freshContact.name || null,
          recipientNumber: freshPhone,
          twilioCallSid: call.sid,
          status: "initiated",
          direction: "outbound",
          callType: "pablo_agent",
          contactId: lead.contactId,
          consentGiven: true,
          recordingRetainUntil: getRetentionDate(),
          contactSnapshotJson: JSON.stringify({
            email: freshContact.email ?? null,
            company: freshContact.company ?? null,
            timezone: freshContact.timezone ?? null,
          }),
        });
        await recordTelephonyActivity({
          userId,
          orgId: campOrgId,
          channel: "call",
          direction: "outbound",
          phone: freshPhone,
          contactName: freshContact.name,
          contactId: lead.contactId,
          status: "initiated",
          twilioSid: call.sid,
        }).catch(() => {});
        dialed++;
      } catch (e: unknown) {
        console.error(`[Pablo] campaign dial error for contact ${lead.contactId}:`, e instanceof Error ? e.message : "Unknown");
      }
      processed++;
    }

    const processingComplete = processed >= leads.length;
    await db.update(pabloOutboundCampaignsTable).set({ dialedCount: dialed }).where(eq(pabloOutboundCampaignsTable.id, campaignId));
    await db.update(dialingSessionsTable).set({ dialedCount: dialed, status: processingComplete ? "completed" : "active" }).where(eq(dialingSessionsTable.id, dialingSession.id));

    if (processingComplete) {
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
    const e164 = toE164(phone, DEFAULT_COUNTRY);
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

router.get("/twilio/internal-directory", requireAuth, requireFeature("phone_system"), async (req, res): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const orgId = await getCurrentPhoneOrgId(userId);
    if (!orgId) {
      res.json(GetPhoneInternalDirectoryResponse.parse({
        organizationId: null, canManageLines: false, members: [], lines: [],
      }));
      return;
    }

    const [organization] = await db.select({ ownerUserId: organizationsTable.ownerUserId })
      .from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
    const [actorMembership] = await db.select({ role: orgMembersTable.role })
      .from(orgMembersTable)
      .where(and(
        eq(orgMembersTable.orgId, orgId),
        eq(orgMembersTable.userId, userId),
        eq(orgMembersTable.status, "active"),
      )).limit(1);
    const canManageLines = organization?.ownerUserId === userId
      || (PHONE_ROLE_RANK[actorMembership?.role ?? ""] ?? 0) >= PHONE_ROLE_RANK.manager;

    const employeeRows = await db.select({
      userId: orgMembersTable.userId,
      role: orgMembersTable.role,
      title: orgMembersTable.title,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      username: usersTable.username,
      email: usersTable.email,
    })
      .from(orgMembersTable)
      .innerJoin(usersTable, eq(orgMembersTable.userId, usersTable.id))
      .where(and(
        eq(orgMembersTable.orgId, orgId),
        eq(orgMembersTable.status, "active"),
        eq(orgMembersTable.memberType, "employee"),
      ));

    const eligibleEmployees = (await Promise.all(employeeRows.map(async (member) => {
      const [phonePaid, twilioAllowed] = await Promise.all([
        hasFeature(member.userId, member.email ?? "", "phone_system"),
        canUsePlatformTwilio(member.userId, member.email ?? ""),
      ]);
      return phonePaid && twilioAllowed ? member : null;
    }))).filter((member): member is NonNullable<typeof member> => member !== null);

    const orgLines = await db.select({
      id: phoneNumbersTable.id,
      number: phoneNumbersTable.number,
      label: phoneNumbersTable.label,
      friendlyName: phoneNumbersTable.friendlyName,
      userId: phoneNumbersTable.userId,
      isActive: phoneNumbersTable.isActive,
    })
      .from(phoneNumbersTable)
      .where(eq(phoneNumbersTable.orgId, orgId))
      .orderBy(desc(phoneNumbersTable.isActive), asc(phoneNumbersTable.id));

    const displayNames = new Map(eligibleEmployees.map((member) => [
      member.userId,
      `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() || member.username || "Team member",
    ]));
    const assignedLineByUser = new Map<string, string>();
    for (const line of orgLines) {
      if (line.isActive && !assignedLineByUser.has(line.userId)) {
        assignedLineByUser.set(line.userId, line.number);
      }
    }

    res.json(GetPhoneInternalDirectoryResponse.parse({
      organizationId: orgId,
      canManageLines,
      members: eligibleEmployees.map((member) => ({
        userId: member.userId,
        displayName: displayNames.get(member.userId)!,
        title: member.title,
        role: member.role,
        phoneNumber: assignedLineByUser.get(member.userId) ?? null,
        isSelf: member.userId === userId,
      })),
      lines: canManageLines ? orgLines.map((line) => ({
        id: line.id,
        number: line.number,
        label: line.label || line.friendlyName || line.number,
        assignedUserId: line.userId || null,
        assignedName: displayNames.get(line.userId) ?? null,
        isActive: line.isActive,
      })) : [],
    }));
  } catch (err) {
    req.log.error({ err }, "Failed to load CALLL HOME internal directory");
    res.status(500).json({ error: "Failed to load employee directory" });
  }
});

router.put("/twilio/internal-directory/lines/:id", requireAuth, requireFeature("phone_system"), async (req, res): Promise<void> => {
  const params = AssignPhoneInternalLineParams.safeParse(req.params);
  const body = AssignPhoneInternalLineBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "A valid line and employee are required" });
    return;
  }

  const userId = getAuthUserId(req);
  const orgId = await getCurrentPhoneOrgId(userId);
  if (!orgId) {
    res.status(403).json({ error: "An active organization is required" });
    return;
  }
  const [line] = await db.select({
    id: phoneNumbersTable.id,
    orgId: phoneNumbersTable.orgId,
    isActive: phoneNumbersTable.isActive,
  }).from(phoneNumbersTable)
    .where(eq(phoneNumbersTable.id, params.data.id))
    .limit(1);
  if (!line || line.orgId !== orgId) {
    res.status(404).json({ error: "Organization phone line not found" });
    return;
  }

  const [organization] = await db.select({ ownerUserId: organizationsTable.ownerUserId })
    .from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
  const [actorMembership] = await db.select({ role: orgMembersTable.role })
    .from(orgMembersTable)
    .where(and(
      eq(orgMembersTable.orgId, orgId),
      eq(orgMembersTable.userId, userId),
      eq(orgMembersTable.status, "active"),
    )).limit(1);
  if (organization?.ownerUserId !== userId
    && (PHONE_ROLE_RANK[actorMembership?.role ?? ""] ?? 0) < PHONE_ROLE_RANK.manager) {
    res.status(403).json({ error: "Only organization managers can assign office lines" });
    return;
  }

  const target = await getActivePhoneEmployee(orgId, body.data.assignedUserId);
  if (!target) {
    res.status(400).json({ error: "The employee must be active and have paid CALLL HOME access" });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.update(phoneNumbersTable)
      .set({ userId: target.userId })
      .where(and(eq(phoneNumbersTable.id, line.id), eq(phoneNumbersTable.orgId, orgId)));
  });
  res.json(AssignPhoneInternalLineResponse.parse({ ok: true }));
});

router.post("/twilio/pablo/internal-delivery", requireAuth, requireFeature("phone_system"), requireFeature("claw_bot"), async (req, res): Promise<void> => {
  const parsed = SendPabloInternalDeliveryBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.title.trim() || !parsed.data.body.trim()) {
    res.status(400).json({ error: parsed.success ? "Title and message are required" : parsed.error.message });
    return;
  }
  const senderId = getAuthUserId(req);
  const orgId = await getCurrentPhoneOrgId(senderId);
  if (!orgId || parsed.data.targetUserId === senderId
    || !await getActivePhoneEmployee(orgId, parsed.data.targetUserId)) {
    res.status(404).json({ error: "Eligible employee not found in the active organization" });
    return;
  }

  const [sender] = await db.select({
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    username: usersTable.username,
  }).from(usersTable).where(eq(usersTable.id, senderId)).limit(1);
  const [user1Id, user2Id] = [senderId, parsed.data.targetUserId].sort();
  const channelId = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"pablo-prime-dm:" + user1Id + ":" + user2Id}))`);
    const [existing] = await tx.select({ id: chatChannelsTable.id })
      .from(chatChannelsTable)
      .where(and(
        eq(chatChannelsTable.type, "private"),
        eq(chatChannelsTable.user1Id, user1Id),
        eq(chatChannelsTable.user2Id, user2Id),
      )).limit(1);
    if (existing) return existing.id;
    const [created] = await tx.insert(chatChannelsTable)
      .values({ type: "private", user1Id, user2Id })
      .returning({ id: chatChannelsTable.id });
    return created.id;
  });

  const title = parsed.data.title.trim();
  const content = `[${parsed.data.category.toUpperCase()}] ${title}\n\n${parsed.data.body.trim()}`;
  const [message] = await db.insert(chatMessagesTable).values({
    channelId,
    senderUserId: senderId,
    senderName: "Pablo PRIME",
    senderUsername: sender?.username ?? null,
    isBot: true,
    content,
  }).returning();
  broadcastChatMessage(channelId, {
    id: message.id,
    channelId: message.channelId,
    senderUserId: message.senderUserId,
    senderName: "Pablo PRIME",
    senderUsername: sender?.username ?? null,
    senderProfileImageUrl: null,
    isBot: true,
    content: message.content,
    createdAt: message.createdAt,
  });
  const label = parsed.data.category === "report" ? "report" : "message";
  const [notification] = await db.insert(notificationsTable).values({
    userId: parsed.data.targetUserId,
    type: "dm",
    title: `Pablo PRIME sent you a ${label}`,
    body: `${title}\n\n${parsed.data.body.trim().slice(0, 500)}`,
    link: "/comms",
  }).returning({ id: notificationsTable.id });

  res.status(201).json(SendPabloInternalDeliveryResponse.parse({
    ok: true,
    notificationId: notification.id,
  }));
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
      .where(eq(phoneNumbersTable.id, id)).limit(1);
    if (!owned) {
      res.status(404).json({ error: "Phone number not found" });
      return;
    }
    if (owned.orgId === null) {
      if (owned.userId !== userId) {
        res.status(404).json({ error: "Phone number not found" });
        return;
      }
    } else {
      const actorOrgId = await getCurrentPhoneOrgId(userId);
      const [organization] = await db.select({ ownerUserId: organizationsTable.ownerUserId })
        .from(organizationsTable).where(eq(organizationsTable.id, owned.orgId)).limit(1);
      const [actorMembership] = actorOrgId === owned.orgId
        ? await db.select({ role: orgMembersTable.role }).from(orgMembersTable).where(and(
            eq(orgMembersTable.orgId, owned.orgId),
            eq(orgMembersTable.userId, userId),
            eq(orgMembersTable.status, "active"),
          )).limit(1)
        : [];
      const canManagePool = actorOrgId === owned.orgId
        && (organization?.ownerUserId === userId
          || (PHONE_ROLE_RANK[actorMembership?.role ?? ""] ?? 0) >= PHONE_ROLE_RANK.manager);
      if (!canManagePool) {
        res.status(404).json({ error: "Phone number not found" });
        return;
      }
    }
    if (owned.twilioSid) {
      const [paidOwnership] = await db.select({ id: phoneNumberPurchasesTable.id })
        .from(phoneNumberPurchasesTable)
        .where(and(
          eq(phoneNumberPurchasesTable.phoneNumber, owned.number),
          eq(phoneNumberPurchasesTable.twilioSid, owned.twilioSid),
          eq(phoneNumberPurchasesTable.status, "completed"),
        ))
        .limit(1);
      if (paidOwnership && owned.number !== process.env.TWILIO_PHONE_NUMBER) {
        await getTwilioClient().incomingPhoneNumbers(owned.twilioSid).remove();
      }
    }
    await db.delete(phoneNumbersTable).where(eq(phoneNumbersTable.id, id));
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
    const statusCallbackUrl = host
      ? `${protocol}://${host}/api/twilio/webhook/status?userId=${encodeURIComponent(userId)}&callType=batch`
      : undefined;
    const batchCountry = typeof req.body?.countryCode === "string" && /^[A-Za-z]{2}$/.test(req.body.countryCode)
      ? req.body.countryCode.toUpperCase()
      : DEFAULT_COUNTRY;
    const batchOrgId = await getUserOrgId(userId);
    const results = await Promise.allSettled(
      numbers.map(async (entry: { phone: string; name?: string }) => {
        const e164 = toE164(entry.phone, batchCountry);
        if (!e164) return { ok: false, phone: entry.phone, error: "Invalid number" };
        const batchConfName = `conf-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const batchRecordingEnabled = await isCallRecordingEnabled(userId, batchOrgId);
        const batchRecordingCallback = host
          ? `${protocol}://${host}/api/twilio/webhook/recording?userId=${encodeURIComponent(userId)}&type=call&callType=batch&conferenceName=${encodeURIComponent(batchConfName)}`
          : "";
        const batchConference = `<Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false" waitUrl=""${recordingAttrs(batchRecordingEnabled, "record-from-start", batchRecordingCallback)}>${batchConfName}</Conference>`;
        const call = await client.calls.create({
          to: e164,
          from: fromNumber,
          twiml: `<Response><Dial>${batchConference}</Dial></Response>`,
          ...(statusCallbackUrl && {
            statusCallback: statusCallbackUrl,
            statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
            statusCallbackMethod: "POST",
          }),
        });
        const batchCrmMatch = await matchContactByPhone(userId, e164);
        const record = await persistCallHistory({
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
          });
        await recordTelephonyActivity({
          userId,
          orgId: batchOrgId,
          channel: "call",
          direction: "outbound",
          phone: e164,
          contactName: (entry.name || callerName || "").slice(0, 64) || undefined,
          contactId: batchCrmMatch?.contactId,
          status: call.status ?? "initiated",
          twilioSid: call.sid,
        }).catch(() => {});
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

router.get("/twilio/recording-preferences", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const orgId = await getCurrentPhoneOrgId(userId);
    const canManageOrganization = orgId != null
      && (await canDoInOrg(userId, orgId, "phone.supervise")).allowed;
    const [userCallsEnabled, organizationCallsEnabled] = await Promise.all([
      readRecordingPreference(userRecordingPreferenceKey(userId)),
      orgId ? readRecordingPreference(orgRecordingPreferenceKey(orgId)) : Promise.resolve(null),
    ]);
    res.json({
      userCallsEnabled,
      organizationCallsEnabled,
      effectiveCallsEnabled: userCallsEnabled && organizationCallsEnabled !== false,
      organizationId: orgId,
      canManageOrganization,
    });
  } catch (err: unknown) {
    console.error("[CalllHome] recording preferences read error:", err instanceof Error ? err.message : "Unknown");
    res.status(500).json({ error: "Failed to load recording preferences" });
  }
});

router.put("/twilio/recording-preferences", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const { scope, enabled } = req.body ?? {};
    if (typeof enabled !== "boolean" || (scope !== "user" && scope !== "organization")) {
      res.status(400).json({ error: "scope must be user or organization, with a boolean enabled value" });
      return;
    }

    if (scope === "user") {
      await writeRecordingPreference(
        userRecordingPreferenceKey(userId),
        enabled,
        userId,
        "Whether this user records their own calls.",
      );
    } else {
      const orgId = await getCurrentPhoneOrgId(userId);
      if (!orgId) {
        res.status(403).json({ error: "An active organization is required to change organization recording settings" });
        return;
      }
      if (!(await canDoInOrg(userId, orgId, "phone.supervise")).allowed) {
        res.status(403).json({ error: "Organization phone supervision permission required" });
        return;
      }
      await writeRecordingPreference(
        orgRecordingPreferenceKey(orgId),
        enabled,
        userId,
        `Whether organization ${orgId} records calls.`,
      );
    }

    res.json({ ok: true });
  } catch (err: unknown) {
    console.error("[CalllHome] recording preferences update error:", err instanceof Error ? err.message : "Unknown");
    res.status(500).json({ error: "Failed to update recording preferences" });
  }
});

router.get("/twilio/history/:userId", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Login required" });
      return;
    }
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const search = req.query.search as string;
    const requestedScope = req.query.scope;
    if (requestedScope != null && (
      typeof requestedScope !== "string"
      || !["user", "organization", "shared"].includes(requestedScope)
    )) {
      res.status(400).json({ error: "scope must be user, organization, or shared" });
      return;
    }
    const scope = requestedScope === "organization" || requestedScope === "shared"
      ? requestedScope
      : "user";
    let history: (typeof callHistoryTable.$inferSelect & { employeeName?: string })[];
    let employeeNames = new Map<string, string>();

    if (scope === "organization") {
      const orgId = await getCurrentPhoneOrgId(userId);
      if (!orgId) {
        res.status(403).json({ error: "Active organization required" });
        return;
      }
      if (!(await canDoInOrg(userId, orgId, "phone.supervise")).allowed) {
        res.status(403).json({ error: "Organization phone supervision permission required" });
        return;
      }
      history = await db.select().from(callHistoryTable)
        .where(eq(callHistoryTable.orgId, orgId))
        .orderBy(desc(callHistoryTable.startedAt))
        .limit(limit);
      const employeeIds = [...new Set(history.map((call) => call.userId))];
      if (employeeIds.length) {
        const employees = await db.select({
          id: usersTable.id,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
        }).from(usersTable).where(inArray(usersTable.id, employeeIds));
        employeeNames = new Map(employees.map((employee) => [
          employee.id,
          [employee.firstName, employee.lastName].filter(Boolean).join(" ") || employee.id,
        ]));
      }
    } else if (scope === "shared") {
      const shares = await db.select({ callHistoryId: sharedMediaTable.callHistoryId })
        .from(sharedMediaTable)
        .where(and(
          eq(sharedMediaTable.toUserId, userId),
          eq(sharedMediaTable.mediaType, "recording"),
        ));
      const callIds = [...new Set(shares.map((share) => share.callHistoryId).filter((id): id is number => id != null))];
      history = callIds.length
        ? await db.select().from(callHistoryTable)
          .where(inArray(callHistoryTable.id, callIds))
          .orderBy(desc(callHistoryTable.startedAt))
          .limit(limit)
        : [];
    } else {
      history = await db.select().from(callHistoryTable)
        .where(eq(callHistoryTable.userId, userId))
        .orderBy(desc(callHistoryTable.startedAt))
        .limit(limit);
    }

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

    res.json({
      calls: filtered.map((call) => scope === "organization"
        ? { ...call, employeeName: employeeNames.get(call.userId) ?? call.userId }
        : call),
    });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] history error:", _msg);
    res.status(500).json({ error: "Failed to fetch call history" });
  }
});

// Stream a Twilio recording (MP3) to an authenticated user. Twilio recording
// URLs require Basic auth (AccountSid + AuthToken), so the browser can't fetch
// them directly — we proxy with auth and verify ownership first.
async function loadCallRecordingBytes(recordingUrl: string): Promise<Buffer> {
  if (recordingUrl.startsWith("/objects/")) {
    const file = await new ObjectStorageService().getObjectEntityFile(recordingUrl);
    const [bytes] = await file.download();
    const buffer = Buffer.from(bytes);
    if (!buffer.length || buffer.length > 150 * 1024 * 1024) throw new Error("Recording exceeds excerpt processing limits");
    return buffer;
  }
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) throw new Error("Twilio credentials not configured");
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const upstream = await fetch(recordingUrl, { headers: { Authorization: `Basic ${auth}` } });
  if (!upstream.ok) throw new Error(`Twilio responded ${upstream.status}`);
  const bytes = Buffer.from(await upstream.arrayBuffer());
  if (!bytes.length || bytes.length > 150 * 1024 * 1024) throw new Error("Recording exceeds excerpt processing limits");
  return bytes;
}

async function createMp3Excerpt(audio: Buffer, startMs: number, endMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const startSeconds = (startMs / 1000).toFixed(3);
    const durationSeconds = ((endMs - startMs) / 1000).toFixed(3);
    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-ss", startSeconds,
      "-i", "pipe:0",
      "-t", durationSeconds,
      "-map", "0:a:0",
      "-vn",
      "-codec:a", "libmp3lame",
      "-q:a", "4",
      "-f", "mp3",
      "pipe:1",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let outputBytes = 0;
    let stderr = "";
    ffmpeg.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > 30 * 1024 * 1024) {
        ffmpeg.kill("SIGKILL");
        reject(new Error("Excerpt exceeds the export size limit"));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 2000) stderr += chunk.toString();
    });
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code === 0 && chunks.length) resolve(Buffer.concat(chunks));
      else reject(new Error(`Could not create excerpt: ${stderr.slice(-600) || `ffmpeg exited ${code}`}`));
    });
    ffmpeg.stdin.on("error", reject);
    ffmpeg.stdin.end(audio);
  });
}

router.put("/twilio/recording/:callId/excerpts", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const callId = Number(req.params.callId);
    if (!userId || !Number.isInteger(callId) || callId <= 0) {
      res.status(400).json({ error: "callId required" });
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
      res.status(404).json({ error: "No recording on file for this call" });
      return;
    }
    const excerpts = validateRecordingExcerpts(req.body?.excerpts, call.durationSeconds);
    if (!excerpts) {
      res.status(400).json({
        error: "Excerpts must have unique ids, valid time ranges within the call, and be no longer than 10 minutes each.",
      });
      return;
    }
    const saved = await db.transaction(async (tx) => {
      const [fresh] = await tx.select({ transcriptEventsJson: callHistoryTable.transcriptEventsJson })
        .from(callHistoryTable)
        .where(eq(callHistoryTable.id, callId))
        .for("update")
        .limit(1);
      if (!fresh) return false;
      const state = readRecordingWorkflowState(fresh.transcriptEventsJson);
      await tx.update(callHistoryTable).set({
        transcriptEventsJson: updateRecordingWorkflowState(fresh.transcriptEventsJson, {
          ...state,
          excerpts,
        }),
      }).where(eq(callHistoryTable.id, callId));
      return true;
    });
    if (!saved) {
      res.status(404).json({ error: "Call not found" });
      return;
    }
    res.json({ excerpts });
  } catch (err: unknown) {
    console.error("[CalllHome] recording excerpt save error:", err instanceof Error ? err.message : "Unknown");
    res.status(500).json({ error: "Failed to save recording excerpts" });
  }
});

router.get("/twilio/recording/:callId", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const callId = Number(req.params.callId);
    if (!userId || !Number.isInteger(callId) || callId <= 0) {
      res.status(400).json({ error: "callId required" });
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
      res.status(404).json({ error: "No recording on file for this call" });
      return;
    }
    const hasStart = req.query.startMs !== undefined;
    const hasEnd = req.query.endMs !== undefined;
    if (hasStart || hasEnd) {
      const startMs = typeof req.query.startMs === "string" ? Number(req.query.startMs) : NaN;
      const endMs = typeof req.query.endMs === "string" ? Number(req.query.endMs) : NaN;
      const durationMs = Math.max(0, (call.durationSeconds ?? 0) * 1000);
      if (
        !Number.isInteger(startMs) || !Number.isInteger(endMs) ||
        startMs < 0 || endMs <= startMs || endMs > durationMs ||
        endMs - startMs > 10 * 60 * 1000
      ) {
        res.status(400).json({ error: "Provide valid startMs/endMs within the call duration; excerpts are limited to 10 minutes." });
        return;
      }
      const source = await loadCallRecordingBytes(call.recordingUrl);
      const excerpt = await createMp3Excerpt(source, startMs, endMs);
      const disposition = req.query.download === "1" ? "attachment" : "inline";
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", excerpt.length);
      res.setHeader("Content-Disposition", `${disposition}; filename="call-${callId}-excerpt-${startMs}-${endMs}.mp3"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Call-Id", String(callId));
      res.setHeader("X-Excerpt-Start-Ms", String(startMs));
      res.setHeader("X-Excerpt-End-Ms", String(endMs));
      res.send(excerpt);
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
    const inbOrgId2 = telephonyOwner?.orgId ?? (userId ? await getUserOrgId(userId) : null);
    const recordingEnabled = userId ? await isCallRecordingEnabled(userId, inbOrgId2) : false;

    const host = getAppHost(req);
    const base = host ? `https://${host}/api` : "/api";
    const voiceRecordingCallback = `${base}/twilio/webhook/recording?userId=${encodeURIComponent(userId ?? "")}&amp;type=call`;
    const voiceFullCallRecording = startRecordingTwiml(recordingEnabled, voiceRecordingCallback);

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

    if (CallSid) {
      await persistCallHistory({
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
    }
    if (userId && CallSid && From) {
      await recordTelephonyActivity({
        userId,
        orgId: inbOrgId2,
        channel: "call",
        direction: "inbound",
        phone: From,
        contactName: fromName,
        contactId: inbCrmContactId,
        status: "ringing",
        twilioSid: CallSid,
      }).catch(() => {});
    }

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
${voiceFullCallRecording}
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
          const greeting = config.greetingScript ?? "Thank you for calling. This is Pablo, your AI assistant. How can I help you today?";
          const twiml = `<Response>
${voiceFullCallRecording}
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
        const greeting = config.greetingScript ?? `Thank you for calling. This is Pablo, your virtual office assistant. How can I help you today?`;
        const screening = config.screeningRules ?? "Ask for the caller's name and the reason for their call.";
        const routing = config.routingInstructions ?? "";
        const twiml = `<Response>
${voiceFullCallRecording}
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
${voiceFullCallRecording}
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

    const isTerminal = TERMINAL_CALL_STATUSES.has(String(CallStatus));
    const callDirection = String(Direction ?? "").toLowerCase().startsWith("inbound") ? "inbound" : "outbound";
    const hintedUserId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    const callbackOwner = await resolveTelephonyOwner({
      destinationNumber: callDirection === "inbound" ? To : From,
      hintedUserId,
    });
    const callbackOrgId = callbackOwner?.orgId
      ?? (callbackOwner?.userId ? await getUserOrgId(callbackOwner.userId) : null);
    const callbackCallType = typeof req.query.callType === "string"
      ? req.query.callType.slice(0, 32)
      : "single";
    const parsedDuration = CallDuration == null ? NaN : Number.parseInt(String(CallDuration), 10);

    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${CallSid}))`);
      const [before] = await tx.select()
        .from(callHistoryTable)
        .where(eq(callHistoryTable.twilioCallSid, CallSid))
        .limit(1);
      const statusAdvances = !before || shouldAdvanceCallStatus(before.status, CallStatus);
      const durationAdvances = Number.isFinite(parsedDuration)
        && parsedDuration >= 0
        && parsedDuration > (before?.durationSeconds ?? -1);
      const statusPatch: Partial<CallHistoryInsert> = {
        ...(statusAdvances ? { status: CallStatus } : {}),
        ...(durationAdvances ? { durationSeconds: parsedDuration } : {}),
        ...(isTerminal && !before?.endedAt ? { endedAt: new Date() } : {}),
      };
      let rows = before && Object.keys(statusPatch).length > 0
        ? await tx.update(callHistoryTable)
          .set(statusPatch)
          .where(eq(callHistoryTable.twilioCallSid, CallSid))
          .returning()
        : [];
      if (before && rows.length === 0) rows = [before];
      let shouldNotifyMissed = Boolean(
        isTerminal && ["no-answer", "busy", "failed"].includes(CallStatus)
        && before && !TERMINAL_CALL_STATUSES.has(before.status),
      );
      if (!before && callbackOwner?.userId) {
        const recipientNumber = (callDirection === "inbound" ? From : To) || "unknown";
        const [inserted] = await tx.insert(callHistoryTable).values({
          userId: callbackOwner.userId,
          orgId: callbackOrgId ?? undefined,
          callerName: typeof req.query.contactName === "string" ? req.query.contactName.slice(0, 64) : null,
          recipientNumber,
          twilioCallSid: CallSid,
          status: CallStatus,
          direction: callDirection,
          callType: callbackCallType,
          consentGiven: false,
          recordingRetainUntil: getRetentionDate(),
          ...(Number.isFinite(parsedDuration) && parsedDuration >= 0 && { durationSeconds: parsedDuration }),
          ...(isTerminal && { endedAt: new Date() }),
        }).onConflictDoNothing().returning();
        rows = inserted
          ? [inserted]
          : await tx.select().from(callHistoryTable)
            .where(eq(callHistoryTable.twilioCallSid, CallSid))
            .limit(1);
        shouldNotifyMissed = Boolean(
          inserted && callDirection === "inbound" && isTerminal
          && ["no-answer", "busy", "failed"].includes(CallStatus),
        );
      }
      if ((CallStatus === "answered" || CallStatus === "in-progress") && before?.status !== "answered" && before?.status !== "in-progress" && before?.dialingSessionId) {
        await tx.update(dialingSessionsTable)
          .set({ answeredCount: sql`${dialingSessionsTable.answeredCount} + 1` })
          .where(eq(dialingSessionsTable.id, before.dialingSessionId));
      }
      return { rows, shouldNotifyMissed };
    });

    if (updated.rows[0]) {
      const c = updated.rows[0];
      await recordTelephonyActivity({
        userId: c.userId,
        orgId: c.orgId ?? null,
        channel: "call",
        direction: (c.direction === "inbound" ? "inbound" : "outbound"),
        phone: c.recipientNumber,
        contactName: c.callerName ?? undefined,
        contactId: c.contactId ?? undefined,
        durationSeconds: c.durationSeconds ?? (CallDuration ? parseInt(CallDuration, 10) : undefined),
          status: c.status,
        twilioSid: CallSid,
      }).catch(() => {});
    }

    const transferCallerSid = String(req.query.transferCallerSid ?? "");
    const transferCallerUserId = String(req.query.transferCallerUserId ?? "");
    const transferOrgId = Number(req.query.transferOrgId);
    if (isTerminal && ["failed", "busy", "no-answer", "canceled"].includes(CallStatus)
      && transferCallerSid && transferCallerUserId && Number.isInteger(transferOrgId)) {
      const [originatingCall] = await db.select({ id: callHistoryTable.id })
        .from(callHistoryTable)
        .where(and(
          eq(callHistoryTable.twilioCallSid, transferCallerSid),
          eq(callHistoryTable.userId, transferCallerUserId),
          eq(callHistoryTable.orgId, transferOrgId),
        )).limit(1);
      if (originatingCall) {
        try {
          await getTwilioClient().calls(transferCallerSid).update({
            twiml: "<Response><Say>The employee is unavailable right now. Please try again later.</Say><Hangup/></Response>",
          });
        } catch (err) {
          req.log.warn({ err, transferOrgId }, "Could not return caller from an unanswered employee transfer");
        }
      }
    }

    if (updated.shouldNotifyMissed) {
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

router.post("/twilio/webhook/recording-notice", async (req, res) => {
  if (!validateTwilioWebhook(req)) {
    console.error("[CalllHome] webhook/recording-notice: invalid Twilio signature");
    res.status(403).send("Forbidden");
    return;
  }
  // Older TwiML may still call this callback; keep it silent.
  res.type("text/xml").send("<Response/>");
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
      To,
      Direction,
      CallStatus,
      RecordingDuration,
      RecordingStatus,
    } = req.body;
    const hintedUserId = req.query.userId as string | undefined;
    const recordingType = req.query.type as string;
    const conferenceName = req.query.conferenceName as string | undefined;

    if (RecordingStatus && RecordingStatus !== "completed") {
      res.status(204).send();
      return;
    }

    let fromNumber = FromField as string | undefined;
    let callOwner: { userId: string; orgId: number | null } | null = null;

    if (CallSid) {
      const callRows = await db
        .select()
        .from(callHistoryTable)
        .where(eq(callHistoryTable.twilioCallSid, CallSid))
        .limit(1);
      if (callRows[0]) {
        fromNumber = fromNumber ?? callRows[0].recipientNumber;
        callOwner = { userId: callRows[0].userId, orgId: callRows[0].orgId ?? null };
      }
    }

    const telephonyOwner = callOwner ?? await resolveTelephonyOwner({
      destinationNumber: String(Direction ?? "").toLowerCase().startsWith("inbound") ? To : (FromField ?? To),
      hintedUserId,
    });
    const userId = telephonyOwner?.userId;

    if (recordingType === "voicemail" && userId) {
      const [callWithTranscript] = CallSid
        ? await db.select({ transcript: callHistoryTable.transcript })
          .from(callHistoryTable)
          .where(eq(callHistoryTable.twilioCallSid, CallSid))
          .limit(1)
        : [];
      const transcript = callWithTranscript?.transcript
        || `[Voicemail from ${fromNumber ?? "unknown"} - ${new Date().toLocaleString()}]`;

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

      const voicemailResult = await db.transaction(async (tx) => {
        const lockKey = `voicemail:${RecordingSid || CallSid || `${userId}:${fromNumber ?? "unknown"}`}`;
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
        const [existing] = RecordingSid
          ? await tx.select().from(voicemailsTable).where(eq(voicemailsTable.recordingSid, RecordingSid)).limit(1)
          : CallSid
            ? await tx.select().from(voicemailsTable).where(eq(voicemailsTable.twilioCallSid, CallSid)).limit(1)
            : [];
        const storedRecordingUrl = existing?.recordingUrl
          ?? (RecordingUrl ? `${RecordingUrl}.mp3` : undefined);
        const durationSeconds = Number.isFinite(Number(RecordingDuration)) ? Number(RecordingDuration) : 0;
        if (existing) {
          const [updatedVm] = await tx.update(voicemailsTable)
            .set({
              ...(storedRecordingUrl && { recordingUrl: storedRecordingUrl }),
              ...(RecordingSid && { recordingSid: RecordingSid }),
              durationSeconds,
              orgId: orgId ?? undefined,
              contactId: crmContactId,
              fromName: fromName ?? existing.fromName ?? undefined,
            })
            .where(eq(voicemailsTable.id, existing.id))
            .returning();
          return { vm: updatedVm, created: false, storedRecordingUrl };
        }
        const [createdVm] = await tx.insert(voicemailsTable).values({
          userId,
          orgId: orgId ?? undefined,
          fromNumber: fromNumber ?? "unknown",
          fromName: fromName ?? undefined,
          twilioCallSid: CallSid,
          contactId: crmContactId,
          recordingUrl: storedRecordingUrl,
          recordingSid: RecordingSid,
          durationSeconds,
          transcript,
        }).returning();
        return { vm: createdVm, created: true, storedRecordingUrl };
      });

      if (voicemailResult.created) {
        await sendMissedCallEmail(userId, fromNumber ?? "unknown", fromName, voicemailResult.vm.id, req);
        console.log(`[CalllHome] webhook/recording: voicemail created id=${voicemailResult.vm.id} from=${fromNumber} orgId=${orgId}`);
      }
      await recordTelephonyActivity({
        userId,
        orgId: orgId ?? null,
        channel: "voicemail",
        direction: "inbound",
        phone: fromNumber ?? "unknown",
        contactName: fromName,
        contactId: crmContactId,
        body: voicemailResult.vm.transcript ?? transcript,
        recordingUrl: voicemailResult.storedRecordingUrl,
        durationSeconds: voicemailResult.vm.durationSeconds ?? undefined,
        twilioSid: CallSid,
      }).catch(() => {});
    } else if (RecordingUrl && (CallSid || conferenceName)) {
      const callDirection = String(Direction ?? "").toLowerCase().startsWith("inbound") ? "inbound" : "outbound";
      const callPhone = (callDirection === "inbound" ? FromField : To) as string | undefined;
      const ownerId = callOwner?.userId ?? telephonyOwner?.userId;
      const ownerOrgId = callOwner?.orgId ?? telephonyOwner?.orgId
        ?? (ownerId ? await getUserOrgId(ownerId) : null);

      if (CallSid && ownerId) {
        const [existingCall] = await db.select()
          .from(callHistoryTable)
          .where(eq(callHistoryTable.twilioCallSid, CallSid))
          .limit(1);
        const crmPhone = callPhone ?? existingCall?.recipientNumber
          ?? (callDirection === "inbound" ? FromField : To);
        const crmMatch = ownerId && crmPhone && (!existingCall?.contactId || !existingCall.callerName)
          ? await matchContactByPhone(ownerId, crmPhone)
          : null;
        await persistCallHistory({
          userId: ownerId,
          orgId: ownerOrgId ?? undefined,
          callerName: typeof req.query.contactName === "string"
            ? req.query.contactName.slice(0, 64)
            : crmMatch?.contactName ?? undefined,
          recipientNumber: callPhone ?? existingCall?.recipientNumber ?? "unknown",
          twilioCallSid: CallSid,
          status: existingCall?.status ?? (typeof CallStatus === "string" ? CallStatus : "completed"),
          direction: existingCall?.direction ?? callDirection,
          callType: existingCall?.callType && existingCall.callType !== "single"
            ? existingCall.callType
            : (typeof req.query.callType === "string" ? req.query.callType.slice(0, 32) : "single"),
          durationSeconds: Number.isFinite(Number(RecordingDuration)) ? Number(RecordingDuration) : undefined,
          contactId: crmMatch?.contactId,
          ...(!existingCall ? { consentGiven: false } : {}),
          ...(!existingCall?.recordingRetainUntil ? { recordingRetainUntil: getRetentionDate() } : {}),
          ...(!existingCall?.endedAt ? { endedAt: new Date() } : {}),
        });
      }

      const recordingKey = String(RecordingSid || CallSid || `${hintedUserId}:${conferenceName}`);
      const finalized = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`recording:${recordingKey}`}))`);
        let rows = CallSid
          ? await tx.select().from(callHistoryTable).where(eq(callHistoryTable.twilioCallSid, CallSid))
          : [];
        if (!rows.length && hintedUserId && conferenceName) {
          rows = await tx.select().from(callHistoryTable).where(and(
            eq(callHistoryTable.userId, hintedUserId),
            eq(callHistoryTable.conferenceName, conferenceName),
          ));
        } else if (rows[0]?.conferenceName) {
          rows = await tx.select().from(callHistoryTable).where(and(
            eq(callHistoryTable.userId, rows[0].userId),
            eq(callHistoryTable.conferenceName, rows[0].conferenceName),
          ));
        }
        if (!rows.length) return { rows, storedRecordingUrl: "", audio: null as Buffer | null };

        const alreadyArchived = rows.find((row) =>
          row.recordingSid === RecordingSid && Boolean(row.recordingUrl),
        );
        let storedRecordingUrl = alreadyArchived?.recordingUrl ?? "";
        let audio: Buffer | null = null;
        if (!storedRecordingUrl) {
          const downloaded = process.env.NODE_ENV === "test"
            ? { bytes: Buffer.from("mock call audio"), contentType: "audio/mpeg" }
            : await downloadTwilioRecording(RecordingUrl);
          audio = downloaded.bytes;
          storedRecordingUrl = process.env.NODE_ENV === "test"
            ? `${RecordingUrl}.mp3`
            : await archiveTwilioRecording(downloaded.bytes, downloaded.contentType);
        } else if (rows.some((row) => !row.transcript)) {
          audio = process.env.NODE_ENV === "test"
            ? Buffer.from("mock call audio")
            : (await downloadTwilioRecording(RecordingUrl)).bytes;
        }

        for (const row of rows) {
          await tx.update(callHistoryTable).set({
            recordingUrl: storedRecordingUrl,
            recordingSid: RecordingSid ?? undefined,
            ...(!row.recordingRetainUntil && { recordingRetainUntil: getRetentionDate() }),
            ...(Number.isFinite(Number(RecordingDuration)) && { durationSeconds: Number(RecordingDuration) }),
          }).where(eq(callHistoryTable.id, row.id));
        }
        const updatedRows = await tx.select().from(callHistoryTable)
          .where(inArray(callHistoryTable.id, rows.map((row) => row.id)));
        return { rows: updatedRows, storedRecordingUrl, audio };
      });

      if (finalized.rows.length) {
        let transcript = finalized.rows.find((row) => row.transcript)?.transcript ?? "";
        let summary = finalized.rows.find((row) => row.summary)?.summary ?? "";
        if (!transcript && finalized.audio) {
          try {
            const result = await transcribeRecordingOnce(recordingKey, finalized.audio);
            transcript = result.transcript;
            summary = result.summary;
            if (transcript) {
              for (const row of finalized.rows) {
                if (!row.transcript) {
                  await db.update(callHistoryTable)
                    .set({ transcript, ...(summary && { summary }) })
                    .where(and(eq(callHistoryTable.id, row.id), sql`${callHistoryTable.transcript} is null`));
                }
              }
            }
          } catch (transcriptionError) {
            console.warn(
              "[CalllHome] full-call transcription failed:",
              transcriptionError instanceof Error ? transcriptionError.message : "Unknown",
            );
          }
        }
        if (transcript && !summary) {
          summary = await generateCallSummary(transcript).catch(() => "");
          if (summary) {
            for (const call of finalized.rows) {
              await db.update(callHistoryTable)
                .set({ summary })
                .where(and(eq(callHistoryTable.id, call.id), sql`${callHistoryTable.summary} is null`));
            }
          }
        }
        const callerEvidence = transcript ? extractCallerIdentityEvidence(transcript) : {};
        const contractHighlights = transcript ? findContractualHighlights(transcript) : [];
        const emailedUsers = new Set<string>();
        for (const call of finalized.rows) {
          if (transcript) {
            await saveRecordingAnalysis(call.id, contractHighlights, callerEvidence.name);
          }
          await recordTelephonyActivity({
            userId: call.userId,
            orgId: call.orgId ?? null,
            channel: "call",
            direction: call.direction === "inbound" ? "inbound" : "outbound",
            phone: call.recipientNumber,
            contactName: callerEvidence.name ?? call.callerName ?? undefined,
            dateOfBirth: callerEvidence.dateOfBirth,
            email: callerEvidence.email,
            company: callerEvidence.company,
            contactId: call.contactId ?? undefined,
            recordingUrl: finalized.storedRecordingUrl,
            body: transcript || undefined,
            summary: summary || undefined,
            durationSeconds: call.durationSeconds ?? undefined,
            twilioSid: call.twilioCallSid ?? CallSid,
          }).catch(() => {});
          if (!emailedUsers.has(call.userId)) {
            await sendRecordingReadyEmailOnce(call.id, call.userId, req);
            emailedUsers.add(call.userId);
          }
        }
      }
    }

    res.status(204).send();
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[CalllHome] webhook/recording error:", _msg);
    res.status(500).send("Error");
  }
});

router.post("/twilio/webhook/realtime-transcription", async (req, res) => {
  try {
    if (!validateTwilioWebhook(req)) {
      res.status(403).send("Forbidden");
      return;
    }
    if (req.body.TranscriptionEvent !== "transcription-content") {
      res.status(204).send();
      return;
    }

    const userId = typeof req.query.userId === "string" ? req.query.userId : "";
    const contactId = Number(req.query.contactId);
    const orgId = Number(req.query.orgId);
    const conferenceName = typeof req.query.conferenceName === "string" ? req.query.conferenceName : "";
    const callSid = typeof req.body.CallSid === "string" ? req.body.CallSid : "";
    const transcriptionSid = typeof req.body.TranscriptionSid === "string" ? req.body.TranscriptionSid : "";
    const track = typeof req.body.Track === "string" ? req.body.Track.slice(0, 48) : "unknown";
    const sequenceId = Number.parseInt(String(req.body.SequenceId ?? ""), 10);
    let transcriptionData: Record<string, unknown> | null = null;
    try {
      const raw = req.body.TranscriptionData;
      const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        transcriptionData = parsed as Record<string, unknown>;
      }
    } catch {}
    const transcript = typeof transcriptionData?.transcript === "string"
      ? transcriptionData.transcript.replace(/\s+/g, " ").trim().slice(0, 2000)
      : "";
    if (
      !userId || !Number.isInteger(contactId) || contactId <= 0
      || !Number.isInteger(orgId) || orgId <= 0
      || !conferenceName || !callSid || !transcriptionSid
      || !Number.isInteger(sequenceId) || sequenceId < 1 || !transcript
    ) {
      res.status(204).send();
      return;
    }

    const trackLabel = track.toLowerCase().includes("outbound") ? "Employee" : "Caller";
    const transcriptLine = `${trackLabel}: ${transcript}`;
    let stopCallerRequested = false;
    await db.transaction(async (tx) => {
      const [parentCall] = await tx.select().from(callHistoryTable).where(and(
        eq(callHistoryTable.userId, userId),
        eq(callHistoryTable.orgId, orgId),
        eq(callHistoryTable.contactId, contactId),
        eq(callHistoryTable.twilioCallSid, callSid),
      )).for("update").limit(1);
      if (!parentCall || parentCall.callType !== "pablo_agent" || parentCall.conferenceName !== conferenceName) return;

      const children = await tx.select().from(callHistoryTable).where(and(
        eq(callHistoryTable.orgId, orgId),
        eq(callHistoryTable.conferenceName, conferenceName),
        eq(callHistoryTable.callType, "pablo_internal_transfer"),
      )).for("update");
      const rows = [parentCall, ...children];
      const cursorKey = `${transcriptionSid}|${track}`;
      for (const row of rows) {
        let events: Record<string, unknown> = {};
        try {
          const parsed: unknown = JSON.parse(row.transcriptEventsJson || "{}");
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            events = parsed as Record<string, unknown>;
          }
        } catch {}
        const lastSequence = Number(events[cursorKey] ?? 0);
        if (sequenceId <= lastSequence) continue;
        events[cursorKey] = sequenceId;
        if (trackLabel === "Caller" && classifyPabloCallAnswer(transcript) === "stop") {
          stopCallerRequested = true;
        }
        const transcriptText = [row.transcript, transcriptLine].filter(Boolean).join("\n").slice(-30000);
        await tx.update(callHistoryTable).set({
          transcript: transcriptText,
          transcriptEventsJson: JSON.stringify(events),
        }).where(eq(callHistoryTable.id, row.id));
      }
      if (stopCallerRequested) {
        const now = new Date();
        const prefs = await tx.select({ id: contactChannelPrefsTable.id }).from(contactChannelPrefsTable)
          .where(and(
            eq(contactChannelPrefsTable.userId, userId),
            eq(contactChannelPrefsTable.contactId, contactId),
          )).for("update");
        if (prefs.length) {
          await tx.update(contactChannelPrefsTable).set({
            phoneCallOptIn: false,
            phoneCallOptedOutAt: now,
            updatedAt: now,
          }).where(and(
            eq(contactChannelPrefsTable.userId, userId),
            eq(contactChannelPrefsTable.contactId, contactId),
          ));
        } else {
          await tx.insert(contactChannelPrefsTable).values({
            userId,
            contactId,
            phoneCallOptIn: false,
            phoneCallConsentedAt: null,
            phoneCallOptedOutAt: now,
          });
        }
      }
    });
    if (stopCallerRequested) {
      try {
        const conferences = await getTwilioClient().conferences.list({
          friendlyName: conferenceName,
          status: "in-progress",
          limit: 20,
        });
        await Promise.all(conferences
          .filter((conference) => conference.friendlyName === conferenceName)
          .map((conference) => getTwilioClient().conferences(conference.sid).update({ status: "completed" })));
      } catch (err: unknown) {
        req.log.error({ err, conferenceName }, "Could not end campaign conference after spoken STOP");
      }
    }
    res.status(204).send();
  } catch (err: unknown) {
    req.log.error({ err }, "Twilio real-time transcription callback failed");
    res.status(500).send("Callback error");
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

    let summary: string | undefined;
    const getSummary = async () => summary ??= await generateCallSummary(TranscriptionText).catch(() => "");
    if (CallSid) {
      const callRows = await db
        .select()
        .from(callHistoryTable)
        .where(eq(callHistoryTable.twilioCallSid, CallSid))
        .limit(1);
      if (callRows[0]) {
        summary = await getSummary();
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
        summary = await getSummary();
        await db
          .update(voicemailsTable)
          .set({ transcript: TranscriptionText, ...(summary && { summary }) })
          .where(eq(voicemailsTable.id, vmRows[0].id));
        const vm = vmRows[0];
        await recordTelephonyActivity({
          userId: vm.userId,
          orgId: vm.orgId ?? null,
          channel: "voicemail",
          direction: "inbound",
          phone: vm.fromNumber,
          contactName: vm.fromName ?? undefined,
          contactId: vm.contactId ?? undefined,
          recordingUrl: vm.recordingUrl ?? undefined,
          body: TranscriptionText,
          summary: summary || undefined,
          durationSeconds: vm.durationSeconds ?? undefined,
          twilioSid: vm.twilioCallSid ?? CallSid ?? RecordingSid,
        }).catch(() => {});
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
    const { From, To, Body, MessageSid, NumMedia, OptOutType } = req.body;

    if (!From || !Body) {
      res.type("text/xml").send("<Response></Response>");
      return;
    }
    const stopKeyword = /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)$/i.test(String(Body).trim());
    const startKeyword = /^(START|UNSTOP)$/i.test(String(Body).trim());
    const isSmsOptOut = stopKeyword || String(OptOutType ?? "").toUpperCase() === "STOP";
    const isSmsOptIn = startKeyword || String(OptOutType ?? "").toUpperCase() === "START";
    const isSmsConsentCommand = isSmsOptOut || isSmsOptIn;
    let alreadyProcessed = false;
    if (MessageSid) {
      const [processedRow] = await db.select({ id: smsMessagesTable.id })
        .from(smsMessagesTable)
        .where(eq(smsMessagesTable.twilioMessageSid, MessageSid))
        .limit(1);
      if (processedRow && !isSmsConsentCommand) {
        res.type("text/xml").send("<Response></Response>");
        return;
      }
      alreadyProcessed = Boolean(processedRow);
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

    if (isSmsConsentCommand && userId && contactId) {
      await persistSmsPreference(userId, contactId, isSmsOptIn);
    }
    if (alreadyProcessed) {
      res.type("text/xml").send("<Response></Response>");
      return;
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
    if (isSmsConsentCommand) {
      res.type("text/xml").send("<Response></Response>");
      return;
    }
    if (!userId) {
      res.type("text/xml").send("<Response></Response>");
      return;
    }

    let pabloReplyText = "";
    try {
      const pabloOrganization = await resolvePabloOrgContext(userId, ownerOrgId);
      const orgIndustryContext = buildPabloOrgIndustryContext(pabloOrganization?.industry);
      const PABLO_SMS_PROMPT = `${PABLO_CORE_PERSONA}${orgIndustryContext ? `\n\n${orgIndustryContext}` : ""}

You are replying to an inbound business SMS for the user's organization.
Keep the response concise, clear, professional, and natural for SMS (under 300 characters).
Answer the message directly. Ask at most one relevant follow-up question. Do not invent business facts or promise actions you cannot verify.`;
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
          { role: "system", content: PABLO_SMS_PROMPT },
          ...history,
          { role: "user", content: Body.slice(0, 1000) },
        ],
      });
      pabloReplyText = (completion.choices[0]?.message?.content ?? "").trim().slice(0, 480);
    } catch (e) {
      console.error("[Pablo SMS] LLM error:", e instanceof Error ? e.message : e);
      pabloReplyText = "Pablo here. I'm having trouble responding right now. Please try again shortly.";
    }

    if (pabloReplyText && userId) {
      if (contactId) {
        await db.insert(contactInteractionsTable).values({
          contactId,
          userId,
          type: "sms",
          note: `Pablo SMS reply: ${pabloReplyText}`,
        }).catch(() => {});
      }
      if (conversationId) {
        await db.insert(smsMessagesTable).values({
          conversationId,
          userId,
          direction: "outbound",
          body: pabloReplyText,
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
        body: pabloReplyText,
      }).catch(() => {});
    }

    const escapedReply = pabloReplyText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    res.type("text/xml").send(
      pabloReplyText
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

router.get("/twilio/supervision/calls", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const orgId = await getPhoneSupervisionOrgId(userId);
    if (!orgId) {
      res.status(403).json({ error: "Organization call supervision permission required" });
      return;
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const calls = await db.select().from(callHistoryTable).where(and(
      eq(callHistoryTable.orgId, orgId),
      eq(callHistoryTable.callType, "pablo_internal_transfer"),
      gte(callHistoryTable.startedAt, since),
    )).orderBy(desc(callHistoryTable.startedAt)).limit(100);
    const conferenceNames = [...new Set(calls.map((call) => call.conferenceName).filter((name): name is string => Boolean(name)))];
    const relatedCalls = conferenceNames.length
      ? await db.select().from(callHistoryTable).where(and(
          eq(callHistoryTable.orgId, orgId),
          inArray(callHistoryTable.conferenceName, conferenceNames),
        ))
      : [];
    const memberIds = [...new Set(calls.map((call) => call.userId))];
    const members = memberIds.length
      ? await db.select({
          id: usersTable.id,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
          username: usersTable.username,
        }).from(usersTable).where(inArray(usersTable.id, memberIds))
      : [];
    const memberNames = new Map(members.map((member) => [
      member.id,
      [member.firstName, member.lastName].filter(Boolean).join(" ") || member.username || "Employee",
    ]));
    const relatedByConference = new Map<string, typeof relatedCalls>();
    for (const related of relatedCalls) {
      if (!related.conferenceName) continue;
      const group = relatedByConference.get(related.conferenceName) ?? [];
      group.push(related);
      relatedByConference.set(related.conferenceName, group);
    }

    res.json({
      calls: calls.map((call) => {
        const active = call.status === "in-progress";
        const siblings = call.conferenceName ? relatedByConference.get(call.conferenceName) ?? [] : [];
        const customerLeg = siblings.find((item) => item.callType === "pablo_agent");
        const rawNumber = customerLeg?.recipientNumber ?? "";
        const digits = rawNumber.replace(/\D/g, "");
        let quality: Record<string, unknown> | null = null;
        try {
          const parsed: unknown = call.connectionQualityJson ? JSON.parse(call.connectionQualityJson) : null;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const latest = (parsed as { latest?: unknown }).latest;
            if (latest && typeof latest === "object" && !Array.isArray(latest)) quality = latest as Record<string, unknown>;
          }
        } catch {}
        return {
          id: call.id,
          employeeName: memberNames.get(call.userId) ?? "Employee",
          customerName: customerLeg?.callerName ?? "Outbound caller",
          customerPhoneLast4: digits ? digits.slice(-4) : null,
          status: call.status,
          startedAt: call.startedAt,
          durationSeconds: active
            ? Math.max(0, Math.floor((Date.now() - call.startedAt.getTime()) / 1000))
            : call.durationSeconds ?? 0,
          transcript: call.transcript?.slice(-30000) ?? "",
          connectionQuality: quality,
          active,
          canMonitor: active && Boolean(call.conferenceName && call.twilioCallSid),
        };
      }),
    });
  } catch (err: unknown) {
    req.log.error({ err }, "Phone call supervision list failed");
    res.status(500).json({ error: "Failed to fetch supervised calls" });
  }
});

router.post("/twilio/supervision/quality", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const callSid = typeof req.body.callSid === "string" ? req.body.callSid.slice(0, 64) : "";
    const parseMetric = (value: unknown, min: number, max: number): number | null => {
      if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return null;
      return Math.round(value * 1000) / 1000;
    };
    const sample = {
      mos: parseMetric(req.body.mos, 1, 5),
      packetsLostFraction: parseMetric(req.body.packetsLostFraction, 0, 1),
      jitter: parseMetric(req.body.jitter, 0, 5000),
      rtt: parseMetric(req.body.rtt, 0, 10000),
      capturedAt: new Date().toISOString(),
    };
    if (!callSid || Object.values(sample).slice(0, 4).every((value) => value == null)) {
      res.status(400).json({ error: "A call SID and at least one valid quality metric are required" });
      return;
    }
    const [call] = await db.select().from(callHistoryTable).where(and(
      eq(callHistoryTable.userId, userId),
      eq(callHistoryTable.twilioCallSid, callSid),
      eq(callHistoryTable.callType, "pablo_internal_transfer"),
    )).limit(1);
    if (!call || call.status !== "in-progress" || call.endedAt) {
      res.status(204).send();
      return;
    }

    let previous: { samples?: unknown[] } = {};
    try {
      const parsed: unknown = call.connectionQualityJson ? JSON.parse(call.connectionQualityJson) : null;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) previous = parsed as { samples?: unknown[] };
    } catch {}
    const samples = Array.isArray(previous.samples) ? previous.samples : [];
    await db.update(callHistoryTable).set({
      connectionQualityJson: JSON.stringify({
        latest: sample,
        samples: [...samples, sample].slice(-20),
      }),
    }).where(and(
      eq(callHistoryTable.id, call.id),
      eq(callHistoryTable.userId, userId),
      eq(callHistoryTable.status, "in-progress"),
    ));
    res.status(204).send();
  } catch (err: unknown) {
    req.log.error({ err }, "Phone call quality sample failed");
    res.status(500).json({ error: "Failed to store connection quality" });
  }
});

router.post("/twilio/supervision/calls/:id/join", requireAuth, requireFeature("phone_system"), async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const orgId = await getPhoneSupervisionOrgId(userId);
    if (!orgId) {
      res.status(403).json({ error: "Organization call supervision permission required" });
      return;
    }
    const callId = Number(req.params.id);
    const mode = req.body.mode === "whisper" ? "whisper" : req.body.mode === "listen" ? "listen" : null;
    if (!Number.isInteger(callId) || callId <= 0 || !mode) {
      res.status(400).json({ error: "A valid call and supervision mode are required" });
      return;
    }
    const [call] = await db.select().from(callHistoryTable).where(and(
      eq(callHistoryTable.id, callId),
      eq(callHistoryTable.orgId, orgId),
      eq(callHistoryTable.callType, "pablo_internal_transfer"),
    )).limit(1);
    if (!call || call.status !== "in-progress" || call.endedAt || !call.twilioCallSid || !call.conferenceName) {
      res.status(409).json({ error: "This employee call is no longer active" });
      return;
    }
    if (mode === "whisper" && call.userId === userId) {
      res.status(403).json({ error: "You cannot coach your own call" });
      return;
    }

    const [supervisor] = await db.select({ email: usersTable.email })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!(await canUsePlatformTwilio(userId, supervisor?.email ?? ""))) {
      res.status(403).json({ error: "Phone access is not available for this account" });
      return;
    }
    const client = getTwilioClient();
    const conferences = await client.conferences.list({
      friendlyName: call.conferenceName,
      status: "in-progress",
      limit: 20,
    });
    const conference = conferences.find((item) => item.friendlyName === call.conferenceName);
    if (!conference) {
      res.status(409).json({ error: "The call conference is no longer active" });
      return;
    }
    const participants = await client.conferences(conference.sid).participants.list();
    const employeeParticipant = participants.find((participant) => participant.callSid === call.twilioCallSid);
    const supervisorLabel = `supervisor-${userId.slice(-32)}`;
    if (!employeeParticipant || participants.some((participant) => participant.label === supervisorLabel)) {
      res.status(409).json({ error: "The employee call is unavailable or your phone is already joining it" });
      return;
    }

    const participant = await client.conferences(conference.sid).participants.create({
      to: `client:${userId}`,
      from: await getUserOutboundNumber(userId),
      label: supervisorLabel,
      muted: mode === "listen",
      coaching: mode === "whisper",
      ...(mode === "whisper" ? { callSidToCoach: call.twilioCallSid } : {}),
      beep: "false",
      startConferenceOnEnter: true,
      endConferenceOnExit: false,
      timeout: 20,
    });
    res.status(202).json({
      ok: true,
      mode,
      status: "ringing",
      message: "Accept the incoming CALLL HOME browser call to join.",
      participantCallSid: participant.callSid,
    });
  } catch (err: unknown) {
    req.log.error({ err }, "Phone supervision participant could not be added");
    res.status(502).json({ error: "Could not connect to the live call" });
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
