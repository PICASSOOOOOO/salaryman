---
name: Production login & /pablo front door
description: Why "can't log in on production" reports usually aren't an auth bug — domain + missing front-door button.
---

# Production login reality

- **Production runs on a CUSTOM domain `picassoo.app`**, not `salaryman.replit.app` (the .replit.app serves the app but the app redirects to picassoo.app). Always debug login against `picassoo.app`.
- Replit Auth OIDC **accepts the custom-domain redirect_uri** (`https://picassoo.app/api/callback`). Verified: `https://picassoo.app/api/login` → 302 replit.com/oidc, and following that authorize URL returns `303 → /oidc/login/...` (the real login page), NOT a redirect_uri error. So custom-domain authorization is NOT the failure mode — don't chase it.
- Login mechanism is correct end-to-end: `useAuth().login()` and the PabloTerminal "STEP INSIDE" modal both do a full-page `window.location.href = "/api/login?returnTo=..."` (server route), never a client-side `navigate()`.

# The real "can't log in" cause: no visible button on the front door

- `/pablo` (PabloTerminal) is the universal logged-out landing AND a FULLSCREEN_ROUTE, so the NavBar (which holds the login button) is **hidden**. Anonymous users are also locked to `/pablo` (ANON_ALLOWED_PREFIXES).
- Result: the only built-in way to sign in was to *type* "log in" to the Pablo chat (detectSignInIntent → setAuthChoice modal). A returning user sees no Log In button → "I click Log In and nothing happens."
- **Fix applied:** a visible SIGN IN button in the PabloTerminal header, gated `!isLoading && !isAuthenticated`, that calls `setAuthChoice({dest:'/immigration', hint:null})` — reusing the existing Replit+Discord modal so the OAuth path is identical/tested.
- **Why:** front-door auth discoverability, not a backend/OIDC defect. If a similar report recurs, confirm symptom + check the front door has a visible affordance before touching auth code.
