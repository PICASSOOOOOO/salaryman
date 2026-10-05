import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const objectStorageMocks = vi.hoisted(() => ({
  deleteObject: vi.fn(async () => true),
  getObjectEntityFile: vi.fn(async () => ({
    download: vi.fn(async () => [Buffer.from("recording")]),
  })),
}));

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
vi.mock("@workspace/integrations-openai-ai-server/audio", () => ({
  speechToText: vi.fn(async () => "The caller requested a proposal and agreed to receive the follow-up by Friday."),
}));
vi.mock("../lib/objectStorage", () => {
  class MockObjectStorageService {
    deleteObject = objectStorageMocks.deleteObject;
    getObjectEntityFile = objectStorageMocks.getObjectEntityFile;
  }
  return { ObjectStorageService: MockObjectStorageService };
});

import request from "supertest";
import type { Express } from "express";
import twilio from "twilio";
import { speechToText } from "@workspace/integrations-openai-ai-server/audio";
import { db, callHistoryTable, dialingSessionsTable, usersTable, phoneNumbersTable, smsConversationsTable, smsMessagesTable, conferenceRoomsTable, contactsTable, contactChannelPrefsTable, contactInteractionsTable, systemConfigTable, sharedMediaTable, worldBusinessesTable } from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { mockState } from "./helpers/twilioMock";
import { checkAndEnforce, recordUsage } from "../lib/usage-meter";
import { runRecordingRetentionSweep } from "../lib/recording-retention";
import {
  buildApp,
  authState,
  resetAuthState,
  cleanupTestData,
  seedOwnedCall,
  TEST_USER,
} from "./helpers/twilioTestApp";

const spies = (twilio as any).__spies as ReturnType<
  typeof import("./helpers/twilioMock").makeTwilioMock
>["default"]["__spies"];

let app: Express;
let nextDialContactNumber = 1;

async function createDialContact(phone: string) {
  const [contact] = await db.insert(contactsTable).values({
    userId: TEST_USER.id,
    name: `Dial target ${nextDialContactNumber++}`,
    phone,
  }).returning();
  await db.insert(contactChannelPrefsTable).values({
    userId: TEST_USER.id,
    contactId: contact.id,
    phoneCallOptIn: true,
    phoneCallConsentedAt: new Date(),
    phoneCallOptedOutAt: null,
  });
  return contact;
}

beforeAll(() => {
  app = buildApp();
});
beforeEach(async () => {
  resetAuthState();
  vi.clearAllMocks();
  await db.delete(systemConfigTable).where(eq(systemConfigTable.key, `phone_recording_user_${TEST_USER.id}`));
  mockState.callSid = "CAtest00000000000000000000000000000";
  mockState.conferenceGroupSid = "CFgroup0000000000000000000000000000";
});
afterAll(async () => {
  await cleanupTestData();
});

