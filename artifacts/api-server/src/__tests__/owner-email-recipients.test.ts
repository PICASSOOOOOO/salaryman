import { afterEach, describe, expect, it, vi } from "vitest";
import { getOwnerEmailRecipients } from "../lib/owner-email-recipients";

describe("getOwnerEmailRecipients", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("trims, removes empty entries, and deduplicates recipients", () => {
    vi.stubEnv(
      "OWNER_EMAILS",
      " owner-one@example.test, , owner-two@example.test,owner-one@example.test ",
    );

    expect(getOwnerEmailRecipients()).toEqual([
      "owner-one@example.test",
      "owner-two@example.test",
    ]);
  });

  it("returns an empty list when no recipients are configured", () => {
    vi.stubEnv("OWNER_EMAILS", "  , ");

    expect(getOwnerEmailRecipients()).toEqual([]);
  });
});
