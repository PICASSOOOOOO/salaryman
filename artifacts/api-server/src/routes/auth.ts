import crypto from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import * as oidc from "openid-client";
import { and, eq, sql } from "drizzle-orm";
import { db, accountIdentitiesTable, usersTable } from "@workspace/db";
import {
  clearSession,
  createSession,
  getOidcConfig,
  getSessionId,
  ISSUER_URL,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from "../lib/replit-auth";
import {
  addUserToGuild,
  buildDiscordAuthUrl,
  discordConfigured,
  exchangeDiscordCode,
  fetchDiscordProfile,
  guildJoinConfigured,
} from "../lib/discord-auth";
import {
  buildGithubAuthUrl,
  exchangeGithubCode,
  fetchGithubProfile,
  githubConfigured,
  resolveGithubCreds,
} from "../lib/github-auth";

const router: IRouter = Router();
const OAUTH_COOKIE_TTL = 10 * 60 * 1000;
const OIDC_COOKIE_TTL = 10 * 60 * 1000;

function getVisibleHost(req: Request): string {
  const forwardedHost = ((req.headers["x-forwarded-host"] as string) || "").split(",")[0].trim();
  return forwardedHost || (req.headers.host || "").split(",")[0].trim();
}

function isLoopbackHost(host: string): boolean {
  return /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/i.test(host);
}

function getOrigin(req: Request): string {
  // The local preview proxy presents the API with a loopback forwarded host
  // even though the browser entered through the public *.replit.dev domain.
  // OIDC requires the callback URL to be browser-reachable, so prefer the
  // configured dev domain only for loopback requests. Production and public
  // preview requests continue to honor the forwarded/custom host.
  const visibleHost = getVisibleHost(req);
  if (isLoopbackHost(visibleHost) && process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  const proto = ((req.headers["x-forwarded-proto"] as string) || "https").split(",")[0].trim();
  const host = visibleHost || "localhost";
  return `${proto}://${host}`;
}

function getSafeReturnTo(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value : "/pablo";
}

function setOAuthCookie(res: Response, name: string, value: string): void {
  res.cookie(name, value, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: OAUTH_COOKIE_TTL,
  });
}

function oauthState(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function setSessionCookie(res: Response, sid: string): void {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string): void {
  res.cookie(name, value, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeOidcReturnTo(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value : "/";
}

async function upsertReplitUser(claims: Record<string, unknown>) {
  const id = typeof claims.sub === "string" ? claims.sub : "";
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : null;
  if (!id) throw new Error("Replit Auth did not provide a subject");

  let [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user && email) {
    [user] = await db.select().from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${email}`)
      .limit(1);
  }

  const profile = {
    email,
    firstName: typeof claims.first_name === "string" ? claims.first_name : null,
    lastName: typeof claims.last_name === "string" ? claims.last_name : null,
    profileImageUrl: typeof claims.profile_image_url === "string"
      ? claims.profile_image_url
      : typeof claims.picture === "string" ? claims.picture : null,
    updatedAt: new Date(),
  };

  if (user) {
    [user] = await db.update(usersTable).set(profile).where(eq(usersTable.id, user.id)).returning();
    return { user, isNew: false };
  }

  [user] = await db.insert(usersTable).values({ id, ...profile }).onConflictDoNothing().returning();
  if (!user) {
    [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  }
  if (!user) throw new Error("Unable to create local user record");
  return { user, isNew: true };
}

router.get("/auth/user", (req, res) => {
  res.json({
    user: req.isAuthenticated()
      ? {
          id: req.user.id,
          email: req.user.email,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          profileImageUrl: req.user.profileImageUrl,
          username: req.user.username,
        }
      : null,
  });
});

router.get("/login", async (req: Request, res: Response) => {
  try {
    // The local preview proxy can serve the iframe from loopback while the
    // browser-reachable OIDC callback is the public *.replit.dev host. Start
    // the flow on that public host so the PKCE cookies and callback share a
    // cookie origin. Without this hop, the callback cannot see state and
    // repeatedly sends the user back to login.
    if (isLoopbackHost(getVisibleHost(req)) && process.env.REPLIT_DEV_DOMAIN) {
      const publicLogin = new URL("/api/login", `https://${process.env.REPLIT_DEV_DOMAIN}`);
      publicLogin.searchParams.set("returnTo", getSafeOidcReturnTo(req.query.returnTo));
      res.redirect(publicLogin.href);
      return;
    }
    const config = await getOidcConfig();
    const callbackUrl = `${getOrigin(req)}/api/callback`;
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const redirectTo = oidc.buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl,
      scope: "openid email profile offline_access",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      prompt: "login consent",
      state,
      nonce,
    });
    setOidcCookie(res, "code_verifier", codeVerifier);
    setOidcCookie(res, "nonce", nonce);
    setOidcCookie(res, "state", state);
    setOidcCookie(res, "return_to", getSafeOidcReturnTo(req.query.returnTo));
    res.redirect(redirectTo.href);
  } catch {
    res.status(503).send("Authentication is temporarily unavailable.");
  }
});

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

  const currentUrl = new URL(`${callbackUrl}?${new URL(req.url, callbackUrl).searchParams}`);
  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch {
    res.redirect("/api/login");
    return;
  }

  const claims = tokens.claims();
  if (!claims) {
    res.redirect("/api/login");
    return;
  }

  const returnTo = getSafeOidcReturnTo(req.cookies?.return_to);
  for (const name of ["code_verifier", "nonce", "state", "return_to"]) {
    res.clearCookie(name, { path: "/" });
  }

  const { user, isNew } = await upsertReplitUser(claims as unknown as Record<string, unknown>);
  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      username: user.username,
    },
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };
  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.redirect(returnTo);
});

