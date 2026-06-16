---
name: GitHub login provider
description: How "Sign in with GitHub" links accounts and its single-callback-URL gotcha
---

GitHub is a third login provider alongside Replit OIDC + Discord, built as a
plain OAuth2 flow mirroring the Discord pattern.

**Verified-email-only linking (fail closed):** GitHub's `/user` endpoint omits
private emails and its `email` field is not guaranteed verified, so account
linking trusts ONLY a verified primary from `/user/emails`. When none is
available (or the lookup fails) it falls back to a stable `github:<id>` account
rather than linking to an unverified address.
**Why:** linking on an unverified/attacker-controlled email would hijack an
existing account. **How to apply:** never reintroduce a `profile.email`
fallback into the linking path.

**Gotcha — single callback URL (now handled by two apps):** A GitHub OAuth App
allows exactly ONE authorization callback URL, so dev (`*.replit.dev`) and the
published prod host can't share one app. SOLVED via host-aware credential
selection in `lib/github-auth.ts`: `resolveGithubCreds(host)` returns the default
`GITHUB_OAUTH_CLIENT_ID/_SECRET` for dev hosts (localhost / *.replit.dev /
*.repl.co) and prefers `GITHUB_OAUTH_CLIENT_ID_PROD/_SECRET_PROD` for production
hosts (falling back to the default pair when prod is unset). `buildGithubAuthUrl`
/ `exchangeGithubCode` take resolved creds; routes call `resolveGithubCreds(new
URL(getOrigin(req)).host)`. **How to apply:** when GitHub login breaks after
publishing, first confirm the PROD OAuth App's callback is
`https://<prod-host>/api/auth/github/callback` and the `*_PROD` secrets are set —
it's almost never app code. (Same two-app pattern still TODO for Discord.)

**Note:** NavBar's standalone "SIGN IN" calls Replit OIDC directly; the
multi-provider chooser is only the SignInPrompt component.
