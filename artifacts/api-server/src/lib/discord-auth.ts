// Discord OAuth2 helpers. Discord is a plain OAuth2 provider (not OIDC), so we
// drive the authorization-code flow by hand instead of using openid-client.
// This lives alongside the Replit-Auth OIDC wiring in lib/auth.ts and feeds the
// same session layer (createSession / SESSION_COOKIE) so both login methods
// produce identical sessions.

export const DISCORD_API_BASE = "https://discord.com/api/v10";
export const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
export const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
export const DISCORD_USER_URL = "https://discord.com/api/users/@me";
// `guilds.join` lets us add the signed-in user to our Discord server via the
// bot, on top of the basic profile/email scopes used for login.
export const DISCORD_SCOPES = "identify email guilds.join";

export function discordConfigured(): boolean {
  return !!(
    process.env.DISCORD_OAUTH_CLIENT_ID && process.env.DISCORD_OAUTH_CLIENT_SECRET
  );
}

// Adding a user to the server requires a bot (that is a member of the target
// guild) plus the guild id, separate from the OAuth login credentials.
export function guildJoinConfigured(): boolean {
  return !!(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID);
}

export interface DiscordProfile {
  id: string;
  username: string;
  global_name?: string | null;
  email?: string | null;
  verified?: boolean;
  avatar?: string | null;
}

export function buildDiscordAuthUrl(params: {
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(DISCORD_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.DISCORD_OAUTH_CLIENT_ID!);
  url.searchParams.set("scope", DISCORD_SCOPES);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  // Let Discord re-use an existing approval silently on repeat logins.
  url.searchParams.set("prompt", "none");
  return url.toString();
}

export async function exchangeDiscordCode(params: {
  code: string;
  redirectUri: string;
}): Promise<string> {
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_OAUTH_CLIENT_ID!,
    client_secret: process.env.DISCORD_OAUTH_CLIENT_SECRET!,
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
  });

  const res = await fetch(DISCORD_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord token exchange failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Discord token response missing access_token");
  }
  return data.access_token;
}

export async function fetchDiscordProfile(
  accessToken: string,
): Promise<DiscordProfile> {
  const res = await fetch(DISCORD_USER_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord profile fetch failed: ${res.status} ${text}`);
  }

  return (await res.json()) as DiscordProfile;
}

export function discordAvatarUrl(profile: DiscordProfile): string | null {
  if (!profile.avatar) return null;
  const ext = profile.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${ext}?size=256`;
}

export type GuildJoinResult = "joined" | "already_member" | "skipped" | "failed";

// Add the user to our Discord server using the bot token + the user's OAuth
// access token (which must carry the `guilds.join` scope). The bot must be a
// member of the guild and have the "Create Instant Invite" permission.
// Returns a coarse status; callers treat this as best-effort and never block
// login on it.
export async function addUserToGuild(params: {
  userId: string;
  accessToken: string;
}): Promise<GuildJoinResult> {
  if (!guildJoinConfigured()) return "skipped";

  const guildId = process.env.DISCORD_GUILD_ID!;
  const botToken = process.env.DISCORD_BOT_TOKEN!;

  try {
    const res = await fetch(
      `${DISCORD_API_BASE}/guilds/${guildId}/members/${params.userId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_token: params.accessToken }),
      },
    );

    // 201 = added, 204 = already a member.
    if (res.status === 201) return "joined";
    if (res.status === 204) return "already_member";

    const text = await res.text();
    console.error(
      `[Auth] Discord guild join failed: ${res.status} ${text}`,
    );
    return "failed";
  } catch (err) {
    console.error(
      "[Auth] Discord guild join error:",
      err instanceof Error ? err.message : err,
    );
    return "failed";
  }
}
