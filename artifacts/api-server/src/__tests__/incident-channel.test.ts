import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Stub the two outbound transports so delivery tests never hit the network: a
// Discord webhook POST (safeFetch) and the Resend email client.
const safeFetchMock = vi.fn(async (..._args: any[]) => ({ ok: true, status: 200 }) as any);
const emailSendMock = vi.fn(async (..._args: any[]) => ({}));
vi.mock("../lib/safe-fetch", () => ({ safeFetch: (...a: any[]) => safeFetchMock(...a) }));
vi.mock("../lib/resend", () => ({
  getUncachableResendClient: async () => ({
    client: { emails: { send: (...a: any[]) => emailSendMock(...a) } },
    fromEmail: "alerts@example.test",
  }),
}));

import {
  splitForDiscord,
  resolveIncidentWebhookUrl,
  resolveIncidentRecipients,
  incidentChannelsConfigured,
  deliverIncidentReport,
  ALL_INCIDENT_CHANNELS,
} from "../lib/incident-channel";

describe("splitForDiscord", () => {
  it("returns the whole report as one chunk when it fits", () => {
    const text = "line one\nline two\nline three";
    expect(splitForDiscord(text, 100)).toEqual([text]);
  });

  it("splits on line boundaries, never mid-line", () => {
    const text = "aaaa\nbbbb\ncccc\ndddd";
    const chunks = splitForDiscord(text, 9); // fits two 4-char lines + newline
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(9);
    expect(chunks.join("\n")).toBe(text);
  });

  it("hard-splits a single line longer than the limit", () => {
    const long = "x".repeat(25);
    const chunks = splitForDiscord(long, 10);
    expect(chunks).toEqual(["xxxxxxxxxx", "xxxxxxxxxx", "xxxxx"]);
  });

  it("produces no empty chunks", () => {
    const chunks = splitForDiscord("a\n\n\nb", 4);
    for (const c of chunks) expect(c.length).toBeGreaterThan(0);
  });
});

describe("incident channel configuration", () => {
  const saved = {
    incident: process.env.INCIDENT_DISCORD_WEBHOOK_URL,
    discord: process.env.DISCORD_WEBHOOK_URL,
    alertEmail: process.env.ART_BACKEND_ALERT_EMAIL,
    ownerEmails: process.env.OWNER_EMAILS,
  };

  beforeEach(() => {
    delete process.env.INCIDENT_DISCORD_WEBHOOK_URL;
    delete process.env.DISCORD_WEBHOOK_URL;
    delete process.env.ART_BACKEND_ALERT_EMAIL;
    delete process.env.OWNER_EMAILS;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries({
      INCIDENT_DISCORD_WEBHOOK_URL: saved.incident,
      DISCORD_WEBHOOK_URL: saved.discord,
      ART_BACKEND_ALERT_EMAIL: saved.alertEmail,
      OWNER_EMAILS: saved.ownerEmails,
    })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("accepts a valid Discord webhook URL", () => {
    process.env.INCIDENT_DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/123/abc";
    expect(resolveIncidentWebhookUrl()).toBe("https://discord.com/api/webhooks/123/abc");
  });

  it("falls back to DISCORD_WEBHOOK_URL", () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/9/z";
    expect(resolveIncidentWebhookUrl()).toBe("https://discord.com/api/webhooks/9/z");
  });

  it("rejects a non-Discord URL (SSRF guard)", () => {
    process.env.INCIDENT_DISCORD_WEBHOOK_URL = "https://evil.example.com/api/webhooks/1/2";
    expect(resolveIncidentWebhookUrl()).toBeNull();
  });

  it("prefers explicit ART_BACKEND_ALERT_EMAIL recipients", () => {
    process.env.ART_BACKEND_ALERT_EMAIL = "a@x.test, b@x.test";
    expect(resolveIncidentRecipients()).toEqual(["a@x.test", "b@x.test"]);
  });

  it("falls back to owner emails when no explicit recipients are set", () => {
    // ownerEmails() always carries hardcoded staff addresses, so email is the
    // always-available channel — the same fallback the backend-offline alerts use.
    expect(resolveIncidentRecipients().length).toBeGreaterThan(0);
  });

  it("reports the email channel as configured via the owner-email fallback", () => {
    const cfg = incidentChannelsConfigured();
    expect(cfg.email).toBe(true);
    expect(cfg.any).toBe(true);
  });

  it("reports the Discord channel configured only with a valid webhook", () => {
    expect(incidentChannelsConfigured().discord).toBe(false);
    process.env.INCIDENT_DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1/2";
    expect(incidentChannelsConfigured().discord).toBe(true);
  });
});

describe("deliverIncidentReport channel filter", () => {
  const saved = {
    incident: process.env.INCIDENT_DISCORD_WEBHOOK_URL,
    discord: process.env.DISCORD_WEBHOOK_URL,
    alertEmail: process.env.ART_BACKEND_ALERT_EMAIL,
    ownerEmails: process.env.OWNER_EMAILS,
  };

  beforeEach(() => {
    safeFetchMock.mockClear();
    emailSendMock.mockClear();
    // Both channels configured: a valid webhook + the owner-email fallback.
    process.env.INCIDENT_DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1/2";
    delete process.env.ART_BACKEND_ALERT_EMAIL;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries({
      INCIDENT_DISCORD_WEBHOOK_URL: saved.incident,
      DISCORD_WEBHOOK_URL: saved.discord,
      ART_BACKEND_ALERT_EMAIL: saved.alertEmail,
      OWNER_EMAILS: saved.ownerEmails,
    })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("ALL_INCIDENT_CHANNELS lists both channels", () => {
    expect(ALL_INCIDENT_CHANNELS).toEqual(["discord", "email"]);
  });

  it("with no filter delivers to every configured channel", async () => {
    const res = await deliverIncidentReport("report");
    expect(res.delivered.sort()).toEqual(["discord", "email"]);
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
    expect(emailSendMock).toHaveBeenCalledTimes(1);
  });

  it("with channels=['discord'] only posts to Discord, never email", async () => {
    const res = await deliverIncidentReport("report", ["discord"]);
    expect(res.delivered).toEqual(["discord"]);
    // Email is unselected, so it must appear in NO bucket and never be sent.
    expect(res.failed).toEqual([]);
    expect(res.skipped).toEqual([]);
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
    expect(emailSendMock).not.toHaveBeenCalled();
  });

  it("with channels=['email'] only emails, never posts to Discord", async () => {
    const res = await deliverIncidentReport("report", ["email"]);
    expect(res.delivered).toEqual(["email"]);
    expect(emailSendMock).toHaveBeenCalledTimes(1);
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it("reports a selected-but-unconfigured channel as skipped without sending", async () => {
    delete process.env.INCIDENT_DISCORD_WEBHOOK_URL;
    delete process.env.DISCORD_WEBHOOK_URL;
    const res = await deliverIncidentReport("report", ["discord"]);
    expect(res.delivered).toEqual([]);
    expect(res.skipped).toEqual(["discord"]);
    expect(safeFetchMock).not.toHaveBeenCalled();
    expect(emailSendMock).not.toHaveBeenCalled();
  });

  it("treats an empty filter as 'all channels'", async () => {
    const res = await deliverIncidentReport("report", []);
    expect(res.delivered.sort()).toEqual(["discord", "email"]);
  });
});
