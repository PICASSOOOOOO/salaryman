import * as oidc from "openid-client";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetCurrentAuthUserResponse,
  ExchangeMobileAuthorizationCodeBody,
  ExchangeMobileAuthorizationCodeResponse,
  LogoutMobileSessionResponse,
} from "@workspace/api-zod";
import { db, usersTable, orgMembersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getOrInitUsername } from "../lib/username";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
  ISSUER_URL,
  type SessionData,
} from "../lib/auth";
import { screenEmail, logLoginAttempt, flagUser } from "../lib/email-security";
import { reconcileReferralInvites } from "./referrals";
import {
  addUserToGuild,
  buildDiscordAuthUrl,
  discordAvatarUrl,
  discordConfigured,
  exchangeDiscordCode,
  fetchDiscordProfile,
  guildJoinConfigured,
  guildInviteUrl,
  type DiscordProfile,
} from "../lib/discord-auth";
import {
  buildGithubAuthUrl,
  exchangeGithubCode,
  fetchGithubPrimaryEmail,
  fetchGithubProfile,
  githubAvatarUrl,
  githubConfigured,
  type GithubProfile,
} from "../lib/github-auth";

const OIDC_COOKIE_TTL = 10 * 60 * 1000;

const router: IRouter = Router();

function getOrigin(req: Request): string {
  const rawProto = (req.headers["x-forwarded-proto"] as string) || "https";
  const proto = rawProto.split(",")[0].trim();
  const rawHost = (req.headers["x-forwarded-host"] as string) || (req.headers["host"] as string) || "localhost";
  const host = rawHost.split(",")[0].trim();
  return `${proto}://${host}`;
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  // Pablo is the universal command center — default landing after sign-in.
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/pablo";
  }
  return value;
}

// Promote any "invited" placeholder org memberships to the real user once they
// sign in (by either method) with the invited email.
async function reconcilePendingMembers(user: { id: string; email: string | null }) {
  if (!user.email) return;
  try {
    const pendingMembers = await db
      .select()
      .from(orgMembersTable)
      .where(
        and(
          eq(orgMembersTable.inviteEmail, user.email.toLowerCase()),
          eq(orgMembersTable.status, "invited")
        )
      );

    for (const pm of pendingMembers) {
      if (pm.userId.startsWith("pending_")) {
        const existing = await db
          .select()
          .from(orgMembersTable)
          .where(and(eq(orgMembersTable.orgId, pm.orgId), eq(orgMembersTable.userId, user.id)));

        if (existing.length === 0) {
          await db
            .delete(orgMembersTable)
            .where(and(eq(orgMembersTable.orgId, pm.orgId), eq(orgMembersTable.userId, pm.userId)));

          await db.insert(orgMembersTable).values({
            ...pm,
            userId: user.id,
            status: "active",
            joinedAt: new Date(),
          });
          console.log(`[Auth] Reconciled pending member ${pm.userId} → ${user.id} for org ${pm.orgId}`);
        }
      }
    }
  } catch (err) {
    console.error("[Auth] Failed to reconcile pending org members:", err);
  }
}

async function upsertUser(claims: Record<string, unknown>) {
  const rawEmail = (claims.email as string) || null;
  // Normalize to lowercase so OIDC and Discord (which already lowercases) share
  // one canonical form — otherwise User@x.com vs user@x.com would slip past the
  // email-link check and create duplicate accounts on the case-sensitive
  // unique(email) column.
  const userData = {
    id: claims.sub as string,
    email: rawEmail ? rawEmail.toLowerCase() : null,
    firstName: (claims.first_name as string) || null,
    lastName: (claims.last_name as string) || null,
    profileImageUrl: (claims.profile_image_url || claims.picture) as
      | string
      | null,
  };

  // The email column is unique. If another account (e.g. one created via the
  // Discord login flow, or a prior identity-provider sub) already owns this
  // email, link to that existing row instead of inserting a fresh id —
  // otherwise the unique(email) constraint throws and the login 500s. Mirrors
  // the email-linking in upsertDiscordUser. Returns null when no cross-id email
  // collision exists, so the normal same-sub upsert path runs.
  const linkExistingByEmail = async () => {
    if (!userData.email) return null;
    const [existingByEmail] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, userData.email));

    if (existingByEmail && existingByEmail.id !== userData.id) {
      const [updated] = await db
        .update(usersTable)
        .set({
          firstName: userData.firstName ?? existingByEmail.firstName,
          lastName: userData.lastName ?? existingByEmail.lastName,
          profileImageUrl:
            userData.profileImageUrl ?? existingByEmail.profileImageUrl,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, existingByEmail.id))
        .returning();

      await reconcilePendingMembers(updated);
      return updated;
    }
    return null;
  };

  const linked = await linkExistingByEmail();
  if (linked) return linked;

  try {
    const [preExisting] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, userData.id));
    const isNew = !preExisting;

    const [user] = await db
      .insert(usersTable)
      .values(userData)
      .onConflictDoUpdate({
        target: usersTable.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();

    await reconcilePendingMembers(user);
    await reconcileReferralInvites(user, { isNew });

    return user;
  } catch (err) {
    // TOCTOU: a concurrent login may have inserted this email between our
    // pre-check and this insert, tripping unique(email). Re-run the email-link
    // path before surfacing the error.
    const retry = await linkExistingByEmail();
    if (retry) return retry;
    throw err;
  }
}

