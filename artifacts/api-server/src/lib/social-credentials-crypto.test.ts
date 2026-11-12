import { beforeEach, describe, expect, it } from "vitest";
import { decryptSocialCredentials, encryptSocialCredentials } from "./social-credentials-crypto";

describe("social credential encryption", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret-with-enough-entropy";
    delete process.env.SOCIAL_CREDENTIALS_ENCRYPTION_KEY;
  });

  it("stores credentials as an authenticated encrypted envelope", () => {
    const credentials = { clientId: "client-id", clientSecret: "private-value" };
    const stored = encryptSocialCredentials(credentials, "user-1", "threads");

    expect(stored.__socialCredentials).toBe("v1");
    expect(JSON.stringify(stored)).not.toContain("private-value");
    expect(decryptSocialCredentials(stored, "user-1", "threads")).toEqual({
      credentials,
      needsEncryption: false,
    });
  });

  it("binds ciphertext to its user and platform", () => {
    const stored = encryptSocialCredentials({ token: "private-value" }, "user-1", "threads");
    expect(() => decryptSocialCredentials(stored, "user-2", "threads")).toThrow();
    expect(() => decryptSocialCredentials(stored, "user-1", "instagram")).toThrow();
  });

  it("recognizes legacy plaintext for lazy migration", () => {
    expect(decryptSocialCredentials({ appPassword: "legacy-secret" }, "user-1", "bluesky")).toEqual({
      credentials: { appPassword: "legacy-secret" },
      needsEncryption: true,
    });
  });
});
