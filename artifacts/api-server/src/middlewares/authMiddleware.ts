import { type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db, orgMembersTable, usersTable, type User as DbUser } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { screenEmail, logLoginAttempt, flagUser } from "../lib/email-security";
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

function normalizedEmail(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().toLowerCase()
    : null;
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

async function resolveDbUser(req: Request): Promise<DbUser | undefined> {
  const auth = getAuth(req);
  const claims = (auth.sessionClaims ?? {}) as Record<string, unknown>;
  // userId is the old Replit subject for migrated accounts. auth.userId is only
  // the fallback Clerk-native ID for users created after this migration.
  const bridgeId = typeof claims.userId === "string" ? claims.userId : auth.userId;
  if (!bridgeId) return undefined;
  const email = normalizedEmail(claims.email);
  let [user] = await db.select().from(usersTable).where(eq(usersTable.id, bridgeId)).limit(1);
  if (user) return user;

  const screening = await screenEmail(email);
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? null;
  if (!screening.allowed) {
    await logLoginAttempt(email, ip, true, screening.reason);
    console.warn(`[Auth] Blocked JIT provisioning for ${email}: ${screening.reason}`);
    return undefined;
  }
  const [inserted] = await db.insert(usersTable).values({
    id: bridgeId, email,
    firstName: typeof claims.firstName === "string" ? claims.firstName : null,
    lastName: typeof claims.lastName === "string" ? claims.lastName : null,
  }).onConflictDoNothing().returning();
  user = inserted;
  if (!user) {
    [user] = await db.select().from(usersTable).where(eq(usersTable.id, bridgeId)).limit(1);
  }
  if (user) {
    await logLoginAttempt(email, ip, false, null);
    await reconcilePendingMembers(user);
    await reconcileReferralInvites(user, { isNew: !!inserted });
    if (screening.severity === "flag") {
      await flagUser(user.id, email, "suspicious_email", screening.reason);
    }
  }
  return user;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.dbUser != null;
  } as Request["isAuthenticated"];
  try {
    const user = await resolveDbUser(req);
    if (user) {
      req.dbUser = user;
      req.user = user;
    }
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
