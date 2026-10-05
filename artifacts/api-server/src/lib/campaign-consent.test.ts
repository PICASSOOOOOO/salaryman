import { describe, expect, it } from "vitest";
import { hasRecordedSmsMarketingPermission } from "./campaign-consent";

describe("SMS campaign permission", () => {
  it("requires explicit permission and a recorded timestamp", () => {
    expect(hasRecordedSmsMarketingPermission(undefined)).toBe(false);
    expect(hasRecordedSmsMarketingPermission({
      smsOptIn: true,
      smsConsentedAt: null,
      smsOptedOutAt: null,
    })).toBe(false);
    expect(hasRecordedSmsMarketingPermission({
      smsOptIn: true,
      smsConsentedAt: "2026-10-05T10:00:00Z",
      smsOptedOutAt: null,
    })).toBe(true);
  });

  it("honors a recorded opt-out even if prior permission remains in history", () => {
    expect(hasRecordedSmsMarketingPermission({
      smsOptIn: false,
      smsConsentedAt: "2026-10-05T10:00:00Z",
      smsOptedOutAt: "2026-10-05T11:00:00Z",
    })).toBe(false);
  });
});
