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

async function upsertUser(claims: Record<string, unknown>) {
  const userData = {
    id: claims.sub as string,
    email: (claims.email as string) || null,
    firstName: (claims.first_name as string) || null,
    lastName: (claims.last_name as string) || null,
    profileImageUrl: (claims.profile_image_url || claims.picture) as
      | string
      | null,
  };

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

  if (user.email) {
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

  return user;
}

router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated() ? req.user : null,
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
