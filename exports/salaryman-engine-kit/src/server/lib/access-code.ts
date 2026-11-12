import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const PREFIX = "scrypt$";

export async function hashAccessCode(code: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const digest = await scryptAsync(code, salt, 64) as Buffer;
  return `${PREFIX}${salt}$${digest.toString("hex")}`;
}

export function isHashedAccessCode(value: string): boolean {
  return value.startsWith(PREFIX);
}

export async function verifyAccessCode(stored: string, candidate: unknown): Promise<boolean> {
  if (typeof candidate !== "string") return false;
  if (!isHashedAccessCode(stored)) return stored === candidate;
  const [, salt, encoded] = stored.split("$");
  if (!salt || !encoded) return false;
  const expected = Buffer.from(encoded, "hex");
  const received = await scryptAsync(candidate, salt, expected.length) as Buffer;
  return expected.length === received.length && timingSafeEqual(expected, received);
}