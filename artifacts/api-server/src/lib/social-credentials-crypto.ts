import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "crypto";

const VERSION = "v1";
const MARKER = "__socialCredentials";
type CredentialEnvelope = Record<string, string> & {
  __socialCredentials: string;
  iv: string;
  tag: string;
  data: string;
};

function getKey(): Buffer {
  const secret = process.env.SOCIAL_CREDENTIALS_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SOCIAL_CREDENTIALS_ENCRYPTION_KEY or SESSION_SECRET must be configured");
  }
  return createHmac("sha256", "salaryman-social-credentials-v1").update(secret).digest();
}

function getAad(userId: string, provider: string): Buffer {
  return Buffer.from(`social:${VERSION}:${userId}:${provider}`, "utf8");
}

export function encryptSocialCredentials(
  credentials: Record<string, string>,
  userId: string,
  provider: string,
): Record<string, string> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  cipher.setAAD(getAad(userId, provider));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  return {
    [MARKER]: VERSION,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    data: encrypted.toString("base64url"),
  };
}

export function decryptSocialCredentials(
  stored: Record<string, string> | null | undefined,
  userId: string,
  provider: string,
): { credentials: Record<string, string>; needsEncryption: boolean } {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return { credentials: {}, needsEncryption: false };
  }
  const envelope = stored as Partial<CredentialEnvelope>;
  if (envelope[MARKER] !== VERSION) {
    // Existing connections predate app-layer encryption. They remain usable and
    // are re-encrypted on their next live publish or credential update.
    return { credentials: stored, needsEncryption: Object.keys(stored).length > 0 };
  }
  if (!envelope.iv || !envelope.tag || !envelope.data) {
    throw new Error("Social credentials have an invalid encrypted format");
  }

  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(envelope.iv, "base64url"));
  decipher.setAAD(getAad(userId, provider));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  const parsed: unknown = JSON.parse(plaintext);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Social credentials have an invalid payload");
  }
  return { credentials: parsed as Record<string, string>, needsEncryption: false };
}
