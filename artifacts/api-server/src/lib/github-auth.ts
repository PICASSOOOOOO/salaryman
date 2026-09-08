// GitHub OAuth2 helpers. Like Discord, GitHub is a plain OAuth2 provider (not
// OIDC), so its authorization-code flow is implemented directly. It is used
// only to connect a GitHub identity to a Clerk-authenticated local account.

export const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
export const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_USER_URL = "https://api.github.com/user";
export const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";
// `read:user` for the basic profile, `user:email` so we can read the user's
// verified email addresses (the /user endpoint omits private emails).
export const GITHUB_SCOPES = "read:user user:email";

export interface GithubCreds {
  clientId: string;
  clientSecret: string;
}

// A GitHub OAuth App allows exactly ONE authorization callback URL, so the dev
// domain (*.replit.dev) and the published prod domain can't share one app. We
// therefore support a SECOND set of credentials for production
// (GITHUB_OAUTH_CLIENT_ID_PROD / _SECRET_PROD) and pick which OAuth App to use
// based on the request host. When the prod pair is absent we fall back to the
// default pair so single-app setups (dev-only) keep working unchanged.
//
// A host is treated as "development" when it is localhost or a Replit
// development domain (*.replit.dev / *.repl.co). Everything else — custom
// domains and *.replit.app deployment hosts — is treated as production.
export function isDevelopmentHost(host: string): boolean {
  const h = (host || "").toLowerCase().split(":")[0].trim();
  if (!h) return true;
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]") return true;
  if (h.endsWith(".replit.dev") || h.endsWith(".repl.co")) return true;
  return false;
}

export function resolveGithubCreds(host: string): GithubCreds | null {
  if (isDevelopmentHost(host)) {
    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
    if (clientId && clientSecret) return { clientId, clientSecret };
    return null;
  }

  // Production host: prefer the dedicated prod app, fall back to the default
  // pair so a single-app deployment still authenticates.
  const clientId =
    process.env.GITHUB_OAUTH_CLIENT_ID_PROD || process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret =
    process.env.GITHUB_OAUTH_CLIENT_SECRET_PROD ||
    process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (clientId && clientSecret) return { clientId, clientSecret };
  return null;
}

export function githubConfigured(host: string): boolean {
  return !!resolveGithubCreds(host);
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
  creds: GithubCreds;
}): string {
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set("client_id", params.creds.clientId);
  url.searchParams.set("scope", GITHUB_SCOPES);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("allow_signup", "true");
  return url.toString();
}

export async function exchangeGithubCode(params: {
  code: string;
  redirectUri: string;
  creds: GithubCreds;
}): Promise<string> {
  const body = new URLSearchParams({
    client_id: params.creds.clientId,
    client_secret: params.creds.clientSecret,
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
