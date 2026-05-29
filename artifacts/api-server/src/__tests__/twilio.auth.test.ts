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
import * as plan from "../lib/plan";
import { buildApp, resetAuthState, authState, cleanupTestData } from "./helpers/twilioTestApp";

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

// A representative slice of the auth-protected surface (all use requireAuth +
// requireFeature). Each must reject unauthenticated requests with 401.
const PROTECTED: Array<{ method: "get" | "post" | "put" | "delete"; path: string }> = [
  { method: "get", path: "/api/twilio/system-status" },
  { method: "get", path: "/api/twilio/token" },
  { method: "post", path: "/api/twilio/call" },
  { method: "post", path: "/api/twilio/call/CAxxxx/mute" },
  { method: "post", path: "/api/twilio/call/CAxxxx/hold" },
  { method: "post", path: "/api/twilio/call/CAxxxx/transfer" },
  { method: "post", path: "/api/twilio/hangup/CAxxxx" },
  { method: "post", path: "/api/twilio/hangup-all" },
  { method: "post", path: "/api/twilio/dialing/start" },
  { method: "get", path: "/api/twilio/dialing/sessions" },
  { method: "post", path: "/api/twilio/conference/create" },
  { method: "get", path: "/api/twilio/conference/list" },
  { method: "post", path: "/api/twilio/batch-call" },
  { method: "get", path: "/api/twilio/voicemail" },
  { method: "get", path: "/api/twilio/secretary/config" },
  { method: "post", path: "/api/twilio/secretary/config" },
  { method: "get", path: "/api/twilio/phone-numbers" },
  { method: "post", path: "/api/twilio/phone-numbers" },
  { method: "get", path: "/api/twilio/call-center/agents" },
  { method: "post", path: "/api/twilio/call-center/agents" },
  { method: "get", path: "/api/twilio/contacts/u1" },
  { method: "get", path: "/api/twilio/history/u1" },
];

describe("phone auth gating", () => {
  describe("401 when unauthenticated", () => {
    it.each(PROTECTED)("$method $path -> 401", async ({ method, path }) => {
      authState.authed = false;
      const res = await request(app)[method](path).send({});
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Login required");
    });
  });

  it("returns 403 when the phone_system feature is missing", async () => {
    authState.authed = true;
    vi.mocked(plan.hasFeature).mockResolvedValueOnce(false);
    const res = await request(app).get("/api/twilio/voicemail").send();
    expect(res.status).toBe(403);
    expect(res.body.feature).toBe("phone_system");
  });

  it("returns 403 TWILIO_ORG_RESTRICTED for a non-owner outside platform orgs", async () => {
    authState.authed = true;
    // Not an owner email and (TEST_USER has) no platform-org membership.
    vi.mocked(plan.isOwnerEmail).mockReturnValueOnce(false);
    const res = await request(app).get("/api/twilio/voicemail").send();
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("TWILIO_ORG_RESTRICTED");
  });

  it("allows an authenticated subscriber through", async () => {
    authState.authed = true;
    const res = await request(app).get("/api/twilio/system-status").send();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("online");
  });
});