describe("POST /twilio/call", () => {
  it("400 when recipientNumber is missing", async () => {
    const res = await request(app).post("/api/twilio/call").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/recipientNumber/);
  });

  it("400 when the number is unparseable", async () => {
    const res = await request(app).post("/api/twilio/call").send({ recipientNumber: "abc" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid phone number/);
  });

  it("200 places a call, normalizes to E.164, and records history", async () => {
    const res = await request(app)
      .post("/api/twilio/call")
      .send({ recipientNumber: "5551234567", contactName: "Jane" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.callSid).toBe(mockState.createdCallSid);
    expect(res.body.to).toBe("+15551234567");
    expect(res.body.conferenceName).toMatch(/^conf-/);
    expect(spies.callsCreate).toHaveBeenCalledTimes(1);
    expect(checkAndEnforce).toHaveBeenCalledTimes(1);
    expect(recordUsage).not.toHaveBeenCalled();
    const rows = await db
      .select()
      .from(callHistoryTable)
      .where(
        and(
          eq(callHistoryTable.userId, TEST_USER.id),
          eq(callHistoryTable.twilioCallSid, mockState.createdCallSid),
        ),
      );
    expect(rows.length).toBe(1);
    expect(rows[0].recipientNumber).toBe("+15551234567");
    expect(rows[0].direction).toBe("outbound");
    const createArgs = spies.callsCreate.mock.calls[0][0] as { twiml: string };
    expect(createArgs.twiml).not.toContain("This call may be recorded");
    expect(createArgs.twiml).not.toContain("<Say");
    expect(createArgs.twiml).toContain('record="record-from-start"');
  });
});

describe("browser Voice bridge", () => {
  it("returns exact conference TwiML for a valid browser destination", async () => {
    const res = await request(app)
      .post("/api/twilio/twiml/client-voice")
      .query({ To: "conf-user-123", From: "client:user" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/xml/);
    expect(res.text).toBe('<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">conf-user-123</Conference></Dial></Response>');
  });

  it("rejects a non-conference browser destination without dialing", async () => {
    const res = await request(app)
      .post("/api/twilio/twiml/client-voice")
      .query({ To: "+15551234567", From: "client:user" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("Unable to connect");
    expect(res.text).not.toContain("<Conference");
  });

  it("does not let one browser identity join another user's conference", async () => {
    const res = await request(app)
      .post("/api/twilio/twiml/client-voice")
      .query({ To: "conf-victim-123", From: "client:attacker" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("Unable to connect");
    expect(res.text).not.toContain("<Conference");
  });
});

describe("call control (mute / hold / transfer)", () => {
  it("mute: 403 when the call is not owned", async () => {
    const res = await request(app)
      .post("/api/twilio/call/CAnotownedxxxxxxxxxxxxxxxxxxxx/mute")
      .send({ muted: true });
    expect(res.status).toBe(403);
  });

  it("mute: 200 mutes a participant in the conference", async () => {
    const sid = "CAmute0000000000000000000000000001";
    await seedOwnedCall(sid);
    mockState.callSid = sid;
    const res = await request(app).post(`/api/twilio/call/${sid}/mute`).send({ muted: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, muted: true });
    expect(spies.participantUpdate).toHaveBeenCalledWith({ muted: true });
  });

  it("hold: 200 holds a participant", async () => {
    const sid = "CAhold0000000000000000000000000001";
    await seedOwnedCall(sid);
    mockState.callSid = sid;
    const res = await request(app).post(`/api/twilio/call/${sid}/hold`).send({ hold: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, onHold: true });
    expect(spies.participantUpdate).toHaveBeenCalled();
  });

  it("transfer: 400 when transferTo is missing", async () => {
    const sid = "CAxfer0000000000000000000000000001";
    await seedOwnedCall(sid);
    const res = await request(app).post(`/api/twilio/call/${sid}/transfer`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/transferTo/);
  });

  it("transfer: 400 when transferTo is invalid", async () => {
    const sid = "CAxfer0000000000000000000000000002";
    await seedOwnedCall(sid);
    const res = await request(app)
      .post(`/api/twilio/call/${sid}/transfer`)
      .send({ transferTo: "xyz" });
    expect(res.status).toBe(400);
  });

  it("transfer: 200 redirects the call to a new number", async () => {
    const sid = "CAxfer0000000000000000000000000003";
    await seedOwnedCall(sid);
    const res = await request(app)
      .post(`/api/twilio/call/${sid}/transfer`)
      .send({ transferTo: "5559998888" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, transferredTo: "+15559998888" });
    expect(spies.callUpdate).toHaveBeenCalled();
    const updateArgs = spies.callUpdate.mock.calls.at(-1)?.[0] as { twiml: string };
    expect(updateArgs.twiml).toContain('record="record-from-answer"');
    expect(updateArgs.twiml).toContain("recordingStatusCallback=");
    expect(updateArgs.twiml).toContain("<Number>");
    expect(updateArgs.twiml).not.toContain("recording-notice");
    expect(updateArgs.twiml).not.toContain("<Say");
  });

  it("does not record a transferred call when the user's recording setting is off", async () => {
    const sid = "CAxfer0000000000000000000000000004";
    await seedOwnedCall(sid);
    const preference = await request(app)
      .put("/api/twilio/recording-preferences")
      .send({ scope: "user", enabled: false });
    expect(preference.status).toBe(200);

    const res = await request(app)
      .post(`/api/twilio/call/${sid}/transfer`)
      .send({ transferTo: "5559998888" });
    expect(res.status).toBe(200);
    const updateArgs = spies.callUpdate.mock.calls.at(-1)?.[0] as { twiml: string };
    expect(updateArgs.twiml).not.toContain("record=");
    expect(updateArgs.twiml).not.toContain("recordingStatusCallback=");
    expect(updateArgs.twiml).not.toContain("<Say");
  });
});

describe("recording preferences and archive scope", () => {
  it("defaults to enabled, persists the personal opt-out, and blocks org scope without an org", async () => {
    const initial = await request(app).get("/api/twilio/recording-preferences");
    expect(initial.status).toBe(200);
    expect(initial.body).toMatchObject({
      userCallsEnabled: true,
      organizationCallsEnabled: null,
      effectiveCallsEnabled: true,
      canManageOrganization: false,
    });

    const saved = await request(app)
      .put("/api/twilio/recording-preferences")
      .send({ scope: "user", enabled: false });
    expect(saved.status).toBe(200);

    const updated = await request(app).get("/api/twilio/recording-preferences");
    expect(updated.body.userCallsEnabled).toBe(false);
    expect(updated.body.effectiveCallsEnabled).toBe(false);

    const organizationUpdate = await request(app)
      .put("/api/twilio/recording-preferences")
      .send({ scope: "organization", enabled: false });
    expect(organizationUpdate.status).toBe(403);

    const organizationArchive = await request(app)
      .get(`/api/twilio/history/${TEST_USER.id}?scope=organization`);
    expect(organizationArchive.status).toBe(403);
    expect(authState.user.id).toBe(TEST_USER.id);
  });
});

describe("recording access", () => {
  it("keeps personal audio private until an explicit recording share is created", async () => {
    const [call] = await db.insert(callHistoryTable).values({
      userId: TEST_USER.id,
      recipientNumber: "+15551234567",
      status: "completed",
      direction: "outbound",
      recordingUrl: "/objects/private/test-call.mp3",
    }).returning();

    const recipientId = `test-recording-recipient-${TEST_USER.id}`;
    await db.insert(worldBusinessesTable).values({
      userId: recipientId,
      playerName: recipientId.slice(0, 32),
      businessType: "unemployed",
      contactEmail: `${recipientId}@example.test`,
      meta: { source: "browser_onboarding", contactPhone: "+15550002222" },
    });
    try {
      authState.user = { id: recipientId, email: `${recipientId}@example.test` };
      const denied = await request(app).get(`/api/twilio/recording/${call.id}`);
      expect(denied.status).toBe(403);

      await db.insert(sharedMediaTable).values({
        fromUserId: TEST_USER.id,
        toUserId: recipientId,
        mediaType: "recording",
        title: "Call recording",
        callHistoryId: call.id,
      });
      const shared = await request(app).get(`/api/twilio/recording/${call.id}`);
      expect(shared.status, JSON.stringify(shared.body)).toBe(200);
      expect(shared.headers["content-type"]).toMatch(/audio\/mpeg/);
      expect(shared.headers["cache-control"]).toContain("private");
    } finally {
      await db.delete(worldBusinessesTable).where(eq(worldBusinessesTable.userId, recipientId));
    }
  });
});

describe("hangup", () => {
  it("403 when the call is not owned", async () => {
    const res = await request(app)
      .post("/api/twilio/hangup/CAnotownedxxxxxxxxxxxxxxxxxxxx")
      .send();
    expect(res.status).toBe(403);
  });

  it("200 completes an owned call", async () => {
    const sid = "CAhang0000000000000000000000000001";
    await seedOwnedCall(sid);
    const res = await request(app).post(`/api/twilio/hangup/${sid}`).send();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, status: "completed" });
    expect(spies.callUpdate).toHaveBeenCalledWith({ status: "completed" });
  });

  it("hangup-all: 400 without a callSids array", async () => {
    const res = await request(app).post("/api/twilio/hangup-all").send({});
    expect(res.status).toBe(400);
  });

  it("hangup-all: 200 with owned sids", async () => {
    const sid = "CAhang0000000000000000000000000002";
    await seedOwnedCall(sid);
    const res = await request(app).post("/api/twilio/hangup-all").send({ callSids: [sid] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("hangup-all: rejects the entire cleanup request if any sid is not owned", async () => {
    const sid = "CAhang0000000000000000000000000003";
    await seedOwnedCall(sid);
    const res = await request(app)
      .post("/api/twilio/hangup-all")
      .send({ callSids: [sid, "CAnotownedxxxxxxxxxxxxxxxxxxxx"] });
    expect(res.status).toBe(403);
    expect(spies.callUpdate).not.toHaveBeenCalled();
  });
});

describe("dialing sessions", () => {
  it.each(["auto", "predictive"] as const)("keeps %s dialing available", async (mode) => {
    const contact = await createDialContact(mode === "auto" ? "+15551117777" : "+15551118888");
    const res = await request(app)
      .post("/api/twilio/dialing/start")
      .send({ mode, contactIds: [contact.id] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.mode).toBe(mode);

    const stop = await request(app)
      .post(`/api/twilio/dialing/${res.body.sessionId}/stop`)
      .send();
    expect(stop.status).toBe(200);
    expect(stop.body.stoppedCalls).toBe(1);
  });

  it.each(["auto", "predictive"] as const)("rejects %s dialing from pasted phone numbers", async (mode) => {
    const res = await request(app)
      .post("/api/twilio/dialing/start")
      .send({ mode, numbers: [{ phone: "+15551112222", name: "Not a saved contact" }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/saved contact IDs/i);
    expect(spies.callsCreate).not.toHaveBeenCalled();
  });

  it("rejects automatic dialing when a saved contact has no active recorded permission", async () => {
    const contact = await createDialContact("+15551112223");
    await db.update(contactChannelPrefsTable).set({
      phoneCallOptIn: false,
      phoneCallOptedOutAt: new Date(),
    }).where(and(
      eq(contactChannelPrefsTable.userId, TEST_USER.id),
      eq(contactChannelPrefsTable.contactId, contact.id),
    ));
    const res = await request(app)
      .post("/api/twilio/dialing/start")
      .send({ mode: "auto", contactIds: [contact.id] });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/recorded phone-call permission/i);
    expect(spies.callsCreate).not.toHaveBeenCalled();
  });

  it("does not allow an automatic queue to use another user's saved contact", async () => {
    const [foreignContact] = await db.insert(contactsTable).values({
      userId: `other-${TEST_USER.id}`,
      name: "Foreign dial target",
      phone: "+15551112224",
    }).returning();
    try {
      const res = await request(app)
        .post("/api/twilio/dialing/start")
        .send({ mode: "auto", contactIds: [foreignContact.id] });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/your saved contacts/i);
      expect(spies.callsCreate).not.toHaveBeenCalled();
    } finally {
      await db.delete(contactsTable).where(eq(contactsTable.id, foreignContact.id));
    }
  });

  it("start: 400 on a bad mode", async () => {
    const res = await request(app)
      .post("/api/twilio/dialing/start")
      .send({ mode: "nonsense", numbers: [{ phone: "5551112222" }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mode must be/);
  });

  it("start: 400 on empty numbers", async () => {
    const res = await request(app)
      .post("/api/twilio/dialing/start")
      .send({ mode: "power", numbers: [] });
    expect(res.status).toBe(400);
  });

  it("start: 200 creates a running session and dials", async () => {
    const res = await request(app)
      .post("/api/twilio/dialing/start")
      .send({ mode: "power", numbers: [{ phone: "5551112222", name: "Lead" }] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.mode).toBe("power");
    expect(res.body.calls[0].ok).toBe(true);
    expect(typeof res.body.sessionId).toBe("number");
    const [history] = await db.select().from(callHistoryTable)
      .where(eq(callHistoryTable.twilioCallSid, res.body.calls[0].callSid));
    expect(history.consentGiven).toBe(false);

    // stop the session we just created
    const stop = await request(app)
      .post(`/api/twilio/dialing/${res.body.sessionId}/stop`)
      .send();
    expect(stop.status).toBe(200);
    expect(stop.body.stoppedCalls).toBe(1);
    expect(spies.callUpdate).toHaveBeenCalledWith({ status: "completed" });
    const [session] = await db
      .select()
      .from(dialingSessionsTable)
      .where(eq(dialingSessionsTable.id, res.body.sessionId));
    expect(session.status).toBe("stopped");
  });

  it("start: normalizes local numbers with the explicitly selected country", async () => {
    const res = await request(app)
      .post("/api/twilio/dialing/start")
      .send({ mode: "power", countryCode: "VN", numbers: [{ phone: "0912345678", name: "VN lead" }] });
    expect(res.status).toBe(200);
    expect(spies.callsCreate).toHaveBeenCalledWith(expect.objectContaining({ to: "+84912345678" }));
    const [session] = await db.select().from(dialingSessionsTable)
      .where(eq(dialingSessionsTable.id, res.body.sessionId));
    expect(JSON.parse(session.queueJson ?? "[]")[0].phone).toBe("+84912345678");
    await request(app).post(`/api/twilio/dialing/${res.body.sessionId}/stop`).send();
  });

  it("next: dials the next queued number", async () => {
    const [session] = await db
      .insert(dialingSessionsTable)
      .values({
        userId: TEST_USER.id,
        mode: "power",
        status: "running",
        totalNumbers: 1,
        dialedCount: 0,
        queueJson: JSON.stringify([{ phone: "5551113333", name: "Next" }]),
        settingsJson: "{}",
      })
      .returning();
    const res = await request(app)
      .post(`/api/twilio/dialing/${session.id}/next`)
      .send();
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.phone).toBe("+15551113333");
  });

  it("next: concurrent requests atomically claim different queue positions", async () => {
    const firstContact = await createDialContact("+15551114001");
    const secondContact = await createDialContact("+15551114002");
    const [session] = await db
      .insert(dialingSessionsTable)
      .values({
        userId: TEST_USER.id,
        mode: "predictive",
        status: "running",
        totalNumbers: 2,
        dialedCount: 0,
        queueJson: JSON.stringify([
          { phone: firstContact.phone, name: firstContact.name, contactId: firstContact.id, consentGiven: true },
          { phone: secondContact.phone, name: secondContact.name, contactId: secondContact.id, consentGiven: true },
        ]),
        settingsJson: JSON.stringify({ concurrency: 2, countryCode: "US" }),
      })
      .returning();
    const [first, second] = await Promise.all([
      request(app).post(`/api/twilio/dialing/${session.id}/next`).send(),
      request(app).post(`/api/twilio/dialing/${session.id}/next`).send(),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(new Set([first.body.phone, second.body.phone])).toEqual(
      new Set(["+15551114001", "+15551114002"]),
    );
    const [updated] = await db.select().from(dialingSessionsTable)
      .where(eq(dialingSessionsTable.id, session.id));
    expect(updated.dialedCount).toBe(2);
  });

  it("stops the automatic queue when a later contact withdraws permission", async () => {
    const firstContact = await createDialContact("+15551114101");
    const secondContact = await createDialContact("+15551114102");
    const started = await request(app).post("/api/twilio/dialing/start").send({
      mode: "auto",
      contactIds: [firstContact.id, secondContact.id],
    });
    expect(started.status).toBe(200);
    expect(spies.callsCreate).toHaveBeenCalledTimes(1);

    await db.update(contactChannelPrefsTable).set({
      phoneCallOptIn: false,
      phoneCallOptedOutAt: new Date(),
    }).where(and(
      eq(contactChannelPrefsTable.userId, TEST_USER.id),
      eq(contactChannelPrefsTable.contactId, secondContact.id),
    ));
    const next = await request(app).post(`/api/twilio/dialing/${started.body.sessionId}/next`).send();
    expect(next.status).toBe(409);
    expect(next.body.paused).toBe(true);
    expect(next.body.error).toMatch(/permission is no longer active/i);
    expect(spies.callsCreate).toHaveBeenCalledTimes(1);
    const [session] = await db.select().from(dialingSessionsTable)
      .where(eq(dialingSessionsTable.id, started.body.sessionId));
    expect(session.status).toBe("stopped");
  });

  it("pauses after an unconfirmed call failure instead of retrying or advancing", async () => {
    const firstContact = await createDialContact("+15551114201");
    const secondContact = await createDialContact("+15551114202");
    const started = await request(app).post("/api/twilio/dialing/start").send({
      mode: "auto",
      contactIds: [firstContact.id, secondContact.id],
    });
    expect(started.status).toBe(200);
    expect(spies.callsCreate).toHaveBeenCalledTimes(1);

    spies.callsCreate.mockRejectedValueOnce(new Error("Twilio request timed out"));
    const failed = await request(app).post(`/api/twilio/dialing/${started.body.sessionId}/next`).send();
    expect(failed.status).toBe(503);
    expect(failed.body.paused).toBe(true);
    expect(failed.body.error).toMatch(/review call history before restarting/i);
    expect(spies.callsCreate).toHaveBeenCalledTimes(2);

    const repeated = await request(app).post(`/api/twilio/dialing/${started.body.sessionId}/next`).send();
    expect(repeated.status).toBe(409);
    expect(repeated.body.paused).toBe(true);
    expect(spies.callsCreate).toHaveBeenCalledTimes(2);
    const [session] = await db.select().from(dialingSessionsTable)
      .where(eq(dialingSessionsTable.id, started.body.sessionId));
    expect(session.status).toBe("stopped");
  });

  it("sessions: lists the user's sessions", async () => {
    const res = await request(app).get("/api/twilio/dialing/sessions").send();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
  });
});

describe("batch-call", () => {
  it("400 without a numbers array", async () => {
    const res = await request(app).post("/api/twilio/batch-call").send({});
    expect(res.status).toBe(400);
  });

  it("200 dials a batch and reports per-number results", async () => {
    const res = await request(app)
      .post("/api/twilio/batch-call")
      .send({ numbers: [{ phone: "5551114444", name: "A" }] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.total).toBe(1);
    expect(res.body.succeeded).toBe(1);
    expect(res.body.calls[0].ok).toBe(true);
    expect(res.body.calls[0].phone).toBe("+15551114444");
    const createArgs = spies.callsCreate.mock.calls[0][0] as { twiml: string };
    expect(createArgs.twiml).not.toContain("This call may be recorded");
    expect(createArgs.twiml).toContain('record="record-from-start"');
  });
});

describe("conference rooms", () => {
  it("end: denies an outsider before invoking Twilio", async () => {
    const roomName = "CalllHome-outsider-end";
    await db.insert(conferenceRoomsTable).values({
      userId: "conference-room-owner",
      roomName,
      status: "active",
      participantsJson: "[]",
    });
    try {
      const res = await request(app).post(`/api/twilio/conference/${roomName}/end`).send();
      expect(res.status).toBe(403);
      expect(spies.conferencesList).not.toHaveBeenCalled();
      expect(spies.conferenceUpdate).not.toHaveBeenCalled();
    } finally {
      await db.delete(conferenceRoomsTable).where(eq(conferenceRoomsTable.roomName, roomName));
    }
  });

  it("create -> add -> list -> end lifecycle", async () => {
    const create = await request(app)
      .post("/api/twilio/conference/create")
      .send({ label: "Standup" });
    expect(create.status).toBe(200);
    expect(create.body.ok).toBe(true);
    const roomName = create.body.roomName as string;
    expect(roomName).toBeTruthy();

    const addBad = await request(app)
      .post(`/api/twilio/conference/${roomName}/add`)
      .send({});
    expect(addBad.status).toBe(400);

    const add = await request(app)
      .post(`/api/twilio/conference/${roomName}/add`)
      .send({ phoneNumber: "5551115555", name: "Bob" });
    expect(add.status).toBe(200);
    expect(add.body.ok).toBe(true);
    expect(add.body.phone).toBe("+15551115555");
    const callArgs = spies.callsCreate.mock.calls[0][0] as { twiml: string };
    expect(callArgs.twiml).not.toContain("This call may be recorded");
    expect(callArgs.twiml).toContain('record="record-from-start"');

    const list = await request(app).get("/api/twilio/conference/list").send();
    expect(list.status).toBe(200);
    expect(list.body.rooms.some((r: { roomName: string }) => r.roomName === roomName)).toBe(true);

    const end = await request(app)
      .post(`/api/twilio/conference/${roomName}/end`)
      .send();
    expect(end.status).toBe(200);
    expect(end.body.ok).toBe(true);
  });

  it("add: 403 when the room is not owned", async () => {
    const res = await request(app)
      .post("/api/twilio/conference/CalllHome-someone-else/add")
      .send({ phoneNumber: "5551116666" });
    expect(res.status).toBe(403);
  });
});

describe("call control fallback (no existing conference)", () => {
  it("mute moves a solo call into a conference instead of failing", async () => {
    const sid = "CAmutefb00000000000000000000000001";
    await seedOwnedCall(sid);
    mockState.callSid = sid;
    mockState.conferenceGroupSid = ""; // no existing conference -> fallback path
    const res = await request(app).post(`/api/twilio/call/${sid}/mute`).send({ muted: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, muted: true });
    expect(spies.callUpdate).toHaveBeenCalled();
    expect(spies.conferencesList).toHaveBeenCalled();
  });

  it("hold moves a solo call into a music conference instead of failing", async () => {
    const sid = "CAholdfb00000000000000000000000001";
    await seedOwnedCall(sid);
    mockState.callSid = sid;
    mockState.conferenceGroupSid = ""; // no existing conference -> fallback path
    const res = await request(app).post(`/api/twilio/call/${sid}/hold`).send({ hold: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, onHold: true });
    expect(spies.callUpdate).toHaveBeenCalled();
  });
});

describe("webhook/status", () => {
  it("403 when the Twilio signature header is absent", async () => {
    const res = await request(app)
      .post("/api/twilio/webhook/status")
      .send({ CallSid: "CAx", CallStatus: "completed" });
    expect(res.status).toBe(403);
  });

  it("400 when required params are missing (valid signature)", async () => {
    const res = await request(app)
      .post("/api/twilio/webhook/status")
      .set("x-twilio-signature", "sig")
      .send({});
    expect(res.status).toBe(400);
  });

  it("204 and persists terminal status + duration for a known call", async () => {
    const sid = "CAwh00000000000000000000000000001";
    await seedOwnedCall(sid);
    const res = await request(app)
      .post("/api/twilio/webhook/status")
      .set("x-twilio-signature", "sig")
      .send({ CallSid: sid, CallStatus: "completed", CallDuration: "30" });
    expect(res.status).toBe(204);
    const [row] = await db
      .select()
      .from(callHistoryTable)
      .where(eq(callHistoryTable.twilioCallSid, sid));
    expect(row.status).toBe("completed");
    expect(row.durationSeconds).toBe(30);
    expect(row.endedAt).toBeTruthy();
  });

  it("recovers an outbound history row when its status callback arrives first", async () => {
    const sid = "CAstatus-first-outbound-00000000000001";
    const sendStatus = () => request(app)
      .post(`/api/twilio/webhook/status?userId=${encodeURIComponent(TEST_USER.id)}&callType=batch`)
      .set("x-twilio-signature", "sig")
      .send({
        CallSid: sid,
        CallStatus: "completed",
        CallDuration: "18",
        Direction: "outbound-api",
        From: "+15550001111",
        To: "+15550002222",
      });
    const responses = await Promise.all([sendStatus(), sendStatus()]);
    expect(responses.map((res) => res.status)).toEqual([204, 204]);
    const rows = await db.select().from(callHistoryTable)
      .where(eq(callHistoryTable.twilioCallSid, sid));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: TEST_USER.id,
      recipientNumber: "+15550002222",
      direction: "outbound",
      callType: "batch",
      status: "completed",
      durationSeconds: 18,
      consentGiven: false,
    });
    expect(rows[0].endedAt).toBeTruthy();
  });

  it("does not let an out-of-order ringing callback replace a completed call", async () => {
    const sid = "CAstatus-ordering-0000000000000001";
    await seedOwnedCall(sid);
    for (const CallStatus of ["completed", "ringing"]) {
      const res = await request(app)
        .post("/api/twilio/webhook/status")
        .set("x-twilio-signature", "sig")
        .send({ CallSid: sid, CallStatus, CallDuration: CallStatus === "completed" ? "27" : undefined });
      expect(res.status).toBe(204);
    }
    const [row] = await db.select().from(callHistoryTable)
      .where(eq(callHistoryTable.twilioCallSid, sid));
    expect(row.status).toBe("completed");
    expect(row.durationSeconds).toBe(27);
  });
});

describe("webhook/recording-notice", () => {
  it("keeps the legacy callback silent and rejects invalid Twilio callbacks", async () => {
    const rejected = await request(app).post("/api/twilio/webhook/recording-notice").send({});
    expect(rejected.status).toBe(403);

    const accepted = await request(app)
      .post("/api/twilio/webhook/recording-notice")
      .set("x-twilio-signature", "sig")
      .send({});
    expect(accepted.status).toBe(200);
    expect(accepted.headers["content-type"]).toMatch(/xml/);
    expect(accepted.text).toBe("<Response/>");
    expect(accepted.text).not.toContain("recorded");
  });
});

describe("webhook/recording", () => {
  it("archives, transcribes, summarizes, and safely handles callback retries", async () => {
    const sid = "CArecording-callback-000000000000001";
    const recordingSid = "REcallhistory000000000000000000001";
    await seedOwnedCall(sid, "+15551234567");
    const payload = {
      RecordingSid: recordingSid,
      RecordingUrl: "https://api.twilio.com/2010-04-01/Accounts/ACtest/Recordings/REcallhistory",
      RecordingStatus: "completed",
      RecordingDuration: "42",
      CallSid: sid,
      Direction: "outbound-api",
      From: "+15550001111",
      To: "+15551234567",
      CallStatus: "completed",
    };

    const first = await request(app)
      .post(`/api/twilio/webhook/recording?userId=${encodeURIComponent(TEST_USER.id)}&type=call&callType=conference`)
      .set("x-twilio-signature", "sig")
      .send(payload);
    const repeated = await request(app)
      .post(`/api/twilio/webhook/recording?userId=${encodeURIComponent(TEST_USER.id)}&type=call&callType=conference`)
      .set("x-twilio-signature", "sig")
      .send(payload);

    expect(first.status).toBe(204);
    expect(repeated.status).toBe(204);
    expect(speechToText).toHaveBeenCalledTimes(1);
    const rows = await db.select().from(callHistoryTable)
      .where(eq(callHistoryTable.twilioCallSid, sid));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recordingSid,
      recordingUrl: `${payload.RecordingUrl}.mp3`,
      durationSeconds: 42,
      transcript: "The caller requested a proposal and agreed to receive the follow-up by Friday.",
      summary: "Got it.",
    });
    expect(rows[0].recordingRetainUntil).toBeInstanceOf(Date);
  });

  it("matches conference recordings by conference name when Twilio omits CallSid", async () => {
    const sid = "CAconference-recording-no-sid-00000001";
    const conferenceName = "conference-recording-no-sid";
    await seedOwnedCall(sid, "+15551234567");
    await db.update(callHistoryTable)
      .set({ conferenceName, callType: "conference" })
      .where(eq(callHistoryTable.twilioCallSid, sid));

    const res = await request(app)
      .post(
        `/api/twilio/webhook/recording?userId=${encodeURIComponent(TEST_USER.id)}&type=call&callType=conference&conferenceName=${encodeURIComponent(conferenceName)}`,
      )
      .set("x-twilio-signature", "sig")
      .send({
        RecordingSid: "REconference-no-sid-000000000000001",
        RecordingUrl: "https://api.twilio.com/2010-04-01/Accounts/ACtest/Recordings/REconference-no-sid",
        RecordingStatus: "completed",
        RecordingDuration: "36",
        Direction: "outbound-api",
        From: "+15550001111",
        To: "+15551234567",
        CallStatus: "completed",
      });

    expect(res.status).toBe(204);
    const [row] = await db.select().from(callHistoryTable)
      .where(eq(callHistoryTable.twilioCallSid, sid));
    expect(row.recordingSid).toBe("REconference-no-sid-000000000000001");
    expect(row.recordingUrl).toContain("REconference-no-sid.mp3");
    expect(row.durationSeconds).toBe(36);
    expect(row.transcript).toBe("The caller requested a proposal and agreed to receive the follow-up by Friday.");
    expect(row.summary).toBe("Got it.");
  });
});

describe("recording retention", () => {
  it("deletes shared conference audio once, after every call record expires", async () => {
    objectStorageMocks.deleteObject.mockClear().mockResolvedValue(true);
    const startedAt = new Date("2020-01-01T00:00:00.000Z");
    const recordingUrl = "/objects/shared-conference-recording";
    const rows = await db.insert(callHistoryTable).values([
      {
        userId: TEST_USER.id,
        recipientNumber: "+15551230001",
        twilioCallSid: "CAsharedrecording00000000000000001",
        status: "completed",
        direction: "outbound",
        callType: "conference",
        recordingUrl,
        recordingSid: "REsharedconference00000000000000001",
        consentGiven: true,
        startedAt,
      },
      {
        userId: TEST_USER.id,
        recipientNumber: "+15551230002",
        twilioCallSid: "CAsharedrecording00000000000000002",
        status: "completed",
        direction: "outbound",
        callType: "conference",
        recordingUrl,
        recordingSid: "REsharedconference00000000000000001",
        consentGiven: true,
        startedAt,
      },
    ]).returning();

    const result = await runRecordingRetentionSweep(new Date("2026-10-02T00:00:00.000Z"));

    expect(result.deleted).toBe(1);
    expect(objectStorageMocks.deleteObject).toHaveBeenCalledTimes(1);
    expect(objectStorageMocks.deleteObject).toHaveBeenCalledWith(recordingUrl);
    const afterSweep = await db.select().from(callHistoryTable)
      .where(inArray(callHistoryTable.id, rows.map((row) => row.id)));
    expect(afterSweep).toHaveLength(2);
    expect(afterSweep.every((row) => row.recordingUrl === null && row.recordingSid === null)).toBe(true);
  });
});

describe("webhook destination ownership", () => {
  const attributionUserId = "phone_owner_attribution_user";

  it("uses the active destination owner instead of a conflicting callback user hint", async () => {
    const destination = "+15550001111";
    const sid = "CAowner-resolution-00000000000000001";
    await db.insert(phoneNumbersTable).values({
      userId: attributionUserId,
      number: destination,
      isActive: true,
    });

    try {
      const res = await request(app)
        .post(`/api/twilio/webhook/voice?userId=${encodeURIComponent(TEST_USER.id)}`)
        .set("x-twilio-signature", "sig")
        .send({
          From: "+15550002222",
          To: destination,
          CallSid: sid,
        });
      expect(res.status).toBe(200);

      const [row] = await db
        .select()
        .from(callHistoryTable)
        .where(eq(callHistoryTable.twilioCallSid, sid));
      expect(row.userId).toBe(attributionUserId);
      expect(row.userId).not.toBe(TEST_USER.id);
      expect(res.text).not.toContain("This call may be recorded");
      expect(res.text).toContain("<Start><Recording");
    } finally {
      await db.delete(callHistoryTable).where(eq(callHistoryTable.twilioCallSid, sid));
      await db.delete(phoneNumbersTable).where(eq(phoneNumbersTable.number, destination));
    }
  });
});

describe("webhook/sms shared-number reply routing", () => {
  const defaultDid = "+18882307698";
  const contactPhone = "+15557778888";
  const otherUserId = "phone_sms_ambiguity_user";

  beforeEach(async () => {
    process.env.TWILIO_PHONE_NUMBER = defaultDid;
    await db.delete(smsMessagesTable).where(eq(smsMessagesTable.toPhone, contactPhone));
    await db.delete(smsConversationsTable).where(eq(smsConversationsTable.contactPhone, contactPhone));
    const staleContacts = await db.select({ id: contactsTable.id }).from(contactsTable).where(and(
      eq(contactsTable.userId, TEST_USER.id),
      eq(contactsTable.phone, contactPhone),
    ));
    for (const contact of staleContacts) {
      await db.delete(contactInteractionsTable).where(and(
        eq(contactInteractionsTable.userId, TEST_USER.id),
        eq(contactInteractionsTable.contactId, contact.id),
      ));
      await db.delete(contactChannelPrefsTable).where(and(
        eq(contactChannelPrefsTable.userId, TEST_USER.id),
        eq(contactChannelPrefsTable.contactId, contact.id),
      ));
      await db.delete(contactsTable).where(eq(contactsTable.id, contact.id));
    }
    await db.insert(usersTable).values({ id: otherUserId, email: "sms-ambiguity@example.invalid" }).onConflictDoNothing();
  });

  it("associates a signed reply with the sole recent fallback sender", async () => {
    const [conversation] = await db.insert(smsConversationsTable).values({
      userId: TEST_USER.id, contactPhone, contactName: "Recipient",
    }).returning();
    await db.insert(smsMessagesTable).values({
      conversationId: conversation.id, userId: TEST_USER.id, direction: "outbound",
      body: "Hello", fromPhone: defaultDid, toPhone: contactPhone, status: "sent",
    });
    const res = await request(app).post("/api/twilio/webhook/sms")
      .set("x-twilio-signature", "sig")
      .send({ From: contactPhone, To: defaultDid, Body: "Reply", MessageSid: "SMinbound-default-1" });
    expect(res.status).toBe(200);
    const inbound = await db.select().from(smsMessagesTable)
      .where(and(eq(smsMessagesTable.twilioMessageSid, "SMinbound-default-1"), eq(smsMessagesTable.userId, TEST_USER.id)));
    expect(inbound).toHaveLength(1);
  });

  it("processes a repeated Twilio MessageSid only once", async () => {
    const [conversation] = await db.insert(smsConversationsTable).values({
      userId: TEST_USER.id, contactPhone, contactName: "Recipient",
    }).returning();
    await db.insert(smsMessagesTable).values({
      conversationId: conversation.id, userId: TEST_USER.id, direction: "outbound",
      body: "Hello", fromPhone: defaultDid, toPhone: contactPhone, status: "sent",
    });
    const payload = { From: contactPhone, To: defaultDid, Body: "One reply", MessageSid: "SMinbound-idempotent-1" };
    const first = await request(app).post("/api/twilio/webhook/sms")
      .set("x-twilio-signature", "sig").send(payload);
    const repeated = await request(app).post("/api/twilio/webhook/sms")
      .set("x-twilio-signature", "sig").send(payload);
    expect(first.status).toBe(200);
    expect(repeated.status).toBe(200);
    const inbound = await db.select().from(smsMessagesTable)
      .where(eq(smsMessagesTable.twilioMessageSid, payload.MessageSid));
    expect(inbound).toHaveLength(1);
    const [updated] = await db.select().from(smsConversationsTable)
      .where(eq(smsConversationsTable.id, conversation.id));
    expect(updated.unreadCount).toBe(1);
  });

  it("persists SMS STOP and does not generate an assistant reply", async () => {
    const [conversation] = await db.insert(smsConversationsTable).values({
      userId: TEST_USER.id, contactPhone, contactName: "Recipient",
    }).returning();
    await db.insert(smsMessagesTable).values({
      conversationId: conversation.id, userId: TEST_USER.id, direction: "outbound",
      body: "Hello", fromPhone: defaultDid, toPhone: contactPhone, status: "sent",
    });
    const res = await request(app).post("/api/twilio/webhook/sms")
      .set("x-twilio-signature", "sig")
      .send({ From: contactPhone, To: defaultDid, Body: "STOP", MessageSid: "SMinbound-stop-1" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("<Response></Response>");
    expect(spies.messagesCreate).not.toHaveBeenCalled();

    const [contact] = await db.select().from(contactsTable).where(and(
      eq(contactsTable.userId, TEST_USER.id),
      eq(contactsTable.phone, contactPhone),
    ));
    expect(contact).toBeDefined();
    const [preference] = await db.select().from(contactChannelPrefsTable).where(and(
      eq(contactChannelPrefsTable.userId, TEST_USER.id),
      eq(contactChannelPrefsTable.contactId, contact.id),
    )).orderBy(desc(contactChannelPrefsTable.updatedAt));
    expect(preference.smsOptIn).toBe(false);
    expect(preference.smsOptedOutAt).toBeInstanceOf(Date);

    const rejoin = await request(app).post("/api/twilio/webhook/sms")
      .set("x-twilio-signature", "sig")
      .send({ From: contactPhone, To: defaultDid, Body: "START", MessageSid: "SMinbound-start-1" });
    expect(rejoin.status).toBe(200);
    expect(rejoin.text).toContain("<Response></Response>");
    expect(spies.messagesCreate).not.toHaveBeenCalled();
    const [rejoinedPreference] = await db.select().from(contactChannelPrefsTable).where(and(
      eq(contactChannelPrefsTable.userId, TEST_USER.id),
      eq(contactChannelPrefsTable.contactId, contact.id),
    )).orderBy(desc(contactChannelPrefsTable.updatedAt));
    expect(rejoinedPreference.smsOptIn).toBe(true);
    expect(rejoinedPreference.smsOptedOutAt).toBeNull();
  });

  it("fails closed when two users recently messaged the same recipient from the shared number", async () => {
    for (const userId of [TEST_USER.id, otherUserId]) {
      const [conversation] = await db.insert(smsConversationsTable).values({
        userId, contactPhone, contactName: "Recipient",
      }).returning();
      await db.insert(smsMessagesTable).values({
        conversationId: conversation.id, userId, direction: "outbound",
        body: "Hello", fromPhone: defaultDid, toPhone: contactPhone, status: "sent",
      });
    }
    const res = await request(app).post("/api/twilio/webhook/sms")
      .set("x-twilio-signature", "sig")
      .send({ From: contactPhone, To: defaultDid, Body: "Reply", MessageSid: "SMinbound-ambiguous-1" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("<Response></Response>");
    const inbound = await db.select().from(smsMessagesTable)
      .where(eq(smsMessagesTable.twilioMessageSid, "SMinbound-ambiguous-1"));
    expect(inbound).toHaveLength(0);
  });
});

describe("token", () => {
  it("issues a voice access token for the user", async () => {
    const res = await request(app).get("/api/twilio/token").send();
    expect(res.status).toBe(200);
    expect(res.body.token).toBe("FAKE.JWT.TOKEN");
    expect(res.body.identity).toBe(TEST_USER.id);
  });
});
