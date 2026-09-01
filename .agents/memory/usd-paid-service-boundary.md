---
name: USD paid-service boundary
description: Rules separating SALARYMAN's real-money services from gameplay purchases and user-connected tax providers.
---

Phone System and Automation Pixel Agents are separate paid products. For ordinary users, each requires its own active Stripe-backed USD entitlement. Phone must never ride inside the automation bundle.

**Why:** Third-party and cost-bearing operations cannot be unlocked by client state, unpaid checkout sessions, trials, legacy aliases, Pledge Store ownership, or in-game ƒ/GOLD. Internal owner/Picasso staff bypasses remain intentional.

**How to apply:** Enforce the entitlement on the server at every creation, activation, execution, integration, and automation boundary. Validate Stripe prices against the expected active USD monthly amount before checkout. Tax tooling requires a user-supplied tax-provider connection and is not an included SALARYMAN service.