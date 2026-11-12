import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { and, eq } from "drizzle-orm";
import { db, socialConnectionsTable } from "@workspace/db";
import { decryptSocialCredentials, encryptSocialCredentials } from "./social-credentials-crypto";

type OAuthProvider = "facebook" | "instagram" | "threads" | "tiktok" | "youtube";
type OAuthState = { userId: string; provider: OAuthProvider; nonce: string; issuedAt: number };
type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user_id?: string;
  open_id?: string;
  error?: string;
  error_description?: string;
};

const OAUTH_SPECS: Record<OAuthProvider, { authorizeUrl: string; scopes: string[] }> = {
  facebook: {
    authorizeUrl: "https://www.facebook.com/v22.0/dialog/oauth",
    scopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"],
  },
  instagram: {
    authorizeUrl: "https://www.facebook.com/v22.0/dialog/oauth",
    scopes: ["pages_show_list", "pages_read_engagement", "instagram_basic", "instagram_content_publish"],
  },
  threads: {
    authorizeUrl: "https://threads.net/oauth/authorize",
    scopes: ["threads_basic", "threads_content_publish"],
  },
  tiktok: {
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    scopes: ["user.info.basic", "video.publish"],
  },
  youtube: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scopes: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
    ],
  },
};

function oauthSecret(): string {
  const secret = process.env.SOCIAL_CREDENTIALS_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!secret) throw new Error("Social OAuth state signing is not configured.");
  return secret;
}

export function socialOAuthCallbackUrl(): string {
  const base = process.env.APP_BASE_URL
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
  if (!base) throw new Error("Set APP_BASE_URL before configuring social OAuth apps.");
  return `${base.replace(/\/+$/, "")}/api/social/oauth/callback`;
}

function signState(state: OAuthState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = createHmac("sha256", oauthSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyState(value: string): OAuthState | null {
  const [payload, signature, ...extra] = value.split(".");
  if (!payload || !signature || extra.length) return null;
  const expected = createHmac("sha256", oauthSecret()).update(payload).digest();
  let provided: Buffer;
  try { provided = Buffer.from(signature, "base64url"); } catch { return null; }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (!parsed.userId || !parsed.nonce || !OAUTH_SPECS[parsed.provider]) return null;
    if (!Number.isFinite(parsed.issuedAt) || Date.now() - parsed.issuedAt > 10 * 60_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isOAuthProvider(value: string): value is OAuthProvider {
  return Object.prototype.hasOwnProperty.call(OAUTH_SPECS, value);
}

export async function beginSocialOAuth(
  userId: string,
  provider: string,
  clientId: string,
  clientSecret: string,
): Promise<{ authorizationUrl: string; redirectUri: string }> {
  if (!isOAuthProvider(provider)) throw new Error("This social OAuth provider is not supported yet.");
  if (!clientId.trim() || !clientSecret.trim()) throw new Error("App ID and app secret are required.");
  const redirectUri = socialOAuthCallbackUrl();
  const nonce = randomBytes(24).toString("base64url");
  const [existing] = await db.select().from(socialConnectionsTable).where(and(
    eq(socialConnectionsTable.userId, userId),
    eq(socialConnectionsTable.provider, provider),
  ));
  const credentials = existing?.provider === provider
    ? decryptSocialCredentials(existing.credentials as Record<string, string>, userId, provider).credentials
    : {};
  const nextCredentials = { ...credentials, clientId: clientId.trim(), clientSecret: clientSecret.trim(), oauthNonce: nonce };
  const now = new Date();
  await db.insert(socialConnectionsTable).values({
    userId,
    provider,
    status: "connecting",
    credentials: encryptSocialCredentials(nextCredentials, userId, provider),
    lastError: null,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [socialConnectionsTable.userId, socialConnectionsTable.provider],
    set: {
      status: "connecting",
      credentials: encryptSocialCredentials(nextCredentials, userId, provider),
      lastError: null,
      updatedAt: now,
    },
  });

  const state = signState({ userId, provider, nonce, issuedAt: Date.now() });
  const spec = OAUTH_SPECS[provider];
  const url = new URL(spec.authorizeUrl);
  if (provider === "tiktok") url.searchParams.set("client_key", clientId.trim());
  else url.searchParams.set("client_id", clientId.trim());
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", spec.scopes.join(provider === "tiktok" ? "," : " "));
  url.searchParams.set("state", state);
  if (provider === "youtube") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  }
  return { authorizationUrl: url.toString(), redirectUri };
}

async function fetchJson(url: string, init?: RequestInit): Promise<Record<string, any>> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const data = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok || data.error) {
    throw new Error(typeof data.error_description === "string" ? data.error_description : `Provider rejected the request (${response.status}).`);
  }
  return data;
}

async function exchangeCode(provider: OAuthProvider, code: string, creds: Record<string, string>, redirectUri: string): Promise<TokenResponse> {
  if (provider === "facebook") {
    return fetchJson(`https://graph.facebook.com/v22.0/oauth/access_token?${new URLSearchParams({
      client_id: creds.clientId, client_secret: creds.clientSecret, redirect_uri: redirectUri, code,
    })}`);
  }
  if (provider === "instagram") {
    return fetchJson(`https://graph.facebook.com/v22.0/oauth/access_token?${new URLSearchParams({
      client_id: creds.clientId, client_secret: creds.clientSecret, redirect_uri: redirectUri, code,
    })}`);
  }
  if (provider === "threads") {
    return fetchJson("https://graph.threads.net/oauth/access_token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code }),
    });
  }
  if (provider === "tiktok") {
    return fetchJson("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: creds.clientId, client_secret: creds.clientSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code }),
    });
  }
  return fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code }),
  });
}

