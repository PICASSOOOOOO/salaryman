import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

// Shared mock handles, created before the vi.mock factories run (hoisted).
const mocks = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  resendSend: vi.fn(),
  ownerEmails: vi.fn((): string[] => []),
  isOwnerEmail: vi.fn(() => true),
}));

// Admin gate + the email recipient fallback both live in ../lib/plan. We mock
// isOwnerEmail (admin gate) and ownerEmails (the always-available email channel)
// so each test fully controls auth and which channels count as "configured".
vi.mock("../lib/plan", async (importActual) => ({
  ...(await importActual<typeof import("../lib/plan")>()),
  isOwnerEmail: mocks.isOwnerEmail,
  ownerEmails: mocks.ownerEmails,
}));

// No real network for the Discord webhook POST.
vi.mock("../lib/safe-fetch", async (importActual) => ({
  ...(await importActual<typeof import("../lib/safe-fetch")>()),
  safeFetch: mocks.safeFetch,
}));

// No real email — hand back a fake Resend client whose send() we can assert on.
vi.mock("../lib/resend", () => ({
  getUncachableResendClient: vi.fn(async () => ({
    client: { emails: { send: mocks.resendSend } },
    fromEmail: "alerts@salaryman.test",
  })),
}));

import request from "supertest";
import type { Express } from "express";
import { buildApp, resetAuthState, authState, cleanupTestData } from "./helpers/artTestApp";
import { __resetIncidentDedup } from "../lib/incident-channel";

const VALID_WEBHOOK = "https://discord.com/api/webhooks/123/abc";
const REPORT = "BACKEND DOWNTIME REPORT\nfal: OFFLINE since 12:00\nnano: ONLINE";

let app: Express;

// Env we stomp on per-test so channel configuration is fully deterministic.
const savedEnv = {
  incident: process.env.INCIDENT_DISCORD_WEBHOOK_URL,
  discord: process.env.DISCORD_WEBHOOK_URL,
  alertEmail: process.env.ART_BACKEND_ALERT_EMAIL,
};

beforeAll(() => {
  app = buildApp();
});

beforeEach(() => {
  resetAuthState();
  vi.clearAllMocks();
  // Each test starts with an empty dedup window so reusing REPORT doesn't 409.
  __resetIncidentDedup();
  // Defaults: admin caller, no channels configured (no webhook, no recipients).
  mocks.isOwnerEmail.mockReturnValue(true);
  mocks.ownerEmails.mockReturnValue([]);
  mocks.safeFetch.mockResolvedValue({ ok: true, status: 200 } as any);
  mocks.resendSend.mockResolvedValue({ id: "email_1" } as any);
  delete process.env.INCIDENT_DISCORD_WEBHOOK_URL;
  delete process.env.DISCORD_WEBHOOK_URL;
  delete process.env.ART_BACKEND_ALERT_EMAIL;
});

