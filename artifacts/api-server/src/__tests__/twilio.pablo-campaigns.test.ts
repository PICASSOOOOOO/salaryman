import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";

vi.mock("twilio", async () => (await import("./helpers/twilioMock")).makeTwilioMock());
vi.mock("../lib/plan", async (importActual) => ({
  ...(await importActual<typeof import("../lib/plan")>()),
  isOwnerEmail: vi.fn(() => true),
  hasFeature: vi.fn(async () => true),
}));
vi.mock("../lib/usage-meter", async (importActual) => ({
  ...(await importActual<typeof import("../lib/usage-meter")>()),
  checkAndEnforce: vi.fn(async () => ({ allowed: true, used: 0, limit: 999999 })),
  consumeUsage: vi.fn(async () => ({ allowed: true, used: 0, limit: 999999 })),
  recordUsage: vi.fn(async () => 0),
}));
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: vi.fn(async () => ({ choices: [{ message: { content: "Got it." } }] })) } } },
}));

import request from "supertest";
import express, { type Express } from "express";
import twilio from "twilio";
import {
  callHistoryTable,
  contactChannelPrefsTable,
  contactInteractionsTable,
  contactsTable,
  crmActivitiesTable,
  db,
  leadRecordsTable,
  orgMembersTable,
  organizationsTable,
  pabloOutboundCampaignsTable,
  usersTable,
  worldBusinessesTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { mockState } from "./helpers/twilioMock";
import { consumeUsage } from "../lib/usage-meter";
import {
  authState,
  buildApp,
  cleanupTestData,
  resetAuthState,
  TEST_USER,
} from "./helpers/twilioTestApp";
import campaignsRouter from "../routes/campaigns";

vi.mock("../lib/platform-twilio-access", () => ({
  canUsePlatformTwilio: vi.fn(async () => true),
}));

const spies = (twilio as any).__spies as {
  callsCreate: ReturnType<typeof vi.fn>;
  participantCreate: ReturnType<typeof vi.fn>;
  conferenceUpdate: ReturnType<typeof vi.fn>;
};

const validScript = {
  version: 1,
  businessName: "Northstar",
  opening: "I'm calling to follow up with {{name}} at {{company}}.",
  startNodeId: "opening",
  closing: "Thank you for your time.",
  nodes: [
    {
      id: "opening",
      question: "Would you like to hear more?",
      yes: { response: "Great, I'll explain.", nextNodeId: "details" },
      no: { response: "No problem.", nextNodeId: null },
    },
    {
      id: "details",
      question: "Would you like to schedule a follow-up?",
      yes: { response: "I'll note that.", nextNodeId: null },
      no: { response: "Understood.", nextNodeId: null },
    },
  ],
};

let app: Express;
let preferencesApp: Express;
let previousElevenLabsKey: string | undefined;
let nextTestContactNumber = 1_000_000;

async function createContact(consented = true) {
  const [contact] = await db.insert(contactsTable).values({
    userId: TEST_USER.id,
    name: "Jordan Lee",
    phone: `+1555${nextTestContactNumber++}`,
    company: "Acme",
  }).returning();
  const now = new Date();
  await db.insert(contactChannelPrefsTable).values({
    userId: TEST_USER.id,
    contactId: contact.id,
    phoneCallOptIn: consented,
    phoneCallConsentedAt: consented ? now : null,
    phoneCallOptedOutAt: null,
  });
  return contact;
}

async function createCampaign(contactId: number, script: unknown = validScript) {
  const response = await request(app).post("/api/twilio/pablo/campaigns").send({
    name: "Northstar follow-up",
    script: JSON.stringify(script),
    contactIds: [contactId],
  });
  return response;
}

beforeAll(() => {
  app = buildApp();
  preferencesApp = express();
  preferencesApp.use(express.json());
  preferencesApp.use((req, _res, next) => {
    (req as any).isAuthenticated = () => authState.authed;
    (req as any).user = authState.user;
    next();
  });
  preferencesApp.use("/api", campaignsRouter);
  previousElevenLabsKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
});

beforeEach(() => {
  resetAuthState();
  vi.clearAllMocks();
  mockState.callSid = `CA${randomUUID().replace(/-/g, "")}`;
  mockState.createdCallSid = `CA${randomUUID().replace(/-/g, "")}`;
  mockState.conferenceFriendlyName = "";
  mockState.employeeCallSid = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await cleanupTestData();
  if (previousElevenLabsKey === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = previousElevenLabsKey;
});

describe("Pablo campaign consent and voice gates", () => {
  it("records contact permission timestamps and only updates the owner's saved contact", async () => {
    const contact = await createContact(false);
    const optIn = await request(preferencesApp).put(`/api/campaigns/contact-prefs/${contact.id}`)
      .send({ phoneCallOptIn: true });
    expect(optIn.status).toBe(200);
    expect(optIn.body.pref.phoneCallOptIn).toBe(true);
    expect(optIn.body.pref.phoneCallConsentedAt).toBeTruthy();
    expect(optIn.body.pref.phoneCallOptedOutAt).toBeNull();

    const optOut = await request(preferencesApp).put(`/api/campaigns/contact-prefs/${contact.id}`)
      .send({ phoneCallOptIn: false });
    expect(optOut.status).toBe(200);
    expect(optOut.body.pref.phoneCallOptIn).toBe(false);
    expect(optOut.body.pref.phoneCallConsentedAt).toBeTruthy();
    expect(optOut.body.pref.phoneCallOptedOutAt).toBeTruthy();

    const foreign = await db.insert(contactsTable).values({
      userId: `other-${TEST_USER.id}`,
      name: "Not yours",
      phone: "+15550000000",
    }).returning();
    try {
      const forbidden = await request(preferencesApp)
        .put(`/api/campaigns/contact-prefs/${foreign[0].id}`)
        .send({ phoneCallOptIn: true });
      expect(forbidden.status).toBe(404);
    } finally {
      await db.delete(contactsTable).where(eq(contactsTable.id, foreign[0].id));
    }
  });

  it("rejects contacts without recorded consent and blocks arbitrary direct dialing", async () => {
    const contact = await createContact(false);
    const pasted = await request(app).post("/api/twilio/pablo/campaigns").send({
      name: "Pasted list",
      script: JSON.stringify(validScript),
      leadsJson: JSON.stringify([{ phone: "+15559999999", name: "Not a saved contact" }]),
    });
    expect(pasted.status).toBe(400);

    const create = await createCampaign(contact.id);
    expect(create.status).toBe(400);
    expect(create.body.error).toMatch(/recorded phone-call permission/i);

    const direct = await request(app).post("/api/twilio/pablo/outbound/dial").send({
      phoneNumber: "+15551234567",
      leadName: contact.name,
    });
    expect(direct.status).toBe(403);
    expect(spies.callsCreate).not.toHaveBeenCalled();
  });

  it("calls the selected saved contact and persists a spoken stop request", async () => {
    const contact = await createContact(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "audio/mpeg" },
    })));

    const started = await request(app).post("/api/twilio/pablo/outbound/dial")
      .send({ contactId: contact.id });
    expect(started.status).toBe(200);
    expect(started.body.contactId).toBe(contact.id);
    expect(started.body.to).toBe(contact.phone);
    expect(spies.callsCreate).toHaveBeenCalledTimes(1);
    const callOptions = spies.callsCreate.mock.calls[0][0];
    expect(callOptions.to).toBe(contact.phone);
    expect(callOptions.twiml).toContain(`contactId=${contact.id}`);

    const stop = await request(app)
      .post(`/api/twilio/pablo/outbound/gather?userId=${encodeURIComponent(TEST_USER.id)}&contactId=${contact.id}`)
      .set("x-twilio-signature", "sig")
      .send({ CallSid: mockState.createdCallSid, To: contact.phone, SpeechResult: "stop" });
    expect(stop.status).toBe(200);
    expect(stop.text).toContain("<Hangup/>");

    const [preference] = await db.select().from(contactChannelPrefsTable).where(and(
      eq(contactChannelPrefsTable.userId, TEST_USER.id),
      eq(contactChannelPrefsTable.contactId, contact.id),
    ));
    expect(preference.phoneCallOptIn).toBe(false);
    expect(preference.phoneCallOptedOutAt).toBeTruthy();
  });

  it("resolves a CRM lead within the active organization and records its call activity", async () => {
    const contact = await createContact(true);
    const unique = randomUUID().slice(0, 8);
    const [organization] = await db.insert(organizationsTable).values({
      name: `Pablo Dial Test ${unique}`,
      ownerUserId: TEST_USER.id,
    }).returning();
    const [existingUser] = await db.select({ currentOrgId: usersTable.currentOrgId })
      .from(usersTable).where(eq(usersTable.id, TEST_USER.id)).limit(1);
    if (!existingUser) {
      await db.insert(usersTable).values({ id: TEST_USER.id, email: TEST_USER.email });
    }
    const previousCurrentOrgId = existingUser?.currentOrgId ?? null;
    let leadId: number | undefined;
    try {
      await db.insert(orgMembersTable).values({
        orgId: organization.id,
        userId: TEST_USER.id,
        role: "owner",
        status: "active",
      });
      await db.update(usersTable).set({ currentOrgId: String(organization.id) })
        .where(eq(usersTable.id, TEST_USER.id));
      const [lead] = await db.insert(leadRecordsTable).values({
        orgId: organization.id,
        name: "Jordan Lee — CRM lead",
        phone: contact.phone,
        createdByUserId: TEST_USER.id,
      }).returning();
      leadId = lead.id;
      vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "audio/mpeg" },
      })));

      const started = await request(app).post("/api/twilio/pablo/outbound/dial")
        .send({ leadId: lead.id });
      expect(started.status).toBe(200);
      expect(started.body.leadId).toBe(lead.id);
      expect(started.body.contactId).toBe(contact.id);
      expect(started.body.crmActivityId).toEqual(expect.any(Number));
      expect(spies.callsCreate.mock.calls[0][0].to).toBe(contact.phone);

      const completed = await request(app)
        .post(`/api/twilio/webhook/status?userId=${encodeURIComponent(TEST_USER.id)}`)
        .set("x-twilio-signature", "sig")
        .send({
          CallSid: started.body.callSid,
          CallStatus: "completed",
          CallDuration: "42",
          To: contact.phone,
          Direction: "outbound-api",
        });
      expect(completed.status).toBe(204);

      const [activity] = await db.select().from(crmActivitiesTable).where(and(
        eq(crmActivitiesTable.orgId, organization.id),
        eq(crmActivitiesTable.twilioSid, started.body.callSid),
      ));
      expect(activity?.leadId).toBe(lead.id);
      expect(activity?.contactId).toBe(contact.id);
      expect(activity?.channel).toBe("call");
      expect(activity?.status).toBe("completed");
      expect(activity?.durationSeconds).toBe(42);
    } finally {
      if (leadId) await db.delete(leadRecordsTable).where(eq(leadRecordsTable.id, leadId));
      await db.delete(crmActivitiesTable).where(eq(crmActivitiesTable.orgId, organization.id));
      await db.delete(organizationsTable).where(eq(organizationsTable.id, organization.id));
      if (existingUser) {
        await db.update(usersTable).set({ currentOrgId: previousCurrentOrgId })
          .where(eq(usersTable.id, TEST_USER.id));
      } else {
        await db.delete(usersTable).where(eq(usersTable.id, TEST_USER.id));
      }
    }
  });

  it("rechecks contact permission after Pablo voice preflight before consuming usage or dialing", async () => {
    const contact = await createContact(true);
    vi.stubGlobal("fetch", vi.fn(async () => {
      await db.update(contactChannelPrefsTable).set({
        phoneCallOptIn: false,
        phoneCallOptedOutAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(contactChannelPrefsTable.userId, TEST_USER.id),
        eq(contactChannelPrefsTable.contactId, contact.id),
      ));
      return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg" } });
    }));

    const started = await request(app).post("/api/twilio/pablo/outbound/dial")
      .send({ contactId: contact.id });
    expect(started.status).toBe(403);
    expect(started.body.error).toMatch(/permission was withdrawn/i);
    expect(consumeUsage).not.toHaveBeenCalled();
    expect(spies.callsCreate).not.toHaveBeenCalled();
  });

  it("rechecks consent at campaign start and does not dial after permission is withdrawn", async () => {
    const contact = await createContact(true);
    const create = await createCampaign(contact.id);
    expect(create.status).toBe(200);
    await db.update(contactChannelPrefsTable).set({
      phoneCallOptIn: false,
      phoneCallOptedOutAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(contactChannelPrefsTable.userId, TEST_USER.id),
      eq(contactChannelPrefsTable.contactId, contact.id),
    ));

    const start = await request(app).post(`/api/twilio/pablo/campaigns/${create.body.campaign.id}/start`);
    expect(start.status).toBe(409);
    expect(start.body.error).toMatch(/no longer has recorded phone-call permission/i);
    expect(spies.callsCreate).not.toHaveBeenCalled();
  });

  it("fails closed when ElevenLabs is unavailable before dialing", async () => {
    const contact = await createContact(true);
    const create = await createCampaign(contact.id);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("voice unavailable", { status: 401 })));

    const start = await request(app).post(`/api/twilio/pablo/campaigns/${create.body.campaign.id}/start`);
    expect(start.status).toBe(503);
    expect(start.body.code).toBe("voice_unavailable");
    expect(spies.callsCreate).not.toHaveBeenCalled();
    const [campaign] = await db.select().from(pabloOutboundCampaignsTable)
      .where(eq(pabloOutboundCampaignsTable.id, create.body.campaign.id));
    expect(campaign.status).toBe("draft");
  });

  it("rechecks consent after voice preflight before consuming usage or dialing", async () => {
    const contact = await createContact(true);
    const create = await createCampaign(contact.id);
    vi.stubGlobal("fetch", vi.fn(async () => {
      await db.update(contactChannelPrefsTable).set({
        phoneCallOptIn: false,
        phoneCallOptedOutAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(contactChannelPrefsTable.userId, TEST_USER.id),
        eq(contactChannelPrefsTable.contactId, contact.id),
      ));
      return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg" } });
    }));

    const start = await request(app).post(`/api/twilio/pablo/campaigns/${create.body.campaign.id}/start`);
    expect(start.status).toBe(200);
    expect(start.body.dialed).toBe(0);
    expect(consumeUsage).not.toHaveBeenCalled();
    expect(spies.callsCreate).not.toHaveBeenCalled();
    const [campaign] = await db.select().from(pabloOutboundCampaignsTable)
      .where(eq(pabloOutboundCampaignsTable.id, create.body.campaign.id));
    expect(campaign.status).toBe("completed");
  });

  it("dials only the consented saved contact, clarifies once, and records a spoken stop", async () => {
    const contact = await createContact(true);
    const create = await createCampaign(contact.id);
    const elevenLabsFetch = vi.fn(async (..._args: unknown[]) => new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "audio/mpeg" },
    }));
    vi.stubGlobal("fetch", elevenLabsFetch);
    const spokenTextFor = async (twiml: string) => {
      const token = twiml.match(/voice\/pablo\/([a-f0-9]+)/)?.[1];
      expect(token).toBeTruthy();
      await request(app).get(`/api/twilio/voice/pablo/${token}`);
      const options = elevenLabsFetch.mock.calls.at(-1)?.[1] as RequestInit | undefined;
      return JSON.parse(String(options?.body)).text as string;
    };

    const start = await request(app).post(`/api/twilio/pablo/campaigns/${create.body.campaign.id}/start`);
    expect(start.status).toBe(200);
    expect(start.body.dialed).toBe(1);
    const callOptions = spies.callsCreate.mock.calls[0][0];
    expect(callOptions.to).toBe(contact.phone);
    expect(callOptions.twiml).toContain("nodeId=opening");
    const greeting = await spokenTextFor(callOptions.twiml);
    expect(greeting).toContain("Would you like to hear more?");
    expect(greeting).toContain("Jordan Lee");
    expect(greeting).toContain("Acme");
    expect(greeting).not.toContain("{{name}}");

    const gatherUrl = `/api/twilio/pablo/outbound/gather?userId=${encodeURIComponent(TEST_USER.id)}&campaignId=${create.body.campaign.id}&contactId=${contact.id}&nodeId=opening&clarify=0`;
    const unclear = await request(app).post(gatherUrl)
      .set("x-twilio-signature", "sig")
      .send({ CallSid: mockState.createdCallSid, To: contact.phone, SpeechResult: "Maybe later." });
    expect(unclear.status).toBe(200);
    expect(unclear.text).toContain("<Gather");
    expect(await spokenTextFor(unclear.text)).toContain("Please answer yes or no");
    expect(await spokenTextFor(unclear.text)).toContain("Would you like to hear more?");

    const unclearAgain = await request(app).post(gatherUrl.replace("clarify=0", "clarify=1"))
      .set("x-twilio-signature", "sig")
      .send({ CallSid: mockState.createdCallSid, To: contact.phone, SpeechResult: "Maybe later." });
    expect(unclearAgain.status).toBe(200);
    expect(unclearAgain.text).not.toContain("<Gather");
    expect(await spokenTextFor(unclearAgain.text)).toContain("Thank you for your time.");

    const stop = await request(app).post(gatherUrl)
      .set("x-twilio-signature", "sig")
      .send({ CallSid: mockState.createdCallSid, To: contact.phone, SpeechResult: "Stop calling me." });
    expect(stop.status).toBe(200);
    expect(await spokenTextFor(stop.text)).toContain("remove this number from future calls");
    const [pref] = await db.select().from(contactChannelPrefsTable).where(and(
      eq(contactChannelPrefsTable.userId, TEST_USER.id),
      eq(contactChannelPrefsTable.contactId, contact.id),
    ));
    expect(pref.phoneCallOptIn).toBe(false);
    expect(pref.phoneCallOptedOutAt).toBeTruthy();
    const [history] = await db.select().from(callHistoryTable).where(eq(callHistoryTable.twilioCallSid, mockState.createdCallSid));
    expect(history.contactId).toBe(contact.id);
    expect(history.consentGiven).toBe(true);
  });

  it("requires a separate transfer yes and supports authorized, transcript-safe supervision", async () => {
    const contact = await createContact(true);
    const unique = randomUUID().slice(0, 12);
    const employeeUserId = `phone-employee-${unique}`;
    const [organization] = await db.insert(organizationsTable).values({
      name: `Phone Supervision Test ${unique}`,
      ownerUserId: TEST_USER.id,
    }).returning();
    const [existingOwner] = await db.select({ currentOrgId: usersTable.currentOrgId })
      .from(usersTable).where(eq(usersTable.id, TEST_USER.id)).limit(1);
    if (!existingOwner) {
      await db.insert(usersTable).values({ id: TEST_USER.id, email: TEST_USER.email });
    }
    const previousCurrentOrgId = existingOwner?.currentOrgId ?? null;
    await db.insert(usersTable).values({
      id: employeeUserId,
      email: `${unique}@example.test`,
      firstName: "Alex",
      lastName: "Agent",
    });
    await db.insert(worldBusinessesTable).values({
      userId: employeeUserId,
      playerName: `phone-supervision-${unique}`,
      businessType: "unemployed",
      contactEmail: `${unique}@example.test`,
      meta: { source: "browser_onboarding", contactPhone: contact.phone },
    });
    let campaignId: number | null = null;
    let customerCallSid: string | null = null;
    let transferCallSid: string | null = null;

    try {
      await db.insert(orgMembersTable).values([
        { orgId: organization.id, userId: TEST_USER.id, role: "owner", status: "active", memberType: "employee" },
        { orgId: organization.id, userId: employeeUserId, role: "specialist", status: "active", memberType: "employee" },
      ]);
      await db.update(usersTable).set({ currentOrgId: String(organization.id) })
        .where(eq(usersTable.id, TEST_USER.id));

      const transferScript = {
        ...validScript,
        nodes: [{
          id: "opening",
          question: "Would you like to hear more?",
          yes: { response: "I can connect you.", nextNodeId: null, transferToUserId: employeeUserId },
          no: { response: "Understood. Goodbye.", nextNodeId: null },
        }],
      };
      const created = await createCampaign(contact.id, transferScript);
      expect(created.status).toBe(200);
      campaignId = created.body.campaign.id;
      vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "audio/mpeg" },
      })));

      const started = await request(app).post(`/api/twilio/pablo/campaigns/${campaignId}/start`);
      expect(started.status).toBe(200);
      customerCallSid = mockState.createdCallSid;
      const gatherUrl = `/api/twilio/pablo/outbound/gather?userId=${encodeURIComponent(TEST_USER.id)}&campaignId=${campaignId}&contactId=${contact.id}&nodeId=opening&clarify=0`;
      const interestYes = await request(app).post(gatherUrl).set("x-twilio-signature", "sig")
        .send({ CallSid: customerCallSid, To: contact.phone, SpeechResult: "Yes, please." });
      expect(interestYes.status).toBe(200);
      expect(interestYes.text).toContain("transferConsent=1");
      expect(spies.callsCreate).toHaveBeenCalledTimes(1);

      const transferYes = await request(app)
        .post(`${gatherUrl}&transferConsent=1&clarify=0`)
        .set("x-twilio-signature", "sig")
        .send({ CallSid: customerCallSid, To: contact.phone, SpeechResult: "Yes." });
      expect(transferYes.status).toBe(200);
      expect(transferYes.text).toContain("<Start><Transcription");
      expect(spies.callsCreate).toHaveBeenCalledTimes(2);
      transferCallSid = mockState.createdCallSid;

      const [transferCall] = await db.select().from(callHistoryTable)
        .where(eq(callHistoryTable.twilioCallSid, transferCallSid));
      expect(transferCall?.userId).toBe(employeeUserId);
      expect(transferCall?.contactId).toBe(contact.id);
      expect(transferCall?.conferenceName).toBeTruthy();
      await db.update(callHistoryTable).set({
        status: "in-progress",
        startedAt: new Date(Date.now() - 60_000),
        transcript: "Caller asked for pricing and next steps.",
        connectionQualityJson: JSON.stringify({
          latest: { mos: 4.1, packetsLostFraction: 0.01, jitter: 22, rtt: 48, capturedAt: new Date().toISOString() },
          samples: [],
        }),
      }).where(eq(callHistoryTable.id, transferCall.id));
      mockState.conferenceFriendlyName = transferCall.conferenceName!;
      mockState.employeeCallSid = transferCallSid;

      const history = await request(app).get("/api/twilio/supervision/calls");
      expect(history.status).toBe(200);
      expect(history.body.calls).toHaveLength(1);
      expect(history.body.calls[0]).toMatchObject({
        employeeName: "Alex Agent",
        customerName: contact.name,
        customerPhoneLast4: contact.phone.slice(-4),
        active: true,
        canMonitor: true,
        connectionQuality: { mos: 4.1 },
      });
      expect(history.body.calls[0]).not.toHaveProperty("recordingUrl");
      expect(history.body.calls[0].transcript).toBe("Caller asked for pricing and next steps.");
      expect(history.body.calls[0].durationSeconds).toBeGreaterThanOrEqual(60);

      authState.user = { id: employeeUserId, email: `${unique}@example.test` };
      const quality = await request(app).post("/api/twilio/supervision/quality")
        .send({ callSid: transferCallSid, mos: 4.3, packetsLostFraction: 0.02, jitter: 19, rtt: 52 });
      expect(quality.status).toBe(204);
      const forbiddenHistory = await request(app).get("/api/twilio/supervision/calls");
      expect(forbiddenHistory.status).toBe(403);
      const forbiddenJoin = await request(app).post(`/api/twilio/supervision/calls/${transferCall.id}/join`)
        .send({ mode: "listen" });
      expect(forbiddenJoin.status).toBe(403);
      expect(spies.participantCreate).not.toHaveBeenCalled();
      authState.user = TEST_USER;

      const whisper = await request(app).post(`/api/twilio/supervision/calls/${transferCall.id}/join`)
        .send({ mode: "whisper" });
      expect(whisper.status).toBe(202);
      expect(spies.participantCreate).toHaveBeenLastCalledWith(expect.objectContaining({
        to: `client:${TEST_USER.id}`,
        coaching: true,
        callSidToCoach: transferCallSid,
        muted: false,
        endConferenceOnExit: false,
      }));
      const listen = await request(app).post(`/api/twilio/supervision/calls/${transferCall.id}/join`)
        .send({ mode: "listen" });
      expect(listen.status).toBe(202);
      expect(spies.participantCreate).toHaveBeenLastCalledWith(expect.objectContaining({
        to: `client:${TEST_USER.id}`,
        muted: true,
        coaching: false,
        endConferenceOnExit: false,
      }));

      const stopped = await request(app)
        .post(`/api/twilio/webhook/realtime-transcription?userId=${encodeURIComponent(TEST_USER.id)}&contactId=${contact.id}&orgId=${organization.id}&conferenceName=${encodeURIComponent(transferCall.conferenceName!)}`)
        .set("x-twilio-signature", "sig")
        .send({
          TranscriptionEvent: "transcription-content",
          CallSid: customerCallSid,
          TranscriptionSid: `TR${unique}`,
          Track: "inbound_track",
          SequenceId: "1",
          TranscriptionData: JSON.stringify({ transcript: "Please stop calling me." }),
        });
      expect(stopped.status).toBe(204);
      expect(spies.conferenceUpdate).toHaveBeenCalledWith({ status: "completed" });
      const [preference] = await db.select().from(contactChannelPrefsTable).where(and(
        eq(contactChannelPrefsTable.userId, TEST_USER.id),
        eq(contactChannelPrefsTable.contactId, contact.id),
      ));
      expect(preference.phoneCallOptIn).toBe(false);
      const [updatedParent] = await db.select().from(callHistoryTable)
        .where(eq(callHistoryTable.twilioCallSid, customerCallSid));
      expect(updatedParent.transcript).toContain("Caller: Please stop calling me.");
    } finally {
      authState.user = TEST_USER;
      if (campaignId) await db.delete(pabloOutboundCampaignsTable).where(eq(pabloOutboundCampaignsTable.id, campaignId));
      if (customerCallSid) await db.delete(callHistoryTable).where(eq(callHistoryTable.twilioCallSid, customerCallSid));
      if (transferCallSid) await db.delete(callHistoryTable).where(eq(callHistoryTable.twilioCallSid, transferCallSid));
      await db.delete(contactInteractionsTable).where(eq(contactInteractionsTable.contactId, contact.id));
      await db.delete(contactChannelPrefsTable).where(and(
        eq(contactChannelPrefsTable.userId, TEST_USER.id),
        eq(contactChannelPrefsTable.contactId, contact.id),
      ));
      await db.delete(contactsTable).where(eq(contactsTable.id, contact.id));
      await db.delete(organizationsTable).where(eq(organizationsTable.id, organization.id));
      await db.delete(worldBusinessesTable).where(eq(worldBusinessesTable.userId, employeeUserId));
      await db.delete(usersTable).where(eq(usersTable.id, employeeUserId));
      if (existingOwner) {
        await db.update(usersTable).set({ currentOrgId: previousCurrentOrgId })
          .where(eq(usersTable.id, TEST_USER.id));
      } else {
        await db.delete(usersTable).where(eq(usersTable.id, TEST_USER.id));
      }
    }
  });

  it("captures consented CRM details without overwriting edits made during the call", async () => {
    const contact = await createContact(true);
    const captureScript = {
      ...validScript,
      nodes: [{
        id: "opening",
        question: "Would you like to hear more?",
        yes: { response: "Thank you.", nextNodeId: null, captureField: "email" },
        no: { response: "Understood. Goodbye.", nextNodeId: null },
      }],
    };
    const create = await createCampaign(contact.id, captureScript);
    expect(create.status).toBe(200);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "audio/mpeg" },
    })));

    const firstStart = await request(app).post(`/api/twilio/pablo/campaigns/${create.body.campaign.id}/start`);
    expect(firstStart.status).toBe(200);
    const firstCallSid = mockState.createdCallSid;
    const gatherBase = `/api/twilio/pablo/outbound/gather?userId=${encodeURIComponent(TEST_USER.id)}&campaignId=${create.body.campaign.id}&contactId=${contact.id}&nodeId=opening`;
    const firstCapture = await request(app).post(`${gatherBase}&captureField=email`)
      .set("x-twilio-signature", "sig")
      .send({ CallSid: firstCallSid, To: contact.phone, SpeechResult: "jordan@example.com" });
    expect(firstCapture.status).toBe(200);
    const [updatedContact] = await db.select().from(contactsTable).where(eq(contactsTable.id, contact.id));
    expect(updatedContact.email).toBe("jordan@example.com");
    const [firstHistory] = await db.select().from(callHistoryTable)
      .where(eq(callHistoryTable.twilioCallSid, firstCallSid));
    expect(firstHistory.contactSnapshotJson).toContain('"email":""');

    const secondCampaign = await createCampaign(contact.id, captureScript);
    expect(secondCampaign.status).toBe(200);
    const secondStart = await request(app).post(`/api/twilio/pablo/campaigns/${secondCampaign.body.campaign.id}/start`);
    expect(secondStart.status).toBe(200);
    const secondCallSid = mockState.createdCallSid;
    await db.update(contactsTable).set({ email: "newer@example.com" }).where(eq(contactsTable.id, contact.id));
    const secondCaptureUrl = `/api/twilio/pablo/outbound/gather?userId=${encodeURIComponent(TEST_USER.id)}&campaignId=${secondCampaign.body.campaign.id}&contactId=${contact.id}&nodeId=opening&captureField=email`;
    const conflict = await request(app).post(secondCaptureUrl)
      .set("x-twilio-signature", "sig")
      .send({ CallSid: secondCallSid, To: contact.phone, SpeechResult: "caller@example.com" });
    expect(conflict.status).toBe(200);
    const [latestContact] = await db.select().from(contactsTable).where(eq(contactsTable.id, contact.id));
    expect(latestContact.email).toBe("newer@example.com");
    const reviews = await db.select().from(contactInteractionsTable).where(and(
      eq(contactInteractionsTable.contactId, contact.id),
      eq(contactInteractionsTable.type, "call_capture_review"),
    ));
    expect(reviews).toHaveLength(1);
    expect(reviews[0].note).toContain("caller@example.com");
  });
});