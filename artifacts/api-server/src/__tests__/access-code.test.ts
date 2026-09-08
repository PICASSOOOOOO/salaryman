import { describe, expect, it } from "vitest";
import { hashAccessCode, isHashedAccessCode, verifyAccessCode } from "../lib/access-code";

describe("organization access codes", () => {
  it("hashes and verifies a PIN without retaining plaintext", async () => {
    const stored = await hashAccessCode("482910");
    expect(stored).not.toContain("482910");
    expect(isHashedAccessCode(stored)).toBe(true);
    await expect(verifyAccessCode(stored, "482910")).resolves.toBe(true);
    await expect(verifyAccessCode(stored, "482911")).resolves.toBe(false);
  });

  it("accepts legacy plaintext only for transparent migration", async () => {
    expect(isHashedAccessCode("legacy-pin")).toBe(false);
    await expect(verifyAccessCode("legacy-pin", "legacy-pin")).resolves.toBe(true);
    await expect(verifyAccessCode("legacy-pin", "wrong")).resolves.toBe(false);
  });
});