// Create or link a user for a Discord login. We link by email first so that
// signing in with Discord lands on the same account as Replit Auth for the same
// person instead of creating a duplicate. When no email match exists we create a
// new account keyed by a stable `discord:<id>` id.
async function upsertDiscordUser(profile: DiscordProfile) {
  const email = profile.email ? profile.email.toLowerCase() : null;
  const displayName = profile.global_name || profile.username || null;
  const profileImageUrl = discordAvatarUrl(profile);

  if (email) {
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (existing) {
      // Don't clobber profile data the user already has; only backfill blanks.
      const [updated] = await db
        .update(usersTable)
        .set({
          firstName: existing.firstName || displayName,
          profileImageUrl: existing.profileImageUrl || profileImageUrl,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, existing.id))
        .returning();

      await reconcilePendingMembers(updated);
      return updated;
    }
  }

  const userData = {
    id: `discord:${profile.id}`,
    email,
    firstName: displayName,
    lastName: null,
    profileImageUrl,
  };

  const [preExisting] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, userData.id));
  const isNew = !preExisting;

  const [user] = await db
    .insert(usersTable)
    .values(userData)
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        ...userData,
        updatedAt: new Date(),
      },
    })
    .returning();

  await reconcilePendingMembers(user);
  await reconcileReferralInvites(user, { isNew });

  return user;
}

// Create or link a user for a GitHub login. Mirrors upsertDiscordUser: we link
// by verified email first so signing in with GitHub lands on the same account as
// Replit Auth / Discord for the same person instead of creating a duplicate.
// When no email match exists we create a new account keyed by a stable
// `github:<id>` id.
async function upsertGithubUser(
  profile: GithubProfile,
  primaryEmail: string | null,
) {
  const email = primaryEmail ? primaryEmail.toLowerCase() : null;
  const displayName = profile.name || profile.login || null;
  const profileImageUrl = githubAvatarUrl(profile);

  if (email) {
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (existing) {
      // Don't clobber profile data the user already has; only backfill blanks.
      const [updated] = await db
        .update(usersTable)
        .set({
          firstName: existing.firstName || displayName,
          profileImageUrl: existing.profileImageUrl || profileImageUrl,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, existing.id))
        .returning();

      await reconcilePendingMembers(updated);
      return updated;
    }
  }

  const userData = {
    id: `github:${profile.id}`,
    email,
    firstName: displayName,
    lastName: null,
    profileImageUrl,
  };

  const insertGithub = async () => {
    const [preExisting] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, userData.id));
    const isNew = !preExisting;

    const [user] = await db
      .insert(usersTable)
      .values(userData)
      .onConflictDoUpdate({
        target: usersTable.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();

    await reconcilePendingMembers(user);
    await reconcileReferralInvites(user, { isNew });
    return user;
  };

  try {
    return await insertGithub();
  } catch (err) {
    // TOCTOU: a concurrent login may have inserted this email between our
    // pre-check and this insert, tripping unique(email). Re-run the email-link
    // path before surfacing the error.
    if (email) {
      const [existing] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email));
      if (existing && existing.id !== userData.id) {
        await reconcilePendingMembers(existing);
        return existing;
      }
    }
    throw err;
  }
}

router.get("/auth/user", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.json(GetCurrentAuthUserResponse.parse({ user: null }));
    return;
  }
  let username: string | null = null;
  try {
    const state = await getOrInitUsername(req.user.id);
    username = state.username;
  } catch (err) {
    console.error("[Auth] Failed to resolve username:", err);
  }
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: { ...req.user, username },
    }),
  );
});

