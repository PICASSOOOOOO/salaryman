import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptProtectedRecord,
  encryptProtectedRecord,
  maskProtectedRecord,
} from "./org-protected-records-crypto";

const originalSessionSecret = process.env.SESSION_SECRET;
const originalRecordsKey = process.env.ORG_RECORDS_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.SESSION_SECRET = "org-record-test-session-secret";
  delete process.env.ORG_RECORDS_ENCRYPTION_KEY;
});

afterEach(() => {
  if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSessionSecret;
  if (originalRecordsKey === undefined) delete process.env.ORG_RECORDS_ENCRYPTION_KEY;
  else process.env.ORG_RECORDS_ENCRYPTION_KEY = originalRecordsKey;
});

describe("organization protected-record encryption", () => {
  it("round-trips only inside the same organization context", () => {
    const encrypted = encryptProtectedRecord("98-7654321", 42);
    expect(encrypted).not.toContain("98-7654321");
    expect(decryptProtectedRecord(encrypted, 42)).toBe("98-7654321");
    expect(() => decryptProtectedRecord(encrypted, 43)).toThrow();
  });

  it("fails closed for malformed and tampered payloads", () => {
    expect(() => decryptProtectedRecord("plaintext", 42)).toThrow(/invalid encrypted format/i);
    const encrypted = encryptProtectedRecord("secret", 42);
    expect(() => decryptProtectedRecord(`${encrypted.slice(0, -1)}x`, 42)).toThrow();
  });

  it("produces masked metadata without exposing the full value", () => {
    expect(maskProtectedRecord("98-7654321")).toBe("••••••4321");
    expect(maskProtectedRecord("1234")).toBe("••••");
  });
});