async function resolveAccount(provider: OAuthProvider, token: TokenResponse): Promise<{ handle: string; name: string; extra: Record<string, string> }> {
  const accessToken = token.access_token || "";
  if (!accessToken) throw new Error("The platform returned no access token.");
  if (provider === "facebook" || provider === "instagram") {
    const pages = await fetchJson(`https://graph.facebook.com/v22.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(accessToken)}`);
    const page = Array.isArray(pages.data) ? pages.data[0] : null;
    if (!page) throw new Error("No Facebook Page is available to publish to.");
    if (provider === "instagram" && !page.instagram_business_account?.id) {
      throw new Error("Link an Instagram Business or Creator account to a Facebook Page first.");
    }
    const account = provider === "instagram" ? page.instagram_business_account : page;
    return {
      handle: provider === "instagram" ? `@${account.username ?? account.id}` : page.name ?? page.id,
      name: provider === "instagram" ? account.username ?? "Instagram account" : page.name ?? "Facebook Page",
      extra: { accessToken: page.access_token || accessToken, pageId: String(page.id), ...(provider === "instagram" ? { instagramUserId: String(account.id) } : {}) },
    };
  }
  if (provider === "threads") {
    const profile = await fetchJson(`https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(accessToken)}`);
    return { handle: `@${profile.username ?? profile.id}`, name: profile.username ?? "Threads account", extra: { accountId: String(profile.id) } };
  }
  if (provider === "tiktok") {
    const profile = await fetchJson("https://open.tiktokapis.com/v2/user/info/?fields=open_id,username,display_name", {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const user = profile.data?.user ?? {};
    return { handle: `@${user.username ?? user.open_id ?? token.open_id ?? ""}`, name: user.display_name ?? user.username ?? "TikTok account", extra: { accountId: String(user.open_id ?? token.open_id ?? "") } };
  }
  const channels = await fetchJson("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const channel = channels.items?.[0];
  if (!channel) throw new Error("No YouTube channel was returned for this account.");
  return {
    handle: channel.snippet?.customUrl ?? channel.snippet?.title ?? channel.id,
    name: channel.snippet?.title ?? "YouTube channel",
    extra: { accountId: String(channel.id) },
  };
}

export async function completeSocialOAuth(stateValue: string, code: string): Promise<{ provider: string; userId: string }> {
  const state = verifyState(stateValue);
  if (!state) throw new Error("OAuth state is invalid or expired.");
  const [row] = await db.select().from(socialConnectionsTable).where(and(
    eq(socialConnectionsTable.userId, state.userId),
    eq(socialConnectionsTable.provider, state.provider),
  ));
  if (!row || row.provider !== state.provider) throw new Error("Social connection setup was not found.");
  const decoded = decryptSocialCredentials(row.credentials as Record<string, string>, state.userId, state.provider);
  const creds = decoded.credentials;
  if (!creds.oauthNonce || creds.oauthNonce !== state.nonce) throw new Error("OAuth state has already been used.");
  delete creds.oauthNonce;
  await db.update(socialConnectionsTable).set({
    status: "connecting",
    credentials: encryptSocialCredentials(creds, state.userId, state.provider),
    updatedAt: new Date(),
  }).where(eq(socialConnectionsTable.id, row.id));

  try {
    const redirectUri = socialOAuthCallbackUrl();
    const token = await exchangeCode(state.provider, code, creds, redirectUri);
    const account = await resolveAccount(state.provider, token);
    const credentials = {
      ...creds,
      accessToken: token.access_token || "",
      ...account.extra,
      ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      ...(token.expires_in ? { expiresAtMs: String(Date.now() + token.expires_in * 1000) } : {}),
    };
    await db.update(socialConnectionsTable).set({
      status: "connected",
      accountHandle: account.handle,
      accountName: account.name,
      credentials: encryptSocialCredentials(credentials, state.userId, state.provider),
      expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
      connectedAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    }).where(eq(socialConnectionsTable.id, row.id));
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "OAuth connection failed.";
    await db.update(socialConnectionsTable).set({ status: "error", lastError: message, updatedAt: new Date() })
      .where(eq(socialConnectionsTable.id, row.id));
    throw error;
  }
  return { provider: state.provider, userId: state.userId };
}

export async function failSocialOAuth(stateValue: string): Promise<void> {
  const state = verifyState(stateValue);
  if (!state) return;
  const [row] = await db.select().from(socialConnectionsTable).where(and(
    eq(socialConnectionsTable.userId, state.userId),
    eq(socialConnectionsTable.provider, state.provider),
  ));
  if (!row || row.provider !== state.provider) return;
  const decoded = decryptSocialCredentials(row.credentials as Record<string, string>, state.userId, state.provider);
  if (decoded.credentials.oauthNonce !== state.nonce) return;
  delete decoded.credentials.oauthNonce;
  await db.update(socialConnectionsTable).set({
    status: "error",
    credentials: encryptSocialCredentials(decoded.credentials, state.userId, state.provider),
    lastError: "Authorization was declined by the platform.",
    updatedAt: new Date(),
  }).where(eq(socialConnectionsTable.id, row.id));
}