router.get("/login", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const returnTo = getSafeReturnTo(req.query.returnTo);

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  // Optional client-supplied login_hint — Pablo's intake passes the email
  // it already collected so the IdP can pre-fill the account picker. Only
  // forward syntactically plausible emails; refuse anything else so we
  // can't be used to inject arbitrary params into the authz URL.
  const rawHint = req.query.login_hint;
  const loginHint = typeof rawHint === "string"
    && rawHint.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawHint)
      ? rawHint
      : undefined;

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    // No `prompt` — let the IdP silently re-use an existing session when
    // present. Forcing "login consent" on every /api/login call meant
    // every Cover→Pablo click did a full re-OAuth, and any hiccup in that
    // chain dumped the user back at /pablo unauthenticated, which then
    // re-fired Pablo's name/email intake → the loop the user reported.
    state,
    nonce,
    ...(loginHint ? { login_hint: loginHint } : {}),
  });

  setOidcCookie(res, "code_verifier", codeVerifier);
  setOidcCookie(res, "nonce", nonce);
  setOidcCookie(res, "state", state);
  setOidcCookie(res, "return_to", returnTo);

  res.redirect(redirectTo.href);
});

// Query params are not validated because the OIDC provider may include
// parameters not expressed in the schema.
router.get("/callback", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;

  if (!codeVerifier || !expectedState) {
    res.redirect("/api/login");
    return;
  }

  const safeHost = ((req.headers.host as string) || "localhost").split(",")[0].trim();
  const currentUrl = new URL(
    `${callbackUrl}?${new URL(req.url, `http://${safeHost}`).searchParams}`,
  );

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch (err) {
    console.error("[Auth] OIDC token exchange failed:", err instanceof Error ? err.message : err);
    console.error("[Auth] Callback URL was:", callbackUrl);
    console.error("[Auth] Origin was:", getOrigin(req));
    res.redirect("/api/login");
    return;
  }

  const returnTo = getSafeReturnTo(req.cookies?.return_to);

  res.clearCookie("code_verifier", { path: "/" });
  res.clearCookie("nonce", { path: "/" });
  res.clearCookie("state", { path: "/" });
  res.clearCookie("return_to", { path: "/" });

  const claims = tokens.claims();
  if (!claims) {
    res.redirect("/api/login");
    return;
  }

  const email = (claims.email as string) || null;
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || null;
  const screening = await screenEmail(email);

  if (!screening.allowed) {
    await logLoginAttempt(email, clientIp, true, screening.reason);
    console.warn(`[Auth] Blocked login — email: ${email}, reason: ${screening.reason}`);
    res.redirect(`${returnTo}?auth_error=email_blocked`);
    return;
  }

  const dbUser = await upsertUser(
    claims as unknown as Record<string, unknown>,
  );

  await logLoginAttempt(email, clientIp, false, null);

  if (screening.severity === "flag") {
    await flagUser(dbUser.id, email, "suspicious_email", screening.reason);
    console.warn(`[Auth] Flagged user — id: ${dbUser.id}, email: ${email}, reason: ${screening.reason}`);
  }

  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
    },
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.redirect(returnTo);
});

// --- Discord OAuth2 (coexists with the Replit-Auth OIDC flow above) ---

router.get("/auth/discord", async (req: Request, res: Response) => {
  const returnTo = getSafeReturnTo(req.query.returnTo);

  if (!discordConfigured()) {
    console.warn("[Auth] Discord login attempted but Discord OAuth is not configured");
    res.redirect(`${returnTo}?auth_error=discord_unavailable`);
    return;
  }

  const redirectUri = `${getOrigin(req)}/api/auth/discord/callback`;
  const state = oidc.randomState();

  setOidcCookie(res, "discord_state", state);
  setOidcCookie(res, "discord_return_to", returnTo);

  res.redirect(buildDiscordAuthUrl({ redirectUri, state }));
});

