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
import { db, phoneNumbersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { buildApp, resetAuthState, cleanupTestData, TEST_USER } from "./helpers/twilioTestApp";

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

describe("POST /twilio/purchase-number", () => {
  it("400 without a phoneNumber", async () => {
    const res = await request(app).post("/api/twilio/purchase-number").send({});
    expect(res.status).toBe(400);
  });

  it("buys a US number and persists country/city/region", async () => {
    cityState.city = "minx_city";
    const res = await request(app)
      .post("/api/twilio/purchase-number")
      .send({ phoneNumber: "+15558881111", label: "sales" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.phoneNumber.countryCode).toBe("US");
    expect(res.body.phoneNumber.cityId).toBe("minx_city");
    expect(res.body.phoneNumber.region).toBe("AMERICAS — NORTH");

    const [row] = await db
      .select()
      .from(phoneNumbersTable)
      .where(eq(phoneNumbersTable.id, res.body.phoneNumber.id));
    expect(row.countryCode).toBe("US");
    expect(row.twilioSid).toBeTruthy();
  });

  it("blocks a Vietnam purchase with no regulatory bundle configured", async () => {
    cityState.city = "huda_city";
    const prev = process.env.TWILIO_REGULATORY_BUNDLE_SID;
    delete process.env.TWILIO_REGULATORY_BUNDLE_SID;
    const res = await request(app)
      .post("/api/twilio/purchase-number")
      .send({ phoneNumber: "+84912345678" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("regulatory_bundle_required");
    expect(res.body.requirement.required).toBe(true);
    if (prev !== undefined) process.env.TWILIO_REGULATORY_BUNDLE_SID = prev;
  });
});

describe("POST /twilio/phone-numbers — country context", () => {
  it("stamps a Huda player's manually-added number with VN context", async () => {
    cityState.city = "huda_city";
    const res = await request(app)
      .post("/api/twilio/phone-numbers")
      .send({ number: "0912345678", label: "hotline" });
    expect(res.status).toBe(200);
    expect(res.body.phoneNumber.number).toBe("+84912345678");
    expect(res.body.phoneNumber.countryCode).toBe("VN");
    expect(res.body.phoneNumber.region).toBe("ASIA");
  });
});
