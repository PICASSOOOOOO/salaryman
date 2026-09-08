import { createCipheriv, createDecipheriv, randomBytes, createHmac } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const key = process.env.BOT_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!key) {
    throw new Error("BOT_ENCRYPTION_KEY or SESSION_SECRET must be set for credential encryption");
  }
  const hash = createHmac("sha256", "bot-credentials").update(key).digest();
  return hash;
}

export function encryptCredentials(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

export function decryptCredentials(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) return ciphertext;

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encrypted = Buffer.from(parts[2], "hex");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return ciphertext;
  }
}

export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

export function verifyTelegramWebhook(secretToken: string | undefined, expectedSecret: string): boolean {
  if (!secretToken || !expectedSecret) return false;
  return secretToken === expectedSecret;
}

export function verifyTwilioSignature(
  signature: string | undefined,
  url: string,
  params: Record<string, string>,
  authToken: string
): boolean {
  if (!signature || !authToken) return false;
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }
  const computed = createHmac("sha1", authToken).update(data).digest("base64");
  return computed === signature;
}
