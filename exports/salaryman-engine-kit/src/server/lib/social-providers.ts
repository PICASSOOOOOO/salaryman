// ─── Social providers ────────────────────────────────────────────────────────
// Real connection + publish layer behind the Marketing Command Center. Each
// platform is a provider with a common interface. Providers fall into two camps:
//   • credential/webhook providers (Bluesky, Discord) — the user pastes a secret
//     and we can verify + post for real RIGHT NOW, no platform review needed.
//   • OAuth providers (X, LinkedIn, Meta FB/IG/Threads, TikTok, YouTube) — need
//     the OWNER to register a platform app (env secrets) and go through review
//     before posting is allowed. Until configured they report `needs_app_config`.
// Every outbound fetch is wrapped with an AbortSignal timeout.

export type ProviderAuthType = "app_password" | "webhook" | "oauth";

export interface CredentialField {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder?: string;
}

export interface ProviderPublishInput {
  content: string;
  hashtags?: string[];
  mediaUrls?: string[];
}

export interface ProviderPublishResult {
  ok: boolean;
  externalId?: string;
  url?: string;
  error?: string;
}

export interface ProviderVerifyResult {
  ok: boolean;
  accountHandle?: string;
  accountName?: string;
  error?: string;
}

export interface SocialProviderDef {
  id: string;
  label: string;
  authType: ProviderAuthType;
  /** True if connectable today without platform review (credential/webhook). */
  available: boolean;
  /** OAuth providers need the owner's platform app credentials in env. */
  requiresAppConfig: boolean;
  appConfigEnv?: string[];
  credentialFields: CredentialField[];
  connectHint: string;
  charLimit?: number;
  verify?(creds: Record<string, string>): Promise<ProviderVerifyResult>;
  publish?(creds: Record<string, string>, input: ProviderPublishInput): Promise<ProviderPublishResult>;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 12000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function composeText(input: ProviderPublishInput, limit?: number): string {
  const tags = (input.hashtags ?? [])
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");
  let text = [input.content?.trim(), tags].filter(Boolean).join("\n\n");
  if (limit && text.length > limit) text = text.slice(0, limit - 1).trimEnd() + "…";
  return text;
}

// ─── Bluesky (AT Protocol — app password) ────────────────────────────────────
const BSKY_BASE = "https://bsky.social/xrpc";

async function blueskySession(identifier: string, password: string) {
  const r = await fetchWithTimeout(`${BSKY_BASE}/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (!r.ok) return null;
  return (await r.json()) as { accessJwt: string; did: string; handle: string };
}

const bluesky: SocialProviderDef = {
  id: "bluesky",
  label: "Bluesky",
  authType: "app_password",
  available: true,
  requiresAppConfig: false,
  charLimit: 300,
  credentialFields: [
    { key: "identifier", label: "Handle or email", type: "text", placeholder: "you.bsky.social" },
    { key: "appPassword", label: "App password", type: "password", placeholder: "xxxx-xxxx-xxxx-xxxx" },
  ],
  connectHint: "In Bluesky → Settings → App Passwords, create one and paste it here.",
  async verify(creds) {
    const session = await blueskySession(creds.identifier, creds.appPassword);
    if (!session) return { ok: false, error: "Bluesky rejected those credentials." };
    return { ok: true, accountHandle: session.handle, accountName: session.handle };
  },
  async publish(creds, input) {
    const session = await blueskySession(creds.identifier, creds.appPassword);
    if (!session) return { ok: false, error: "Bluesky auth failed." };
    const text = composeText(input, this.charLimit);
    const r = await fetchWithTimeout(`${BSKY_BASE}/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session.accessJwt}` },
      body: JSON.stringify({
        repo: session.did,
        collection: "app.bsky.feed.post",
        record: { $type: "app.bsky.feed.post", text, createdAt: new Date().toISOString() },
      }),
    });
    if (!r.ok) return { ok: false, error: `Bluesky post failed (${r.status}).` };
    const data = (await r.json()) as { uri: string };
    const rkey = data.uri?.split("/").pop();
    return {
      ok: true,
      externalId: data.uri,
      url: rkey ? `https://bsky.app/profile/${session.handle}/post/${rkey}` : undefined,
    };
  },
};

