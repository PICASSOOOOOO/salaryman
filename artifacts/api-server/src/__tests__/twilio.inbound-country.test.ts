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

// Force the user's HOME country to the US default so the match can only succeed
// if the inbound webhook normalizes against the dialed (owning) VN number's
// persisted countryCode — not the player's home city. The owning-number
// resolver (resolveOwningNumberCountry) is intentionally NOT mocked so it reads
// the real phone_numbers row.
vi.mock("../lib/phone-context", async (importActual) => {
  const actual = await importActual<typeof import("../lib/phone-context")>();
  return {
    ...actual,
    resolveUserCity: vi.fn(async () => null),
    resolveUserCountry: vi.fn(async () => "US"),
  };
});

import request from "supertest";
import type { Express } from "express";
import { db, callHistoryTable, contactsTable, phoneNumbersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { buildApp, resetAuthState, cleanupTestData, TEST_USER } from "./helpers/twilioTestApp";

let app: Express;

// A Vietnamese line owned by the test user and the caller/contact stored in
// local VN format ("09…"). The caller dials in on the VN line.
const VN_OWNING_NUMBER = "+84912345678";
const VN_CALLER_E164 = "+84987654321";
const VN_CONTACT_LOCAL = "0987654321";

beforeAll(() => {
  app = buildApp();
});
beforeEach(async () => {
  resetAuthState();
  vi.clearAllMocks();
  await db.delete(contactsTable).where(eq(contactsTable.userId, TEST_USER.id));
  await db.delete(phoneNumbersTable).where(eq(phoneNumbersTable.userId, TEST_USER.id));
  await db.delete(callHistoryTable).where(eq(callHistoryTable.userId, TEST_USER.id));
});
afterAll(async () => {
  await db.delete(contactsTable).where(eq(contactsTable.userId, TEST_USER.id));
  await cleanupTestData();
});

describe("POST /twilio/inbound/webhook — country-aware contact matching", () => {
  it("matches a VN-stored contact for an inbound call on a VN line", async () => {
    // The dialed line is a Vietnamese number with a persisted VN countryCode.
    await db.insert(phoneNumbersTable).values({
      userId: TEST_USER.id,
      number: VN_OWNING_NUMBER,
      countryCode: "VN",
      isActive: true,
    });
    // The caller is saved as a contact in local Vietnamese format.
    const [contact] = await db
      .insert(contactsTable)
      .values({ userId: TEST_USER.id, name: "Nguyen Van A", phone: VN_CONTACT_LOCAL })
      .returning();

    const callSid = "CAvn0000000000000000000000000001";
    const res = await request(app)
      .post(`/api/twilio/inbound/webhook?userId=${TEST_USER.id}`)
      .set("x-twilio-signature", "sig")
      .send({ From: VN_CALLER_E164, To: VN_OWNING_NUMBER, CallSid: callSid });

    expect(res.status).toBe(200);

    const [row] = await db
      .select()
      .from(callHistoryTable)
      .where(and(eq(callHistoryTable.twilioCallSid, callSid), eq(callHistoryTable.userId, TEST_USER.id)));
    expect(row).toBeTruthy();
    expect(row.contactId).toBe(contact.id);
    expect(row.callerName).toBe("Nguyen Van A");
  });

  it("does not match a VN local contact when the owning line lacks VN context", async () => {
    // No VN phone-number row, so the owning-country resolver falls back to the
    // (mocked US) home country — the VN local number can't be normalized and the
    // caller stays unmatched.
    const [contact] = await db
      .insert(contactsTable)
      .values({ userId: TEST_USER.id, name: "Nguyen Van A", phone: VN_CONTACT_LOCAL })
      .returning();

    const callSid = "CAvn0000000000000000000000000002";
    const res = await request(app)
      .post(`/api/twilio/inbound/webhook?userId=${TEST_USER.id}`)
      .set("x-twilio-signature", "sig")
      .send({ From: VN_CALLER_E164, To: VN_OWNING_NUMBER, CallSid: callSid });

    expect(res.status).toBe(200);

    const [row] = await db
      .select()
      .from(callHistoryTable)
      .where(and(eq(callHistoryTable.twilioCallSid, callSid), eq(callHistoryTable.userId, TEST_USER.id)));
    expect(row).toBeTruthy();
    expect(row.contactId ?? null).toBeNull();
    expect(row.callerName ?? null).toBeNull();
    void contact;
  });
});