router.get("/logout", async (req: Request, res: Response) => {
  const returnTo = getSafeOidcReturnTo(req.query.returnTo);
  await clearSession(res, getSessionId(req));
  try {
    const config = await getOidcConfig();
    const postLogoutRedirectUrl = new URL(returnTo, `${getOrigin(req)}/`).href;
    const endSessionUrl = oidc.buildEndSessionUrl(config, {
      client_id: process.env.REPL_ID!,
      post_logout_redirect_uri: postLogoutRedirectUrl,
    });
    res.redirect(endSessionUrl.href);
  } catch {
    res.redirect(returnTo);
  }
});

function currentUser(req: Request): string | undefined {
  return req.dbUser?.id;
}

function requireCurrentUser(req: Request, res: Response): string | undefined {
  const id = currentUser(req);
  if (!id) res.status(401).json({ error: "Login required" });
  return id;
}

router.get("/auth/providers", (req, res) => {
  const host = new URL(getOrigin(req)).host;
  res.json({ replit: true, clerk: false, discord: discordConfigured(), github: !!resolveGithubCreds(host) });
});

function connectRoute(provider: "discord" | "github") {
  return async (req: Request, res: Response) => {
    const returnTo = getSafeReturnTo(req.query.returnTo);
    const userId = currentUser(req);
    if (!userId) {
      res.redirect(`${returnTo}?${provider}_link_error=login_required`);
      return;
    }
    const origin = getOrigin(req);
    const state = oauthState();
    if (provider === "discord" && !discordConfigured()) {
      res.redirect(`${returnTo}?discord_link_error=unavailable`);
      return;
    }
    const githubCreds = provider === "github" ? resolveGithubCreds(new URL(origin).host) : null;
    if (provider === "github" && !githubCreds) {
      res.redirect(`${returnTo}?github_link_error=unavailable`);
      return;
    }
    setOAuthCookie(res, `${provider}_state`, state);
    setOAuthCookie(res, `${provider}_return_to`, returnTo);
    setOAuthCookie(res, `${provider}_link_user`, userId);
    const redirectUri = `${origin}/api/auth/${provider}/callback`;
    res.redirect(provider === "discord"
      ? buildDiscordAuthUrl({ redirectUri, state })
      : buildGithubAuthUrl({ redirectUri, state, creds: githubCreds! }));
  };
}

router.get("/auth/discord/connect", connectRoute("discord"));
router.get("/auth/github/connect", connectRoute("github"));

