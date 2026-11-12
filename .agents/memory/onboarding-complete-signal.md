---
name: Onboarding-complete signal & server-authoritative gating
description: How to tell server-side whether a SALARYMAN user finished onboarding, and why per-command gates must not trust client flags.
---

# Keep game registration and browser intake signals separate

A world-registry row is the server-side signal for game registration and related
gameplay charging rules. It does not, by itself, prove that the user completed
the browser account intake required by USD-paid features. That gate requires the
browser-onboarding marker plus valid contact email and phone data, checked by
user ID.

**Why:** the Pablo command route (`/chat/pablo/command`) is shared by guests
(landing storyteller), the onboarding intake Q&A, AND the real Command Deck. An
earlier attempt exempted onboarding via a client-supplied `noCharge: true` body
flag — that was a billing-bypass hole (any signed-in user could send it to skip the
per-command ƒ fee).

**How to apply:** use registry existence for game registration and per-command
FIAT exemptions. Use the stricter browser-intake check for paid-feature access.
Never treat local tutorial state or an unrelated game row as proof of browser
onboarding; never trust a client flag to waive a charge.
