import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const FORMAT_VERSION = "v1";

function getEncryptionKey(): Buffer {
  const secret = process.env.ORG_RECORDS_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("ORG_RECORDS_ENCRYPTION_KEY or SESSION_SECRET must be configured");
  }
  return createHmac("sha256", "org-protected-records-v1").update(secret).digest();
}

function additionalData(orgId: number): Buffer {
  return Buffer.from(`org:${orgId}`, "utf8");
}

export function encryptProtectedRecord(value: string, orgId: number): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  cipher.setAAD(additionalData(orgId));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [FORMAT_VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptProtectedRecord(payload: string, orgId: number): string {
  const [version, ivRaw, tagRaw, encryptedRaw, ...rest] = payload.split(":");
  if (version !== FORMAT_VERSION || !ivRaw || !tagRaw || !encryptedRaw || rest.length > 0) {
    throw new Error("Protected record has an invalid encrypted format");
  }

  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAAD(additionalData(orgId));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskProtectedRecord(value: string): string {
  const characters = Array.from(value);
  if (characters.length <= 4) return "••••";
  return `${"•".repeat(Math.min(8, characters.length - 4))}${characters.slice(-4).join("")}`;
}