function statusRoute(provider: "discord" | "github") {
  return async (req: Request, res: Response) => {
    const userId = requireCurrentUser(req, res);
    if (!userId) return;
    const [link] = await db.select().from(accountIdentitiesTable).where(and(
      eq(accountIdentitiesTable.userId, userId), eq(accountIdentitiesTable.provider, provider),
    ));
    res.json({
      configured: provider === "discord" ? discordConfigured() : githubConfigured(new URL(getOrigin(req)).host),
      linked: !!link,
      ...(provider === "discord" ? { discordUsername: link?.providerUsername ?? null } : { githubLogin: link?.providerUsername ?? null }),
      linkedAt: link?.createdAt ?? null,
    });
  };
}
router.get("/auth/discord/status", statusRoute("discord"));
router.get("/auth/github/status", statusRoute("github"));

function disconnectRoute(provider: "discord" | "github") {
  return async (req: Request, res: Response) => {
    const userId = requireCurrentUser(req, res);
    if (!userId) return;
    await db.delete(accountIdentitiesTable).where(and(
      eq(accountIdentitiesTable.userId, userId), eq(accountIdentitiesTable.provider, provider),
    ));
    res.json({ success: true });
  };
}
router.post("/auth/discord/disconnect", disconnectRoute("discord"));
router.post("/auth/github/disconnect", disconnectRoute("github"));

async function linkCallback(provider: "discord" | "github", req: Request, res: Response): Promise<void> {
  const returnTo = getSafeReturnTo(req.cookies?.[`${provider}_return_to`]);
  const expectedState = req.cookies?.[`${provider}_state`];
  const linkUserId = req.cookies?.[`${provider}_link_user`] as string | undefined;
  for (const name of ["state", "return_to", "link_user"]) res.clearCookie(`${provider}_${name}`, { path: "/" });
  const { code, state, error } = req.query;
  if (error || typeof code !== "string" || !expectedState || state !== expectedState) {
    res.redirect(`${returnTo}?${provider}_link_error=state`);
    return;
  }
  // Clerk validates the current cookie again on this callback. The short-lived
  // state cookie alone cannot authorize linking an external identity.
  if (!linkUserId || currentUser(req) !== linkUserId) {
    res.redirect(`${returnTo}?${provider}_link_error=session`);
    return;
  }
  try {
    const origin = getOrigin(req);
    const redirectUri = `${origin}/api/auth/${provider}/callback`;
    let providerUserId: string;
    let username: string | null;
    if (provider === "discord") {
      const accessToken = await exchangeDiscordCode({ code, redirectUri });
      const profile = await fetchDiscordProfile(accessToken);
      providerUserId = String(profile.id);
      username = profile.global_name || profile.username || null;
      if (guildJoinConfigured()) await addUserToGuild({ userId: profile.id, accessToken });
    } else {
      const creds = resolveGithubCreds(new URL(origin).host);
      if (!creds) throw new Error("GitHub OAuth is not configured for this host");
      const profile = await fetchGithubProfile(await exchangeGithubCode({ code, redirectUri, creds }));
      providerUserId = String(profile.id);
      username = profile.login ?? null;
    }
    const [existing] = await db.select().from(accountIdentitiesTable).where(and(
      eq(accountIdentitiesTable.provider, provider),
      eq(accountIdentitiesTable.providerUserId, providerUserId),
    ));
    if (existing && existing.userId !== linkUserId) {
      res.redirect(`${returnTo}?${provider}_link_error=already_linked`);
      return;
    }
    if (existing) {
      await db.update(accountIdentitiesTable).set({ providerUsername: username, updatedAt: new Date() })
        .where(eq(accountIdentitiesTable.id, existing.id));
    } else {
      await db.insert(accountIdentitiesTable).values({
        userId: linkUserId, provider, providerUserId, providerUsername: username,
      });
    }
    res.redirect(`${returnTo}?${provider}_linked=1`);
  } catch (error) {
    console.error(`[Auth] ${provider} connect failed:`, error);
    res.redirect(`${returnTo}?${provider}_link_error=failed`);
  }
}

router.get("/auth/discord/callback", (req, res) => linkCallback("discord", req, res));
router.get("/auth/github/callback", (req, res) => linkCallback("github", req, res));

export default router;