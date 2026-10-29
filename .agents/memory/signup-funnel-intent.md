---
name: Pre-onboarding signup-intent detectors
description: Signup begins only for explicit signup intent or a non-Pablo feature request; price questions stay public.
---

# Pre-onboarding signup-intent detectors (PabloTerminal funnel)

The logged-out visitor flow in `PabloTerminal.tsx` runs a `chatting` phase where intent detectors distinguish ordinary public Pablo chat from a request to use another feature and create an account.

The pure detectors live in `interview-helper/src/lib/signup-intent.ts` (`isReadyToEnter`, `isCostCurious`), extracted from the component so they're unit-testable (`signup-intent.test.ts`). Edit the lib, not an inline copy.

**Decision / rule:** Pablo chat is usable without an account. Do not collect signup details or provision an account unless the person explicitly wants a feature beyond Pablo chat or asks to sign up. Price/free-use questions are answered without starting intake; a price question alone is not consent to signup.
**Why:** the user said, “No sign up provision unless they want to use any feature that’s not Pablo chat.”
**How to apply:** preserve the public chat path for ordinary conversation and cost questions. Start name/email and authentication only after explicit signup intent or a request for a non-Pablo feature; test both sides of that boundary.

**Chatting-phase precedence (order matters):** `detectSignInIntent` (returning user → straight OAuth, runs globally first) → crosstalk → price/free-use answer without intake → `isReadyToEnter` → `wantsTool` → identity-volunteer (email/name) → public free-chat response.