router.get("/auth/discord/callback", async (req: Request, res: Response) => {
  const returnTo = getSafeReturnTo(req.cookies?.discord_return_to);

  res.clearCookie("discord_state", { path: "/" });
  res.clearCookie("discord_return_to", { path: "/" });

  const expectedState = req.cookies?.discord_state;
  const { code, state, error } = req.query;

  if (error || typeof code !== "string") {
    console.warn("[Auth] Discord callback missing code or returned error:", error);
    res.redirect(returnTo);
    return;
  }

  if (!expectedState || state !== expectedState) {
    console.warn("[Auth] Discord callback state mismatch");
    res.redirect(`${returnTo}?auth_error=discord_state`);
    return;
  }

  try {
    const redirectUri = `${getOrigin(req)}/api/auth/discord/callback`;
    const accessToken = await exchangeDiscordCode({ code, redirectUri });
    const profile = await fetchDiscordProfile(accessToken);

    const email = profile.email || null;
    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || null;
    const screening = await screenEmail(email);

    if (!screening.allowed) {
      await logLoginAttempt(email, clientIp, true, screening.reason);
      console.warn(`[Auth] Blocked Discord login — email: ${email}, reason: ${screening.reason}`);
      res.redirect(`${returnTo}?auth_error=email_blocked`);
      return;
    }

    const dbUser = await upsertDiscordUser(profile);

    await logLoginAttempt(email, clientIp, false, null);

    if (screening.severity === "flag") {
      await flagUser(dbUser.id, email, "suspicious_email", screening.reason);
      console.warn(`[Auth] Flagged user — id: ${dbUser.id}, email: ${email}, reason: ${screening.reason}`);
    }

    const sessionData: SessionData = {
      user: {
        id: dbUser.id,
        email: dbUser.email,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        profileImageUrl: dbUser.profileImageUrl,
      },
      access_token: accessToken,
      // Discord access tokens aren't refreshed here; the session lives for the
      // standard SESSION_TTL via the sessions table. Leaving expires_at unset
      // means authMiddleware won't try (and fail) to OIDC-refresh it.
    };

    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);

    // Connecting Discord is an explicit opt-in, so after a successful sign-in we
    // take the user straight to our Discord server. Best-effort bot auto-join
    // first (silent, if a bot + guild id are configured), then land them on the
    // server invite so they're dropped right into "SALARYMAN /// MINX CITY".
    // Discord handles already-members gracefully. Falls back to returnTo when no
    // invite link is configured.
    if (guildJoinConfigured()) {
      const joinResult = await addUserToGuild({
        userId: profile.id,
        accessToken,
      });
      console.log(`[Auth] Discord guild join for ${profile.id}: ${joinResult}`);
    }

    res.redirect(guildInviteUrl() ?? returnTo);
  } catch (err) {
    console.error("[Auth] Discord login failed:", err instanceof Error ? err.message : err);
    res.redirect(`${returnTo}?auth_error=discord_failed`);
  }
});

// --- GitHub OAuth2 (coexists with the Replit-Auth OIDC + Discord flows) ---

router.get("/auth/github", async (req: Request, res: Response) => {
  const returnTo = getSafeReturnTo(req.query.returnTo);

  if (!githubConfigured()) {
    console.warn("[Auth] GitHub login attempted but GitHub OAuth is not configured");
    res.redirect(`${returnTo}?auth_error=github_unavailable`);
    return;
  }

  const redirectUri = `${getOrigin(req)}/api/auth/github/callback`;
  const state = oidc.randomState();

  setOidcCookie(res, "github_state", state);
  setOidcCookie(res, "github_return_to", returnTo);

  res.redirect(buildGithubAuthUrl({ redirectUri, state }));
});

