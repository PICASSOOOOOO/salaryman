import { db, usersTable, type User } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { IncomingMessage } from "http";
import { getSession, SESSION_COOKIE } from "./replit-auth";

function cookieValue(req: IncomingMessage, name: string): string | undefined {
  return req.headers.cookie
    ?.split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/**
 * WebSocket upgrades bypass Express, so resolve the same database-backed
 * session cookie used by normal API requests.
 */
export async function resolveWebSocketUser(req: IncomingMessage): Promise<User | null> {
  const rawSession = cookieValue(req, SESSION_COOKIE);
  if (!rawSession) return null;

  try {
    const session = await getSession(decodeURIComponent(rawSession));
    const [user] = session?.user?.id
      ? await db.select().from(usersTable).where(eq(usersTable.id, session.user.id)).limit(1)
      : [];
    return user ?? null;
  } catch {
    return null;
  }
}