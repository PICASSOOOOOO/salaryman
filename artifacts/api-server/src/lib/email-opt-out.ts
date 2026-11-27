import { createHmac, timingSafeEqual } from "node:crypto";

function emailOptOutSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for email opt-out links");
  return secret;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function signEmailOptOut(userId: string, email: string): string {
  return createHmac("sha256", emailOptOutSecret())
    .update(`${userId}:${normalizeEmail(email)}`)
    .digest("base64url");
}

export function verifyEmailOptOut(userId: string, email: string, signature: string): boolean {
  if (!userId.trim() || !email.trim() || !signature.trim()) return false;
  try {
    const expected = Buffer.from(signEmailOptOut(userId, email));
    const supplied = Buffer.from(signature);
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  } catch {
    return false;
  }
}

export function buildEmailOptOutUrl(userId: string, email: string): string {
  const baseUrl = (process.env.APP_URL || "https://salaryman.io").replace(/\/+$/, "");
  const params = new URLSearchParams({
    userId,
    email: normalizeEmail(email),
    signature: signEmailOptOut(userId, email),
  });
  return `${baseUrl}/api/campaigns/email/unsubscribe?${params.toString()}`;
}
