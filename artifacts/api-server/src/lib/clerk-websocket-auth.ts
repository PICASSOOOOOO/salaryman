import { verifyToken } from "@clerk/backend";
import { db, usersTable, type User } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { IncomingMessage } from "http";

function cookieValue(req: IncomingMessage, name: string): string | undefined {
  return req.headers.cookie
    ?.split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/**
 * WebSocket upgrades do not pass through Express, so authenticate Clerk's
 * signed __session JWT directly. `verifyToken` fetches/uses Clerk's JWKS and
 * rejects expired or forged cookies; query-string values are never accepted.
 */
export async function resolveClerkWebSocketUser(
  req: IncomingMessage,
): Promise<User | null> {
  const rawSession = cookieValue(req, "__session");
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!rawSession || !secretKey) return null;

  try {
    const claims = await verifyToken(decodeURIComponent(rawSession), { secretKey });
    // Migration setup puts legacy Replit subject in this custom session claim.
    // `sub` is Clerk's native user id and only applies to newly created users.
    const bridgeId = typeof claims.userId === "string" ? claims.userId : claims.sub;
    if (!bridgeId) return null;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, bridgeId)).limit(1);
    return user ?? null;
  } catch {
    return null;
  }
}