afterAll(async () => {
  for (const [k, v] of Object.entries({
    INCIDENT_DISCORD_WEBHOOK_URL: savedEnv.incident,
    DISCORD_WEBHOOK_URL: savedEnv.discord,
    ART_BACKEND_ALERT_EMAIL: savedEnv.alertEmail,
  })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await cleanupTestData();
});

describe("POST /api/art/incident-report", () => {
  it("403 when the caller is not an admin", async () => {
    authState.user = { id: "nobody", email: "not-owner@example.test" };
    mocks.isOwnerEmail.mockReturnValue(false);
    const res = await request(app).post("/api/art/incident-report").send({ text: REPORT });
    expect(res.status).toBe(403);
    // Gate trips before any delivery is attempted.
    expect(mocks.safeFetch).not.toHaveBeenCalled();
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it("400 when the report text is missing or empty", async () => {
    const empty = await request(app).post("/api/art/incident-report").send({});
    expect(empty.status).toBe(400);

    const blank = await request(app).post("/api/art/incident-report").send({ text: "   " });
    expect(blank.status).toBe(400);

    expect(mocks.safeFetch).not.toHaveBeenCalled();
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it("413 when the report exceeds the size cap", async () => {
    const huge = "x".repeat(20_001);
    const res = await request(app).post("/api/art/incident-report").send({ text: huge });
    expect(res.status).toBe(413);
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });

  it("503 when no incident channel is configured", async () => {
    // No webhook env and ownerEmails() empty -> neither channel configured.
    const res = await request(app).post("/api/art/incident-report").send({ text: REPORT });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/No incident channel configured/i);
    expect(mocks.safeFetch).not.toHaveBeenCalled();
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it("200 and POSTs the EXACT report text to the configured Discord webhook", async () => {
    process.env.INCIDENT_DISCORD_WEBHOOK_URL = VALID_WEBHOOK;
    // Email channel stays off (no recipients) so this isolates Discord.
    const res = await request(app).post("/api/art/incident-report").send({ text: REPORT });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.delivered).toEqual(["discord"]);
    expect(res.body.skipped).toEqual(["email"]);
    expect(res.body.failed).toEqual([]);

    // Exactly one webhook POST, to the configured URL.
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mocks.safeFetch.mock.calls[0];
    expect(url).toBe(VALID_WEBHOOK);
    expect(opts.method).toBe("POST");
    // The body carries the exact report text inside a Discord code fence.
    const body = JSON.parse(opts.body);
    expect(body.content).toBe("```\n" + REPORT + "\n```");
    expect(body.content).toContain(REPORT);

    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it("falls back to DISCORD_WEBHOOK_URL when the incident-specific var is unset", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/9/z";
    const res = await request(app).post("/api/art/incident-report").send({ text: REPORT });
    expect(res.status).toBe(200);
    expect(res.body.delivered).toEqual(["discord"]);
    expect(mocks.safeFetch.mock.calls[0][0]).toBe("https://discord.com/api/webhooks/9/z");
  });

  it("emails the EXACT report text to the configured recipients", async () => {
    process.env.ART_BACKEND_ALERT_EMAIL = "oncall@salaryman.test";
    // No Discord webhook -> email is the only channel.
    const res = await request(app).post("/api/art/incident-report").send({ text: REPORT });

    expect(res.status).toBe(200);
    expect(res.body.delivered).toEqual(["email"]);
    expect(res.body.skipped).toEqual(["discord"]);

    expect(mocks.resendSend).toHaveBeenCalledTimes(1);
    const payload = mocks.resendSend.mock.calls[0][0];
    expect(payload.to).toEqual(["oncall@salaryman.test"]);
    // The plain-text part is the report verbatim.
    expect(payload.text).toBe(REPORT);
    // And the subject is derived from the report's first line.
    expect(payload.subject).toContain("BACKEND DOWNTIME REPORT");

    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });

  it("delivers to BOTH channels when both are configured", async () => {
    process.env.INCIDENT_DISCORD_WEBHOOK_URL = VALID_WEBHOOK;
    process.env.ART_BACKEND_ALERT_EMAIL = "oncall@salaryman.test";
    const res = await request(app).post("/api/art/incident-report").send({ text: REPORT });

    expect(res.status).toBe(200);
    expect(res.body.delivered.sort()).toEqual(["discord", "email"]);
    expect(res.body.skipped).toEqual([]);
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
    expect(mocks.resendSend).toHaveBeenCalledTimes(1);
  });

  it("200 (partial) when one channel delivers and the other fails", async () => {
    process.env.INCIDENT_DISCORD_WEBHOOK_URL = VALID_WEBHOOK;
    process.env.ART_BACKEND_ALERT_EMAIL = "oncall@salaryman.test";
    // Discord succeeds, email blows up.
    mocks.resendSend.mockRejectedValue(new Error("resend down"));

    const res = await request(app).post("/api/art/incident-report").send({ text: REPORT });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.delivered).toEqual(["discord"]);
    expect(res.body.failed).toEqual(["email"]);
    expect(res.body.skipped).toEqual([]);
  });

  it("502 when every configured channel fails to deliver", async () => {
    process.env.INCIDENT_DISCORD_WEBHOOK_URL = VALID_WEBHOOK;
    process.env.ART_BACKEND_ALERT_EMAIL = "oncall@salaryman.test";
    mocks.safeFetch.mockResolvedValue({ ok: false, status: 500 } as any);
    mocks.resendSend.mockRejectedValue(new Error("resend down"));

    const res = await request(app).post("/api/art/incident-report").send({ text: REPORT });
    expect(res.status).toBe(502);
    expect(res.body.delivered).toEqual([]);
    expect(res.body.failed.sort()).toEqual(["discord", "email"]);
  });

  it("409 (deduped) on a rapid repeat of the same report — no second broadcast", async () => {
    process.env.INCIDENT_DISCORD_WEBHOOK_URL = VALID_WEBHOOK;

    // First send goes out and broadcasts once.
    const first = await request(app).post("/api/art/incident-report").send({ text: REPORT });
    expect(first.status).toBe(200);
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);

    // Immediate repeat of the identical report is coalesced, not re-broadcast.
    const second = await request(app).post("/api/art/incident-report").send({ text: REPORT });
    expect(second.status).toBe(409);
    expect(second.body.deduped).toBe(true);
    expect(second.body.error).toMatch(/already sent moments ago/i);
    expect(typeof second.body.sentAgoMs).toBe("number");
    // Still exactly one webhook POST in total — the duplicate sent nothing.
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });

  it("dedupes the duplicate BEFORE checking channel config (idempotent reject)", async () => {
    process.env.INCIDENT_DISCORD_WEBHOOK_URL = VALID_WEBHOOK;
    const first = await request(app).post("/api/art/incident-report").send({ text: REPORT });
    expect(first.status).toBe(200);

    // A different report text is NOT deduped — it broadcasts on its own.
    const other = await request(app)
      .post("/api/art/incident-report")
      .send({ text: REPORT + "\nextra: line" });
    expect(other.status).toBe(200);
    expect(mocks.safeFetch).toHaveBeenCalledTimes(2);
  });

  it("does NOT dedupe a different backend's report sent right after", async () => {
    process.env.INCIDENT_DISCORD_WEBHOOK_URL = VALID_WEBHOOK;
    // Backend A's single-backend history dump goes out.
    const a = await request(app)
      .post("/api/art/incident-report")
      .send({ text: "fal\nOFFLINE · 12:00" });
    expect(a.status).toBe(200);
    // Backend B's history (distinct content) must NOT be suppressed as a dup.
    const b = await request(app)
      .post("/api/art/incident-report")
      .send({ text: "nano-banana\nONLINE · 12:01" });
    expect(b.status).toBe(200);
    expect(mocks.safeFetch).toHaveBeenCalledTimes(2);
  });

  it("does NOT dedupe the SAME report aimed at a different channel", async () => {
    process.env.INCIDENT_DISCORD_WEBHOOK_URL = VALID_WEBHOOK;
    mocks.ownerEmails.mockReturnValue(["oncall@salaryman.test"]);

    // Same report text, but targeted Discord-only first…
    const discordOnly = await request(app)
      .post("/api/art/incident-report")
      .send({ text: REPORT, channels: ["discord"] });
    expect(discordOnly.status).toBe(200);
    expect(discordOnly.body.delivered).toEqual(["discord"]);

    // …then email-only: a different destination, so it must still deliver.
    const emailOnly = await request(app)
      .post("/api/art/incident-report")
      .send({ text: REPORT, channels: ["email"] });
    expect(emailOnly.status).toBe(200);
    expect(emailOnly.body.delivered).toEqual(["email"]);
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
    expect(mocks.resendSend).toHaveBeenCalledTimes(1);
  });

  it("still dedupes an identical report aimed at the SAME channel", async () => {
    process.env.INCIDENT_DISCORD_WEBHOOK_URL = VALID_WEBHOOK;
    const first = await request(app)
      .post("/api/art/incident-report")
      .send({ text: REPORT, channels: ["discord"] });
    expect(first.status).toBe(200);

    const repeat = await request(app)
      .post("/api/art/incident-report")
      .send({ text: REPORT, channels: ["discord"] });
    expect(repeat.status).toBe(409);
    expect(repeat.body.deduped).toBe(true);
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });

  it("treats single-backend (no filter) and all-backends-to-all as the same target", async () => {
    process.env.INCIDENT_DISCORD_WEBHOOK_URL = VALID_WEBHOOK;
    mocks.ownerEmails.mockReturnValue(["oncall@salaryman.test"]);

    // No channels filter == all channels; the picker sending the same text to
    // every channel must resolve to the same dedup key, so the second is a dup.
    const noFilter = await request(app).post("/api/art/incident-report").send({ text: REPORT });
    expect(noFilter.status).toBe(200);

    const allChannels = await request(app)
      .post("/api/art/incident-report")
      .send({ text: REPORT, channels: ["email", "discord"] });
    expect(allChannels.status).toBe(409);
    expect(allChannels.body.deduped).toBe(true);
  });

  it("does NOT block a retry after a total delivery failure", async () => {
    process.env.INCIDENT_DISCORD_WEBHOOK_URL = VALID_WEBHOOK;
    // First attempt fails entirely -> claim released so a retry can go out.
    mocks.safeFetch.mockResolvedValueOnce({ ok: false, status: 500 } as any);
    const failed = await request(app).post("/api/art/incident-report").send({ text: REPORT });
    expect(failed.status).toBe(502);

    // Retry of the same report succeeds (not blocked by the dedup window).
    mocks.safeFetch.mockResolvedValue({ ok: true, status: 200 } as any);
    const retry = await request(app).post("/api/art/incident-report").send({ text: REPORT });
    expect(retry.status).toBe(200);
    expect(retry.body.delivered).toEqual(["discord"]);
  });
});

// The channel picker lets an admin restrict the broadcast (e.g. Discord only).
// These cases lock in that the route honours body.channels: it only sends to the
// chosen, configured channels; rejects an empty/garbage selection; and still 503s
// when the *selected* channel has no destination configured. Both env channels
// are configured throughout so any omission proves filtering, not config gaps.
describe("POST /api/art/incident-report — channel picker", () => {
  beforeEach(() => {
    // Configure BOTH channels so a missing send is the filter's doing, not config.
    process.env.INCIDENT_DISCORD_WEBHOOK_URL = VALID_WEBHOOK;
    process.env.ART_BACKEND_ALERT_EMAIL = "oncall@salaryman.test";
  });

  it("no filter -> defaults to ALL configured channels", async () => {
    const res = await request(app).post("/api/art/incident-report").send({ text: REPORT });
    expect(res.status).toBe(200);
    expect(res.body.delivered.sort()).toEqual(["discord", "email"]);
    expect(res.body.skipped).toEqual([]);
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
    expect(mocks.resendSend).toHaveBeenCalledTimes(1);
  });

  it('["discord"] -> only Discord is contacted, email left out entirely', async () => {
    const res = await request(app)
      .post("/api/art/incident-report")
      .send({ text: REPORT, channels: ["discord"] });
    expect(res.status).toBe(200);
    expect(res.body.delivered).toEqual(["discord"]);
    // Email wasn't selected, so it appears in NO bucket (not even skipped).
    expect(res.body.skipped).toEqual([]);
    expect(res.body.failed).toEqual([]);
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it('["email"] -> only email is contacted, Discord left out entirely', async () => {
    const res = await request(app)
      .post("/api/art/incident-report")
      .send({ text: REPORT, channels: ["email"] });
    expect(res.status).toBe(200);
    expect(res.body.delivered).toEqual(["email"]);
    expect(res.body.skipped).toEqual([]);
    expect(res.body.failed).toEqual([]);
    expect(mocks.resendSend).toHaveBeenCalledTimes(1);
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });

  it("de-duplicates a repeated channel in the selection", async () => {
    const res = await request(app)
      .post("/api/art/incident-report")
      .send({ text: REPORT, channels: ["discord", "discord"] });
    expect(res.status).toBe(200);
    expect(res.body.delivered).toEqual(["discord"]);
    // One webhook POST despite the duplicate entry; email untouched.
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it("ignores a garbage entry but still sends to the valid one", async () => {
    const res = await request(app)
      .post("/api/art/incident-report")
      .send({ text: REPORT, channels: ["discord", "bogus"] });
    expect(res.status).toBe(200);
    expect(res.body.delivered).toEqual(["discord"]);
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it("[] (present but empty) -> 400, nothing sent", async () => {
    const res = await request(app)
      .post("/api/art/incident-report")
      .send({ text: REPORT, channels: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No valid channels selected/i);
    expect(mocks.safeFetch).not.toHaveBeenCalled();
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it('["bogus"] (all garbage) -> 400, nothing sent', async () => {
    const res = await request(app)
      .post("/api/art/incident-report")
      .send({ text: REPORT, channels: ["bogus", "sms"] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No valid channels selected/i);
    expect(mocks.safeFetch).not.toHaveBeenCalled();
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it("non-array channels -> 400, nothing sent", async () => {
    const res = await request(app)
      .post("/api/art/incident-report")
      .send({ text: REPORT, channels: "discord" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/channels must be an array/i);
    expect(mocks.safeFetch).not.toHaveBeenCalled();
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it("503 when the SELECTED channel has no destination configured", async () => {
    // Discord is configured, but the admin picked email-only — and email has no
    // recipients here (clear the env recipients). Guarding on the SELECTED channel
    // means this 503s instead of silently delivering to the unselected Discord.
    delete process.env.ART_BACKEND_ALERT_EMAIL;
    mocks.ownerEmails.mockReturnValue([]);
    const res = await request(app)
      .post("/api/art/incident-report")
      .send({ text: REPORT, channels: ["email"] });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/No incident channel configured/i);
    // Discord stays untouched even though it WAS configured — it wasn't selected.
    expect(mocks.safeFetch).not.toHaveBeenCalled();
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });
});
