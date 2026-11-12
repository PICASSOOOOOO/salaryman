import { createHash } from "node:crypto";
import { db, deviceLinksTable, usersTable, type User } from "@workspace/db";
import { and, eq } from "drizzle-orm";
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

/**
 * World-game sockets may authenticate with the linked desktop credential used
 * by the native app. Keep this separate from generic/session-only sockets so a
 * desktop link does not silently grant access to unrelated WebSocket services.
 */
export async function resolveWorldWebSocketUser(req: IncomingMessage): Promise<User | null> {
  const sessionUser = await resolveWebSocketUser(req);
  if (sessionUser) return sessionUser;

  const authorization = req.headers.authorization ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const deviceId = req.headers["x-salaryman-device-id"];
  if (
    !/^sm_desktop_[A-Za-z0-9_-]{40,60}$/.test(token)
    || typeof deviceId !== "string"
    || !/^[a-zA-Z0-9._:-]{8,128}$/.test(deviceId)
  ) return null;

  try {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [link] = await db.select().from(deviceLinksTable).where(and(
      eq(deviceLinksTable.desktopAccessTokenHash, tokenHash),
      eq(deviceLinksTable.desktopDeviceId, deviceId),
      eq(deviceLinksTable.status, "linked"),
    )).limit(1);
    if (!link || !link.scopes.includes("salaryman_app")) return null;

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, link.userId)).limit(1);
    if (!user) return null;

    const now = new Date();
    await db.update(deviceLinksTable)
      .set({ lastDesktopSeenAt: now, updatedAt: now })
      .where(eq(deviceLinksTable.id, link.id));
    return user;
  } catch {
    return null;
  }
}