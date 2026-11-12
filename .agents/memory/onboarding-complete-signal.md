---
name: Onboarding-complete signal & server-authoritative gating
description: How to tell server-side whether a SALARYMAN user finished onboarding, and why per-command gates must not trust client flags.
---

# "Has this user finished onboarding?" = world registry row

The authoritative server-side signal that a user completed onboarding is a row in
`worldBusinessesTable` keyed by `userId`. It's created at `POST /world/register`
(the onboarding submit step). Mid-intake users (still in the Pablo Q&A flow) have
**no** row yet, so they can be exempted from gameplay charges without a client flag.

**Why:** the Pablo command route (`/chat/pablo/command`) is shared by guests
(landing storyteller), the onboarding intake Q&A, AND the real Command Deck. An
earlier attempt exempted onboarding via a client-supplied `noCharge: true` body
flag — that was a billing-bypass hole (any signed-in user could send it to skip the
per-command ƒ fee).

**How to apply:** gate per-command / per-action FIAT charges on
`isGuest || isOwnerEmail || no worldBusinesses row` (all ride free); charge only
fully-registered non-owner players. Never trust a client flag to waive a charge —
derive exemption from server state.
