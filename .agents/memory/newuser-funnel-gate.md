---
name: Browser authentication routing
description: Public entry, protected-route sign-in, and post-authentication return behavior.
---

Anonymous visitors can browse free product routes. Require sign-in only when a
feature needs business identity/status, a paid entitlement, or the user's saved
website data. Keep server-side authentication, ownership, and entitlement checks
in place; a generic auth failure on free browsing must not become a global gate.

When a user chooses a save action, preserve their requested destination and any
in-memory draft where possible. Do not autosave guest work to a user account.

**Why:** The user asked for free use without sign-in, with sign-in reserved for
business onboarding/status, non-free features, and saving website data.

**How to apply:** Feature-level UI prompts for auth at gated actions, with a safe
`returnTo`. Background GET 401s must not redirect globally; a feature may opt a
specific protected read in. Do not add an app-wide first-login onboarding bounce.
Keep saved/private APIs protected. Pablo is not the generic auth or Back fallback;
signed-out Back fallback is `/`.
