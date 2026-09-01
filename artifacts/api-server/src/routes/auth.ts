import crypto from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, accountIdentitiesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
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

function getOrigin(req: Request): string {
  const proto = ((req.headers["x-forwarded-proto"] as string) || "https").split(",")[0].trim();
  const host = ((req.headers["x-forwarded-host"] as string) || req.headers.host || "localhost").split(",")[0].trim();
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
  res.json({ replit: false, clerk: true, discord: discordConfigured(), github: !!resolveGithubCreds(host) });
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