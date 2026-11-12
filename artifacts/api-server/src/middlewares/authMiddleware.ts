import { type NextFunction, type Request, type Response } from "express";
import * as oidc from "openid-client";
import { and, eq, sql } from "drizzle-orm";
import { db, orgMembersTable, usersTable, type User as DbUser } from "@workspace/db";
import {
  clearSession,
  getOidcConfig,
  getSession,
  getSessionId,
  updateSession,
  type SessionData,
} from "../lib/replit-auth";
import { reconcileReferralInvites } from "../routes/referrals";

declare global {
  namespace Express {
    interface User extends DbUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;
      user?: User | undefined;
      dbUser?: User | undefined;
    }

    export interface AuthedRequest {
      user: User;
    }
  }
}

async function reconcilePendingMembers(user: DbUser): Promise<void> {
  if (!user.email) return;
  const pending = await db.select().from(orgMembersTable).where(and(
    eq(orgMembersTable.inviteEmail, user.email.toLowerCase()),
    eq(orgMembersTable.status, "invited"),
  ));
  for (const member of pending) {
    if (!member.userId.startsWith("pending_")) continue;
    const [existing] = await db.select().from(orgMembersTable).where(and(
      eq(orgMembersTable.orgId, member.orgId),
      eq(orgMembersTable.userId, user.id),
    ));
    if (existing) continue;
    await db.delete(orgMembersTable).where(and(
      eq(orgMembersTable.orgId, member.orgId),
      eq(orgMembersTable.userId, member.userId),
    ));
    await db.insert(orgMembersTable).values({
      ...member, userId: user.id, status: "active", joinedAt: new Date(),
    });
  }
}

async function resolveLocalUser(session: SessionData): Promise<DbUser | undefined> {
  const email = session.user.email?.trim().toLowerCase();
  const [byId] = await db.select().from(usersTable).where(eq(usersTable.id, session.user.id)).limit(1);
  if (byId) return byId;
  if (!email) return undefined;
  const [byEmail] = await db.select().from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email}`)
    .limit(1);
  return byEmail;
}

async function refreshIfExpired(sid: string, session: SessionData): Promise<SessionData | null> {
  const now = Math.floor(Date.now() / 1000);
  if (!session.expires_at || now <= session.expires_at) return session;
  if (!session.refresh_token) return null;
  try {
    const config = await getOidcConfig();
    const tokens = await oidc.refreshTokenGrant(config, session.refresh_token);
    session.access_token = tokens.access_token;
    session.refresh_token = tokens.refresh_token ?? session.refresh_token;
    session.expires_at = tokens.expiresIn() ? now + tokens.expiresIn()! : session.expires_at;
    await updateSession(sid, session);
    return session;
  } catch {
    return null;
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  req.isAuthenticated = function (this: Request) {
    return this.dbUser != null;
  } as Request["isAuthenticated"];

  const sid = getSessionId(req);
  if (!sid) {
    next();
    return;
  }

  try {
    const session = await getSession(sid);
    if (!session?.user?.id) {
      await clearSession(res, sid);
      next();
      return;
    }

    const refreshed = await refreshIfExpired(sid, session);
    if (!refreshed) {
      await clearSession(res, sid);
      next();
      return;
    }

    const user = await resolveLocalUser(refreshed);
    if (!user) {
      await clearSession(res, sid);
      next();
      return;
    }

    req.dbUser = user;
    req.user = user;
    void reconcilePendingMembers(user).catch(() => {});
    void reconcileReferralInvites(user, { isNew: false }).catch(() => {});
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.dbUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}