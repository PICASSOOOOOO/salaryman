import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const PREFIX = "scrypt$";
const COMPACT_VERSION = "v2";

function encodeCompact(value: Buffer): string {
  return value.toString("base64url");
}

function decodeCompact(value: string): Buffer | null {
  // base64url is deliberately decoded only after checking its alphabet. This
  // keeps malformed stored values from being treated as a valid password hash.
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return null;
  }
}

export async function hashAccessCode(code: string): Promise<string> {
  const salt = randomBytes(16);
  const digest = await scryptAsync(code, salt, 64) as Buffer;
  // The database column is varchar(120). Hex encoding the salt and digest
  // produces a 167-character value, so use unpadded base64url while retaining
  // the same scrypt cost and 64-byte digest. The version marker lets
  // verification continue to accept hashes written by the previous format.
  return `${PREFIX}${COMPACT_VERSION}$${encodeCompact(salt)}$${encodeCompact(digest)}`;
}

export function isHashedAccessCode(value: string): boolean {
  return value.startsWith(PREFIX);
}

export async function verifyAccessCode(stored: string, candidate: unknown): Promise<boolean> {
  if (typeof candidate !== "string") return false;
  if (!isHashedAccessCode(stored)) return stored === candidate;
  const parts = stored.split("$");
  let salt: string | Buffer;
  let expected: Buffer;
  if (parts.length === 4 && parts[1] === COMPACT_VERSION) {
    const saltBytes = decodeCompact(parts[2]);
    const digest = decodeCompact(parts[3]);
    if (!saltBytes || !digest || saltBytes.length === 0 || digest.length === 0) return false;
    salt = saltBytes;
    expected = digest;
  } else {
    // Legacy scrypt$salt$hex-digest values remain readable so existing door
    // locks do not break when the compact representation is deployed.
    const [, legacySalt, encoded] = parts;
    if (!legacySalt || !encoded || !/^[0-9a-f]+$/i.test(encoded) || encoded.length % 2 !== 0) return false;
    salt = legacySalt;
    expected = Buffer.from(encoded, "hex");
  }
  const received = await scryptAsync(candidate, salt, expected.length) as Buffer;
  return expected.length === received.length && timingSafeEqual(expected, received);
}