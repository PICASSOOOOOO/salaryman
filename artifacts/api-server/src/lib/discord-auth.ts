// Discord OAuth2 helpers. Discord is a plain OAuth2 provider (not OIDC), so we
// drive the authorization-code flow by hand. This provider is used only for
// connecting a Discord identity to an already Clerk-authenticated account.
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

// Auto-assigning the moderator role additionally needs the role id.
export function modRoleConfigured(): boolean {
  return guildJoinConfigured() && !!process.env.DISCORD_MOD_ROLE_ID;
}

// Auto-assigning the admin/staff role (sits above the moderator role in the
// hierarchy) additionally needs the admin role id.
export function adminRoleConfigured(): boolean {
  return guildJoinConfigured() && !!process.env.DISCORD_ADMIN_ROLE_ID;
}

// Public invite link to the Discord server. After an opt-in Discord sign-in we
// redirect the user straight here so they land in "SALARYMAN /// MINX CITY".
// Returns null when unset so callers can fall back to their normal returnTo.
export function guildInviteUrl(): string | null {
  return process.env.DISCORD_GUILD_INVITE_URL || null;
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
  // NOTE: do NOT set prompt=none here. prompt=none tells Discord to skip its
  // approval screen and return an error for any user who has not already
  // authorized the app, which dead-ends every first-time login. Omitting it
  // lets first-time users see the normal consent screen and re-auth stays
  // effectively silent for users who have already approved.
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

export type GuildRoleResult = "assigned" | "skipped" | "failed";

// Assign a configured role to a guild member via the bot. Supports:
//   "moderator" — DISCORD_MOD_ROLE_ID (alpha testers)
//   "admin"     — DISCORD_ADMIN_ROLE_ID (Picasso org admins, above moderator)
// Best-effort: returns "skipped" when not configured. The member must already
// be in the guild, the bot needs Manage Roles, and the bot's highest role
// must sit above the target role.
export async function assignGuildRole(params: {
  userId: string;
  role: "moderator" | "admin";
}): Promise<GuildRoleResult> {
  const configured = params.role === "admin" ? adminRoleConfigured() : modRoleConfigured();
  if (!configured) return "skipped";

  const guildId = process.env.DISCORD_GUILD_ID!;
  const botToken = process.env.DISCORD_BOT_TOKEN!;
  const roleId = params.role === "admin"
    ? process.env.DISCORD_ADMIN_ROLE_ID!
    : process.env.DISCORD_MOD_ROLE_ID!;

  try {
    const res = await fetch(
      `${DISCORD_API_BASE}/guilds/${guildId}/members/${params.userId}/roles/${roleId}`,
      { method: "PUT", headers: { Authorization: `Bot ${botToken}` } },
    );
    if (res.status === 204) return "assigned";
    const text = await res.text();
    console.error(`[Auth] Discord role assign failed: ${res.status} ${text}`);
    return "failed";
  } catch (err) {
    console.error(
      "[Auth] Discord role assign error:",
      err instanceof Error ? err.message : err,
    );
    return "failed";
  }
}

export type GuildRoleRemoveResult = "removed" | "not_member" | "skipped" | "failed";

// Remove a configured role from a guild member via the bot. Supports:
//   "moderator" — DISCORD_MOD_ROLE_ID (alpha testers)
//   "admin"     — DISCORD_ADMIN_ROLE_ID (Picasso org admins)
// Best-effort: returns "skipped" when not configured and "not_member" if the
// user already left the guild. The bot needs the Manage Roles permission and
// its highest role must sit above the target role.
export async function removeGuildRole(params: {
  userId: string;
  role: "moderator" | "admin";
}): Promise<GuildRoleRemoveResult> {
  const configured = params.role === "admin" ? adminRoleConfigured() : modRoleConfigured();
  if (!configured) return "skipped";

  const guildId = process.env.DISCORD_GUILD_ID!;
  const botToken = process.env.DISCORD_BOT_TOKEN!;
  const roleId = params.role === "admin"
    ? process.env.DISCORD_ADMIN_ROLE_ID!
    : process.env.DISCORD_MOD_ROLE_ID!;

  try {
    const res = await fetch(
      `${DISCORD_API_BASE}/guilds/${guildId}/members/${params.userId}/roles/${roleId}`,
      { method: "DELETE", headers: { Authorization: `Bot ${botToken}` } },
    );
    if (res.status === 204) return "removed";
    // 404 = the user isn't a guild member (already left) — nothing to do.
    if (res.status === 404) return "not_member";
    const text = await res.text();
    console.error(`[Auth] Discord role remove failed: ${res.status} ${text}`);
    return "failed";
  } catch (err) {
    console.error(
      "[Auth] Discord role remove error:",
      err instanceof Error ? err.message : err,
    );
    return "failed";
  }
}
