// GitHub OAuth2 helpers. Like Discord, GitHub is a plain OAuth2 provider (not
// OIDC), so we drive the authorization-code flow by hand instead of using
// openid-client. This mirrors lib/discord-auth.ts and feeds the same session
// layer (createSession / SESSION_COOKIE) so all login methods produce identical
// sessions.

export const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
export const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_USER_URL = "https://api.github.com/user";
export const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";
// `read:user` for the basic profile, `user:email` so we can read the user's
// verified email addresses (the /user endpoint omits private emails).
export const GITHUB_SCOPES = "read:user user:email";

export function githubConfigured(): boolean {
  return !!(
    process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET
  );
}

export interface GithubProfile {
  id: number;
  login: string;
  name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

export function buildGithubAuthUrl(params: {
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set("client_id", process.env.GITHUB_OAUTH_CLIENT_ID!);
  url.searchParams.set("scope", GITHUB_SCOPES);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("allow_signup", "true");
  return url.toString();
}

export async function exchangeGithubCode(params: {
  code: string;
  redirectUri: string;
}): Promise<string> {
  const body = new URLSearchParams({
    client_id: process.env.GITHUB_OAUTH_CLIENT_ID!,
    client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET!,
    code: params.code,
    redirect_uri: params.redirectUri,
  });

  // GitHub returns form-encoded by default; ask for JSON.
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub token exchange failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) {
    throw new Error(
      `GitHub token response missing access_token${data.error ? `: ${data.error}` : ""}`,
    );
  }
  return data.access_token;
}

function githubHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    // GitHub requires a User-Agent on all API requests.
    "User-Agent": "salaryman-app",
  };
}

export async function fetchGithubProfile(
  accessToken: string,
): Promise<GithubProfile> {
  const res = await fetch(GITHUB_USER_URL, {
    headers: githubHeaders(accessToken),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub profile fetch failed: ${res.status} ${text}`);
  }

  return (await res.json()) as GithubProfile;
}

interface GithubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility?: string | null;
}

// Resolve the user's best email: the primary verified address if present,
// otherwise any verified address. Returns null when none is usable so callers
// fall back to a `github:`-prefixed account (mirrors the Discord-without-email
// path). Best-effort — a failure here shouldn't block login.
export async function fetchGithubPrimaryEmail(
  accessToken: string,
): Promise<string | null> {
  try {
    const res = await fetch(GITHUB_EMAILS_URL, {
      headers: githubHeaders(accessToken),
    });
    if (!res.ok) return null;

    const emails = (await res.json()) as GithubEmail[];
    if (!Array.isArray(emails)) return null;

    const primary = emails.find((e) => e.primary && e.verified);
    if (primary) return primary.email;

    const anyVerified = emails.find((e) => e.verified);
    return anyVerified ? anyVerified.email : null;
  } catch {
    return null;
  }
}

export function githubAvatarUrl(profile: GithubProfile): string | null {
  return profile.avatar_url || null;
}
