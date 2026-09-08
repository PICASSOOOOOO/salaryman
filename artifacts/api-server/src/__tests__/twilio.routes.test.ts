import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

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
import type { Express } from "express";
import twilio from "twilio";
import { db, callHistoryTable, dialingSessionsTable, usersTable, phoneNumbersTable, smsConversationsTable, smsMessagesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { mockState } from "./helpers/twilioMock";
import {
  buildApp,
  resetAuthState,
  cleanupTestData,
  seedOwnedCall,
  TEST_USER,
} from "./helpers/twilioTestApp";

const spies = (twilio as any).__spies as ReturnType<
  typeof import("./helpers/twilioMock").makeTwilioMock
>["default"]["__spies"];

let app: Express;

beforeAll(() => {
  app = buildApp();
});
beforeEach(() => {
  resetAuthState();
  vi.clearAllMocks();
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
    const res = await request(app)
      .post("/api/twilio/dialing/start")
      .send({ mode, numbers: [{ phone: mode === "auto" ? "5551117777" : "5551118888", name: `${mode} lead` }] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.mode).toBe(mode);

    const stop = await request(app)
      .post(`/api/twilio/dialing/${res.body.sessionId}/stop`)
      .send();
    expect(stop.status).toBe(200);
    expect(stop.body.stoppedCalls).toBe(1);
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
    const [session] = await db
      .insert(dialingSessionsTable)
      .values({
        userId: TEST_USER.id,
        mode: "predictive",
        status: "running",
        totalNumbers: 2,
        dialedCount: 0,
        queueJson: JSON.stringify([
          { phone: "5551114001", name: "First" },
          { phone: "5551114002", name: "Second" },
        ]),
        settingsJson: JSON.stringify({ concurrency: 2 }),
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
  });
});

describe("conference rooms", () => {
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
