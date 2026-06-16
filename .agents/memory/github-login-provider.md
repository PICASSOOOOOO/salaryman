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

**Gotcha — single callback URL:** A GitHub OAuth App allows exactly ONE
authorization callback URL. The dev domain (`*.replit.dev`) and the published
prod domain differ, so one OAuth App can't serve both — register a second app
for prod or update the callback at publish time (same constraint Discord has).
**How to apply:** when GitHub login breaks after publishing, check the OAuth
App's callback URL matches the current host first — it's almost never app code.

**Note:** NavBar's standalone "SIGN IN" calls Replit OIDC directly; the
multi-provider chooser is only the SignInPrompt component.
