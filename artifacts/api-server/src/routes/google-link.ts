import { Router, type Request, type Response } from "express";
import { db, userGoogleLinksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

const router = Router();

function requireAuth(req: Request, res: Response): req is Request & { user: Express.User } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

const DEFAULT_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

// In-memory pending OAuth states (state -> { userId, createdAt })
const pendingStates = new Map<string, { userId: string; createdAt: number }>();
function purgeOldStates() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of pendingStates) if (v.createdAt < cutoff) pendingStates.delete(k);
}

function getRedirectUri(req: { protocol: string; get: (h: string) => string | undefined }) {
  const explicit = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (explicit) return explicit;
  const host = req.get("host");
  return `https://${host}/api/google/callback`;
}

router.get("/me/google", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const [link] = await db.select().from(userGoogleLinksTable).where(eq(userGoogleLinksTable.userId, userId)).limit(1);
  if (!link) {
    res.json({ configured: false, linked: false });
    return;
  }
  res.json({
    configured: true,
    linked: !!link.refreshToken,
    googleEmail: link.googleEmail,
    scope: link.scope,
    linkedAt: link.linkedAt,
    hasClientId: !!link.clientId,
  });
});

router.put("/me/google/credentials", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const { clientId, clientSecret } = (req.body ?? {}) as { clientId?: string; clientSecret?: string };
  if (!clientId || !clientSecret) {
    res.status(400).json({ error: "clientId and clientSecret are required" });
    return;
  }
  const cleanId = String(clientId).trim();
  const cleanSecret = String(clientSecret).trim();
  if (cleanId.length < 10 || cleanSecret.length < 10) {
    res.status(400).json({ error: "Credentials look invalid" });
    return;
  }

  const [existing] = await db.select().from(userGoogleLinksTable).where(eq(userGoogleLinksTable.userId, userId)).limit(1);
  if (existing) {
    const credsChanged = existing.clientId !== cleanId || existing.clientSecret !== cleanSecret;
    await db.update(userGoogleLinksTable)
      .set({
        clientId: cleanId,
        clientSecret: cleanSecret,
        updatedAt: new Date(),
        ...(credsChanged ? {
          accessToken: null,
          refreshToken: null,
          scope: null,
          googleEmail: null,
          expiresAt: null,
          linkedAt: null,
        } : {}),
      })
      .where(eq(userGoogleLinksTable.userId, userId));
  } else {
    await db.insert(userGoogleLinksTable).values({
      userId,
      clientId: cleanId,
      clientSecret: cleanSecret,
    });
  }
  res.json({ ok: true });
});

router.get("/me/google/auth-url", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const [link] = await db.select().from(userGoogleLinksTable).where(eq(userGoogleLinksTable.userId, userId)).limit(1);
  if (!link) {
    res.status(400).json({ error: "Save your Google OAuth credentials first" });
    return;
  }
  purgeOldStates();
  const state = randomBytes(24).toString("hex");
  pendingStates.set(state, { userId, createdAt: Date.now() });
  const redirectUri = getRedirectUri(req);
  const params = new URLSearchParams({
    client_id: link.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: DEFAULT_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  res.json({ url: `${GOOGLE_AUTH_URL}?${params.toString()}`, redirectUri });
});

router.get("/google/callback", async (req, res) => {
  const { code, state, error: oauthError } = req.query as { code?: string; state?: string; error?: string };
  if (oauthError) {
    res.status(400).send(renderHtml(`Google reported an error: <b>${escapeHtml(oauthError)}</b>`, false));
    return;
  }
  if (!code || !state) {
    res.status(400).send(renderHtml("Missing code or state.", false));
    return;
  }
  purgeOldStates();
  const pending = pendingStates.get(state);
  if (!pending) {
    res.status(400).send(renderHtml("OAuth session expired or invalid. Please try again.", false));
    return;
  }
  pendingStates.delete(state);

  const [link] = await db.select().from(userGoogleLinksTable).where(eq(userGoogleLinksTable.userId, pending.userId)).limit(1);
  if (!link) {
    res.status(400).send(renderHtml("No Google credentials on file. Save them and try again.", false));
    return;
  }

  const redirectUri = getRedirectUri(req);
  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: link.clientId,
        client_secret: link.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[Google OAuth] token exchange failed:", errText);
      res.status(400).send(renderHtml(`Google rejected the token exchange. Check your client ID/secret and redirect URI.<br><pre>${escapeHtml(errText.slice(0, 500))}</pre>`, false));
      return;
    }
    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    };

    let googleEmail: string | null = null;
    if (tokenJson.access_token) {
      try {
        const userinfoRes = await fetch(GOOGLE_USERINFO_URL, {
          headers: { Authorization: `Bearer ${tokenJson.access_token}` },
        });
        if (userinfoRes.ok) {
          const info = (await userinfoRes.json()) as { email?: string };
          googleEmail = info.email ?? null;
        }
      } catch (err) {
        console.error("[Google OAuth] userinfo fetch failed:", err);
      }
    }

    const expiresAt = tokenJson.expires_in
      ? new Date(Date.now() + tokenJson.expires_in * 1000)
      : null;

    await db.update(userGoogleLinksTable)
      .set({
        accessToken: tokenJson.access_token ?? null,
        refreshToken: tokenJson.refresh_token ?? link.refreshToken,
        scope: tokenJson.scope ?? null,
        googleEmail,
        expiresAt,
        linkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(userGoogleLinksTable.userId, pending.userId));

    res.send(renderHtml(`Successfully linked <b>${escapeHtml(googleEmail ?? "your Google account")}</b>. You can close this window.`, true));
  } catch (err: any) {
    console.error("[Google OAuth] callback error:", err);
    res.status(500).send(renderHtml(`Unexpected error: ${escapeHtml(err?.message ?? String(err))}`, false));
  }
});

router.delete("/me/google", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  await db.delete(userGoogleLinksTable).where(eq(userGoogleLinksTable.userId, userId));
  res.json({ ok: true });
});

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function renderHtml(message: string, success: boolean) {
  const color = success ? "#10b981" : "#ef4444";
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Google Link</title>
<style>
body{margin:0;background:#fffaf0;color:#050505;font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100dvh;padding:24px}
.card{max-width:520px;border:2px solid #050505;background:#fffaf0;padding:28px;border-radius:16px}
h1{color:#050505;margin:0 0 12px;letter-spacing:.08em;font-size:16px}
p{font-size:14px;line-height:1.5}
pre{background:#f4ead8;padding:8px;overflow:auto;font-size:11px;color:#050505}
button{margin-top:16px;background:#050505;border:1px solid #050505;color:#fffaf0;padding:12px 18px;min-height:44px;letter-spacing:.08em;font-size:12px;cursor:pointer;font-family:inherit}
</style></head>
<body><div class="card">
<h1>${success ? "GOOGLE LINKED" : "LINK FAILED"}</h1>
<p>${message}</p>
<button onclick="window.close()">CLOSE</button>
</div>
<script>try{window.opener&&window.opener.postMessage({type:'salaryman:google-linked',success:${success}}, '*')}catch(e){}</script>
</body></html>`;
}

export default router;