// ─── Discord (channel webhook) ───────────────────────────────────────────────
const DISCORD_WEBHOOK_RE = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+/;

const discord: SocialProviderDef = {
  id: "discord",
  label: "Discord",
  authType: "webhook",
  available: true,
  requiresAppConfig: false,
  charLimit: 2000,
  credentialFields: [
    { key: "webhookUrl", label: "Channel webhook URL", type: "password", placeholder: "https://discord.com/api/webhooks/..." },
  ],
  connectHint: "In Discord → Server Settings → Integrations → Webhooks, create one and copy its URL.",
  async verify(creds) {
    if (!DISCORD_WEBHOOK_RE.test(creds.webhookUrl || "")) return { ok: false, error: "That doesn't look like a Discord webhook URL." };
    const r = await fetchWithTimeout(creds.webhookUrl, {}, 10000);
    if (!r.ok) return { ok: false, error: `Webhook check failed (${r.status}).` };
    const data = (await r.json().catch(() => null)) as { name?: string } | null;
    return { ok: true, accountHandle: data?.name ?? "Discord channel", accountName: data?.name ?? "Discord channel" };
  },
  async publish(creds, input) {
    if (!DISCORD_WEBHOOK_RE.test(creds.webhookUrl || "")) return { ok: false, error: "Invalid Discord webhook URL." };
    const content = composeText(input, (this.charLimit ?? 2000) - 100);
    const r = await fetchWithTimeout(`${creds.webhookUrl}?wait=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: content || "(no content)" }),
    });
    if (!r.ok) return { ok: false, error: `Discord post failed (${r.status}).` };
    const data = (await r.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, externalId: data?.id };
  },
};

// ─── OAuth providers (need owner app config + platform review) ────────────────
function oauthProvider(
  id: string,
  label: string,
  appConfigEnv: string[],
  charLimit: number,
  connectHint: string,
): SocialProviderDef {
  return {
    id,
    label,
    authType: "oauth",
    available: false,
    requiresAppConfig: true,
    appConfigEnv,
    charLimit,
    credentialFields: [],
    connectHint,
  };
}

const oauthProviders: SocialProviderDef[] = [
  oauthProvider("twitter", "X (Twitter)", ["TWITTER_CLIENT_ID", "TWITTER_CLIENT_SECRET"], 280,
    "Needs an X developer app (paid Basic tier) with read+write. Owner adds the keys, then connect via OAuth."),
  oauthProvider("linkedin", "LinkedIn", ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"], 3000,
    "Needs a LinkedIn app approved for 'Share on LinkedIn' (w_member_social). Owner adds the keys, then connect."),
  oauthProvider("facebook", "Facebook", ["META_APP_ID", "META_APP_SECRET"], 5000,
    "Needs a Meta app with pages_manage_posts (App Review) and a linked Facebook Page."),
  oauthProvider("instagram", "Instagram", ["META_APP_ID", "META_APP_SECRET"], 2200,
    "Needs a Meta app with instagram_content_publish (App Review) and an IG Business/Creator account."),
  oauthProvider("threads", "Threads", ["META_APP_ID", "META_APP_SECRET"], 500,
    "Needs the Meta Threads API enabled on your app, then connect via OAuth."),
  oauthProvider("tiktok", "TikTok", ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"], 2200,
    "Needs a TikTok app approved for the Content Posting API (audited). Owner adds the keys, then connect."),
  oauthProvider("youtube", "YouTube", ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"], 5000,
    "Needs a Google Cloud project with the YouTube Data API and a verified OAuth consent screen."),
];

export const SOCIAL_PROVIDERS: SocialProviderDef[] = [bluesky, discord, ...oauthProviders];

const PROVIDER_MAP = new Map(SOCIAL_PROVIDERS.map((p) => [p.id, p]));

export function getProvider(id: string): SocialProviderDef | undefined {
  return PROVIDER_MAP.get(id);
}

/** OAuth provider is usable only once the owner's platform app secrets exist. */
export function isProviderConfigured(p: SocialProviderDef): boolean {
  if (p.authType !== "oauth") return true;
  return (p.appConfigEnv ?? []).every((env) => !!process.env[env]);
}
