---
name: USD paid-service boundary
description: Rules separating SALARYMAN's real-money services, ATM Fiat exchange, and user-owned payout accounts.
---

Phone System and Automation Pixel Agents are separate paid products. For ordinary users, each requires its own active Stripe-backed USD entitlement. Phone must never ride inside the automation bundle.

Gameplay merchandise still uses the Pledge Store. Banco Ombra ATMs may also sell server-priced Fiat through Stripe Checkout, but Fiat is credited only after confirmed settlement. Cash-out uses the user's own payout account (Stripe Connect; user-level Wise may be added for international users), never a card refund or a platform-held user balance. Cash-out retains a disclosed 5% platform surcharge and must exclude seeded, loaned, promotional, or otherwise ineligible Fiat.

**Why:** Third-party and cost-bearing operations cannot be unlocked by client state, unpaid checkout sessions, trials, legacy aliases, Pledge Store ownership, or in-game ƒ/GOLD. Internal owner/Picasso staff bypasses remain intentional.

**How to apply:** Enforce entitlement and settlement on the server. Keep ATM packs server-priced, make payout destinations user-owned and payout-enabled, reserve eligible Fiat atomically, and use provider idempotency keys. Wise is per-user OAuth, not a shared workspace/provider account. Tax and payroll apps remain optional user/org connections rather than prerequisites.