router.get("/auth/github/callback", async (req: Request, res: Response) => {
  const returnTo = getSafeReturnTo(req.cookies?.github_return_to);

  res.clearCookie("github_state", { path: "/" });
  res.clearCookie("github_return_to", { path: "/" });

  const expectedState = req.cookies?.github_state;
  const { code, state, error } = req.query;

  if (error || typeof code !== "string") {
    console.warn("[Auth] GitHub callback missing code or returned error:", error);
    res.redirect(returnTo);
    return;
  }

  if (!expectedState || state !== expectedState) {
    console.warn("[Auth] GitHub callback state mismatch");
    res.redirect(`${returnTo}?auth_error=github_state`);
    return;
  }

  try {
    const redirectUri = `${getOrigin(req)}/api/auth/github/callback`;
    const accessToken = await exchangeGithubCode({ code, redirectUri });
    const profile = await fetchGithubProfile(accessToken);
    // The /user endpoint omits private emails AND its `email` field is not
    // guaranteed verified, so we ONLY trust the verified primary from
    // /user/emails for account linking. If none is available (or the lookup
    // fails) we fail closed to null, which routes to a `github:<id>` account
    // instead of risking a link to an unverified address.
    const primaryEmail = await fetchGithubPrimaryEmail(accessToken);

    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || null;

    // Only screen when GitHub actually gave us a usable verified email. A null
    // email is the legitimate "no public email" path — it must NOT be blocked
    // (screenEmail returns no_email for null), it falls through to a stable
    // `github:<id>` account below.
    const screening = primaryEmail ? await screenEmail(primaryEmail) : null;

    if (screening && !screening.allowed) {
      await logLoginAttempt(primaryEmail, clientIp, true, screening.reason);
      console.warn(`[Auth] Blocked GitHub login — email: ${primaryEmail}, reason: ${screening.reason}`);
      res.redirect(`${returnTo}?auth_error=email_blocked`);
      return;
    }

    const dbUser = await upsertGithubUser(profile, primaryEmail);

    await logLoginAttempt(primaryEmail, clientIp, false, null);

    if (screening && screening.severity === "flag") {
      await flagUser(dbUser.id, primaryEmail, "suspicious_email", screening.reason);
      console.warn(`[Auth] Flagged user — id: ${dbUser.id}, email: ${primaryEmail}, reason: ${screening.reason}`);
    }

    const sessionData: SessionData = {
      user: {
        id: dbUser.id,
        email: dbUser.email,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        profileImageUrl: dbUser.profileImageUrl,
      },
      access_token: accessToken,
      // GitHub OAuth-app tokens don't expire and aren't refreshed here; the
      // session lives for the standard SESSION_TTL via the sessions table.
      // Leaving expires_at unset means authMiddleware won't try (and fail) to
      // OIDC-refresh it.
    };

    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);
    res.redirect(returnTo);
  } catch (err) {
    console.error("[Auth] GitHub login failed:", err instanceof Error ? err.message : err);
    res.redirect(`${returnTo}?auth_error=github_failed`);
  }
});

router.get("/logout", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const origin = getOrigin(req);

  const sid = getSessionId(req);
  await clearSession(res, sid);

  const endSessionUrl = oidc.buildEndSessionUrl(config, {
    client_id: process.env.REPL_ID!,
    post_logout_redirect_uri: origin,
  });

  res.redirect(endSessionUrl.href);
});

router.post(
  "/mobile-auth/token-exchange",
  async (req: Request, res: Response) => {
    const parsed = ExchangeMobileAuthorizationCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required parameters" });
      return;
    }

    const { code, code_verifier, redirect_uri, state, nonce } = parsed.data;

    try {
      const config = await getOidcConfig();

      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.set("code", code);
      callbackUrl.searchParams.set("state", state);
      callbackUrl.searchParams.set("iss", ISSUER_URL);

      const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: code_verifier,
        expectedNonce: nonce ?? undefined,
        expectedState: state,
        idTokenExpected: true,
      });

      const claims = tokens.claims();
      if (!claims) {
        res.status(401).json({ error: "No claims in ID token" });
        return;
      }

      const mobileEmail = (claims.email as string) || null;
      const mobileIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || null;
      const mobileScreening = await screenEmail(mobileEmail);

      if (!mobileScreening.allowed) {
        await logLoginAttempt(mobileEmail, mobileIp, true, mobileScreening.reason);
        console.warn(`[Auth] Blocked mobile login — email: ${mobileEmail}, reason: ${mobileScreening.reason}`);
        res.status(403).json({ error: "Email address not allowed" });
        return;
      }

      const dbUser = await upsertUser(
        claims as unknown as Record<string, unknown>,
      );

      await logLoginAttempt(mobileEmail, mobileIp, false, null);

      if (mobileScreening.severity === "flag") {
        await flagUser(dbUser.id, mobileEmail, "suspicious_email", mobileScreening.reason);
      }

      const now = Math.floor(Date.now() / 1000);
      const sessionData: SessionData = {
        user: {
          id: dbUser.id,
          email: dbUser.email,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          profileImageUrl: dbUser.profileImageUrl,
        },
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
      };

      const sid = await createSession(sessionData);
      res.json(ExchangeMobileAuthorizationCodeResponse.parse({ token: sid }));
    } catch (err) {
      console.error("Mobile token exchange error:", err);
      res.status(500).json({ error: "Token exchange failed" });
    }
  },
);

router.post("/mobile-auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json(LogoutMobileSessionResponse.parse({ success: true }));
});

export default router;
