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

import request from "supertest";
import type { Express } from "express";
import { db, voicemailsTable, phoneNumbersTable } from "@workspace/db";
import { buildApp, resetAuthState, cleanupTestData, TEST_USER } from "./helpers/twilioTestApp";

let app: Express;

beforeAll(() => {
  app = buildApp();
});
beforeEach(() => {
  resetAuthState();
  vi.clearAllMocks();
});
afterAll(async () => {
  await cleanupTestData();
});

describe("secretary config", () => {
  it("returns null before any config exists, then persists on POST", async () => {
    const before = await request(app).get("/api/twilio/secretary/config").send();
    expect(before.status).toBe(200);
    expect(before.body.config).toBeNull();

    const save = await request(app)
      .post("/api/twilio/secretary/config")
      .send({ isEnabled: true, personality: "friendly", greetingScript: "Hello there" });
    expect(save.status).toBe(200);
    expect(save.body.ok).toBe(true);
    expect(save.body.config.isEnabled).toBe(true);
    expect(save.body.config.personality).toBe("friendly");

    const after = await request(app).get("/api/twilio/secretary/config").send();
    expect(after.body.config.isEnabled).toBe(true);
    expect(after.body.config.greetingScript).toBe("Hello there");
  });
});

describe("phone numbers CRUD", () => {
  it("rejects arbitrary number creation", async () => {
    const res = await request(app).post("/api/twilio/phone-numbers").send({});
    expect(res.status).toBe(410);
  });

  it("lists, updates, and safely deletes a server-provisioned record", async () => {
    const [created] = await db.insert(phoneNumbersTable).values({
      userId: TEST_USER.id,
      number: "+15552223333",
      label: "work",
    }).returning();
    const id = created.id;

    const list = await request(app).get("/api/twilio/phone-numbers").send();
    expect(list.status).toBe(200);
    expect(list.body.numbers.some((n: { id: number }) => n.id === id)).toBe(true);

    const update = await request(app)
      .put(`/api/twilio/phone-numbers/${id}`)
      .send({ label: "home" });
    expect(update.status).toBe(200);
    expect(update.body.phoneNumber.label).toBe("home");

    const del = await request(app).delete(`/api/twilio/phone-numbers/${id}`).send();
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);
  });
});

describe("call-center agents CRUD", () => {
  it("400 without name or phone", async () => {
    const res = await request(app).post("/api/twilio/call-center/agents").send({ name: "Joe" });
    expect(res.status).toBe(400);
  });

  it("create, toggle, list, delete", async () => {
    const create = await request(app)
      .post("/api/twilio/call-center/agents")
      .send({ name: "Joe", phone: "5554445555" });
    expect(create.status).toBe(200);
    expect(create.body.agent.phone).toBe("+15554445555");
    const id = create.body.agent.id as number;
    const initialActive = create.body.agent.isActive as boolean;

    const toggle = await request(app)
      .post(`/api/twilio/call-center/agents/${id}/toggle`)
      .send();
    expect(toggle.status).toBe(200);
    expect(toggle.body.agent.isActive).toBe(!initialActive);

    const list = await request(app).get("/api/twilio/call-center/agents").send();
    expect(list.body.agents.some((a: { id: number }) => a.id === id)).toBe(true);

    const del = await request(app).delete(`/api/twilio/call-center/agents/${id}`).send();
    expect(del.status).toBe(200);
  });

  it("toggle: 404 for an unknown agent", async () => {
    const res = await request(app)
      .post("/api/twilio/call-center/agents/99999999/toggle")
      .send();
    expect(res.status).toBe(404);
  });
});

describe("read endpoints", () => {
  it("contacts returns a contacts array + total", async () => {
    const res = await request(app).get(`/api/twilio/contacts/${TEST_USER.id}`).send();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.contacts)).toBe(true);
    expect(typeof res.body.total).toBe("number");
  });

  it("history returns a calls array", async () => {
    const res = await request(app).get(`/api/twilio/history/${TEST_USER.id}`).send();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.calls)).toBe(true);
  });
});

describe("voicemail", () => {
  it("lists, marks read, and deletes", async () => {
    const [vm] = await db
      .insert(voicemailsTable)
      .values({
        userId: TEST_USER.id,
        fromNumber: "+15550001111",
        recordingUrl: "https://example.test/vm.mp3",
        isRead: false,
      })
      .returning();

    const list = await request(app).get("/api/twilio/voicemail").send();
    expect(list.status).toBe(200);
    expect(list.body.voicemails.some((v: { id: number }) => v.id === vm.id)).toBe(true);
    expect(list.body.unread).toBeGreaterThanOrEqual(1);

    const read = await request(app).post(`/api/twilio/voicemail/${vm.id}/read`).send();
    expect(read.status).toBe(200);
    expect(read.body.ok).toBe(true);

    const del = await request(app).delete(`/api/twilio/voicemail/${vm.id}`).send();
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);
  });
});
