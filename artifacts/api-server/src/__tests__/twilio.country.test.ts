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

// Control the user's home city (and therefore country) per test.
const cityState: { city: string | null } = { city: null };
vi.mock("../lib/phone-context", async (importActual) => {
  const actual = await importActual<typeof import("../lib/phone-context")>();
  const { countryForCity, DEFAULT_COUNTRY } = await import("../lib/phone");
  return {
    ...actual,
    resolveUserCity: vi.fn(async () => cityState.city),
    resolveUserCountry: vi.fn(async () => (cityState.city ? countryForCity(cityState.city) : DEFAULT_COUNTRY)),
  };
});

import request from "supertest";
import type { Express } from "express";
import twilio from "twilio";
import { db, phoneNumbersTable, phoneNumberPurchasesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { buildApp, resetAuthState, cleanupTestData, TEST_USER } from "./helpers/twilioTestApp";
import { getPhoneNumberCheckoutMarker, getUserOutboundNumber, provisionPaidPhoneNumber } from "../lib/phone-number-service";

let app: Express;

beforeAll(() => {
  app = buildApp();
});
beforeEach(() => {
  resetAuthState();
  vi.clearAllMocks();
  cityState.city = null;
});
afterAll(async () => {
  await cleanupTestData();
});

describe("GET /twilio/region-defaults", () => {
  it("defaults to US for a user with no home city", async () => {
    const res = await request(app).get("/api/twilio/region-defaults").send();
    expect(res.status).toBe(200);
    expect(res.body.country).toBe("US");
    expect(res.body.countries.some((c: { iso: string }) => c.iso === "VN")).toBe(true);
  });

  it("returns VN for a Huda City player", async () => {
    cityState.city = "huda_city";
    const res = await request(app).get("/api/twilio/region-defaults").send();
    expect(res.body.country).toBe("VN");
    expect(res.body.cityId).toBe("huda_city");
    expect(res.body.countryInfo.region).toBe("ASIA");
  });
});

describe("GET /twilio/regulatory", () => {
  it("flags Vietnam as requiring a bundle", async () => {
    const res = await request(app).get("/api/twilio/regulatory?country=VN").send();
    expect(res.status).toBe(200);
    expect(res.body.country).toBe("VN");
    expect(res.body.requirement.required).toBe(true);
  });

  it("uses the player's home country when none is passed", async () => {
    cityState.city = "minx_city";
    const res = await request(app).get("/api/twilio/regulatory").send();
    expect(res.body.country).toBe("US");
    expect(res.body.requirement.required).toBe(false);
  });
});

describe("GET /twilio/available-numbers", () => {
  it("searches US numbers for a Minx player", async () => {
    cityState.city = "minx_city";
    const res = await request(app).get("/api/twilio/available-numbers").send();
    expect(res.status).toBe(200);
    expect(res.body.country).toBe("US");
    expect(res.body.numbers.length).toBeGreaterThan(0);
    expect(res.body.numbers[0].phoneNumber.startsWith("+1")).toBe(true);
  });

  it("searches VN numbers for a Huda player", async () => {
    cityState.city = "huda_city";
    const res = await request(app).get("/api/twilio/available-numbers").send();
    expect(res.body.country).toBe("VN");
    expect(res.body.numbers.every((n: { phoneNumber: string }) => n.phoneNumber.startsWith("+84"))).toBe(true);
  });
});

describe("custom-number safety boundaries", () => {
  it("selects an active custom sender and falls back to the platform sender", async () => {
    const previous = process.env.TWILIO_PHONE_NUMBER;
    process.env.TWILIO_PHONE_NUMBER = "+18882307698";
    await db.delete(phoneNumbersTable).where(eq(phoneNumbersTable.userId, TEST_USER.id));
    expect(await getUserOutboundNumber(TEST_USER.id)).toBe("+18882307698");
    await db.insert(phoneNumbersTable).values({
      userId: TEST_USER.id,
      number: "+15558884444",
      label: "active",
      isActive: true,
    });
    expect(await getUserOutboundNumber(TEST_USER.id)).toBe("+15558884444");
    if (previous === undefined) delete process.env.TWILIO_PHONE_NUMBER;
    else process.env.TWILIO_PHONE_NUMBER = previous;
  });

  it("does not expose the shared Twilio account inventory", async () => {
    const res = await request(app).get("/api/twilio/phone-numbers");
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("twilioNumbers");
  });

  it("configures purchased numbers with the implemented signed callback routes", async () => {
    process.env.APP_BASE_URL = "https://phone.example";
    await db.delete(phoneNumbersTable).where(eq(phoneNumbersTable.userId, TEST_USER.id));
    const sessionId = `cs_callback_${Date.now()}`;
    await db.insert(phoneNumberPurchasesTable).values({
      userId: TEST_USER.id,
      stripeSessionId: sessionId,
      phoneNumber: "+15558881111",
      countryCode: "US",
      label: "sales",
      status: "processing",
    });
    await provisionPaidPhoneNumber({
      userId: TEST_USER.id,
      phoneNumber: "+15558881111",
      countryCode: "US",
      label: "sales",
      stripeSessionId: sessionId,
    });
    const create = (twilio as any).__spies.incomingCreate;
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      voiceUrl: `https://phone.example/api/twilio/webhook/voice?userId=${TEST_USER.id}`,
      smsUrl: `https://phone.example/api/twilio/webhook/sms?userId=${TEST_USER.id}`,
      statusCallback: `https://phone.example/api/twilio/webhook/status?userId=${TEST_USER.id}`,
    }));
    await db.delete(phoneNumberPurchasesTable).where(eq(phoneNumberPurchasesTable.stripeSessionId, sessionId));
    delete process.env.APP_BASE_URL;
  });

  it("rejects takeover of the platform default number", async () => {
    const previous = process.env.TWILIO_PHONE_NUMBER;
    process.env.TWILIO_PHONE_NUMBER = "+18882307698";
    const sessionId = `cs_default_${Date.now()}`;
    await db.insert(phoneNumberPurchasesTable).values({
      userId: TEST_USER.id,
      stripeSessionId: sessionId,
      phoneNumber: "+18882307698",
      countryCode: "US",
      status: "processing",
    });
    await expect(provisionPaidPhoneNumber({
      userId: TEST_USER.id,
      phoneNumber: "+18882307698",
      countryCode: "US",
      label: "main",
      stripeSessionId: sessionId,
    })).rejects.toThrow(/platform default/i);
    await db.delete(phoneNumberPurchasesTable).where(eq(phoneNumberPurchasesTable.stripeSessionId, sessionId));
    if (previous === undefined) delete process.env.TWILIO_PHONE_NUMBER;
    else process.env.TWILIO_PHONE_NUMBER = previous;
  });

  it("recovers only the Twilio SID already bound to the same checkout", async () => {
    const sessionId = `cs_recover_${Date.now()}`;
    await db.delete(phoneNumbersTable).where(eq(phoneNumbersTable.userId, TEST_USER.id));
    await db.insert(phoneNumberPurchasesTable).values({
      userId: TEST_USER.id,
      stripeSessionId: sessionId,
      phoneNumber: "+15558881111",
      countryCode: "US",
      status: "processing",
      twilioSid: "PNpaid",
    });
    const spies = (twilio as any).__spies;
    await provisionPaidPhoneNumber({
      userId: TEST_USER.id,
      phoneNumber: "+15558881111",
      countryCode: "US",
      label: "recovered",
      stripeSessionId: sessionId,
    });
    expect(spies.incomingFetch).toHaveBeenCalled();
    expect(spies.incomingCreate).not.toHaveBeenCalled();
    await db.delete(phoneNumberPurchasesTable).where(eq(phoneNumberPurchasesTable.stripeSessionId, sessionId));
  });

  it("reconciles the exact checkout-marked Twilio number after a create-before-persist crash", async () => {
    const sessionId = `cs_marker_recover_${Date.now()}`;
    await db.delete(phoneNumbersTable).where(eq(phoneNumbersTable.userId, TEST_USER.id));
    await db.insert(phoneNumberPurchasesTable).values({
      userId: TEST_USER.id,
      stripeSessionId: sessionId,
      phoneNumber: "+15558881111",
      countryCode: "US",
      status: "processing",
    });
    const spies = (twilio as any).__spies;
    spies.incomingList.mockResolvedValueOnce([{
      sid: "PNcrash-recovered",
      phoneNumber: "+15558881111",
      friendlyName: getPhoneNumberCheckoutMarker(sessionId),
    }]);
    const result = await provisionPaidPhoneNumber({
      userId: TEST_USER.id,
      phoneNumber: "+15558881111",
      countryCode: "US",
      label: "recovered",
      stripeSessionId: sessionId,
    });
    expect(result.sid).toBe("PNcrash-recovered");
    expect(spies.incomingCreate).not.toHaveBeenCalled();
    const [purchase] = await db.select().from(phoneNumberPurchasesTable)
      .where(eq(phoneNumberPurchasesTable.stripeSessionId, sessionId));
    expect(purchase.twilioSid).toBe("PNcrash-recovered");
    await db.delete(phoneNumberPurchasesTable).where(eq(phoneNumberPurchasesTable.stripeSessionId, sessionId));
  });

  it("never releases a legacy/unverified Twilio SID", async () => {
    const [number] = await db.insert(phoneNumbersTable).values({
      userId: TEST_USER.id,
      number: "+15558883333",
      twilioSid: "PNlegacy-unverified",
      label: "legacy",
    }).returning();
    const res = await request(app).delete(`/api/twilio/phone-numbers/${number.id}`);
    expect(res.status).toBe(200);
    expect((twilio as any).__spies.incomingRemove).not.toHaveBeenCalled();
  });
});

describe("POST /twilio/purchase-number", () => {
  it("never provisions a number before Stripe payment", async () => {
    const res = await request(app).post("/api/twilio/purchase-number").send({});
    expect(res.status).toBe(410);
    expect(res.body.error).toContain("Stripe checkout");
  });
});

describe("POST /twilio/phone-numbers", () => {
  it("rejects arbitrary existing numbers and client-controlled Twilio SIDs", async () => {
    const res = await request(app)
      .post("/api/twilio/phone-numbers")
      .send({ number: "+15558881111", twilioSid: "PNnot-owned" });
    expect(res.status).toBe(410);
    expect(res.body.error).toContain("arbitrary");
  });
});
