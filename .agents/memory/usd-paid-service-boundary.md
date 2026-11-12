---
name: USD paid-service boundary
description: Rules separating SALARYMAN's real-money services, ATM Fiat exchange, and user-owned payout accounts.
---

Phone System and Automation Pixel Agents remain separate paid products. For ordinary users, each requires its own active Stripe-backed USD subscription entitlement. Phone must never ride inside the automation bundle. Separately, browser Credits may meter eligible per-use AI, phone/test-call, SMS, or campaign operations regardless of subscription status; Credits do not pay or discount subscription fees and are not for game purchases.

Gameplay merchandise still uses the Pledge Store. Banco Ombra ATMs may also sell server-priced Fiat through Stripe Checkout, but Fiat is credited only after confirmed settlement. Cash-out uses the user's own payout account (Stripe Connect; user-level Wise may be added for international users), never a card refund or a platform-held user balance. Cash-out retains a disclosed 5% platform surcharge and must exclude seeded, loaned, promotional, or otherwise ineligible Fiat.

**Why:** Third-party and cost-bearing operations cannot be unlocked by client state, unpaid checkout sessions, trials, legacy aliases, Pledge Store ownership, or in-game ƒ/GOLD subscription entitlements. The user separately wants Stripe-connected browser Credits for eligible metered usage, implemented only after the other Tower work.

**How to apply:** Enforce subscription entitlements and Credit usage settlement separately on the server. Implement the Credit rail last, after the requested Tower work; never let Credits satisfy subscription fees. Keep ATM packs server-priced, make payout destinations user-owned and payout-enabled, reserve eligible Fiat atomically, and use provider idempotency keys. Wise is per-user OAuth, not a shared workspace/provider account. Tax and payroll apps remain optional user/org connections rather than prerequisites.