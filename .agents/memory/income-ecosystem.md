---
name: Extensible income ecosystem
description: Product rule for scaling skyscraper work and connected-service income without hard-coding thousands of separate jobs.
---

SALARYMAN should expose a dense, extensible income ecosystem for individuals and organizations. Connections belong to the individual or organization using them. Connected services may create verified work, sales, payroll, or settlement opportunities, but must never share one platform account across users.

The skyscraper is intentionally enough space for a large economy: offices, support desks, repairs, maintenance, logistics, media, education, food, medical, automation, finance, construction, renovation, decoration, property management, renting, and sales can combine floors, skills, shifts, orgs, provider adapters, and opportunity templates into thousands of valid income paths.

**Why:** The product must give users many legitimate ways to earn instead of passive Fiat, fictional-business income, or a tiny fixed job list. Provider connections should widen opportunity access without making one payroll app mandatory.

**How to apply:** Build reusable opportunity types and provider adapters. Verify fulfillment server-side, settle earnings through the authoritative Fiat ledger, route debtor earnings to Banco Ombra first, and keep Stripe/Wise/payroll connections scoped to the user or org that authorized them.

## Bot-income payout authorization
Real-money payout from bot-generated business income is optional per organization and controlled only by that organization's owner. Employees and other members cannot enable it, request payout, or receive the organization's bot-income settlement; they must start and own their own business to use this feature. This rule is specific to business bot-income payouts and does not redefine ordinary payroll.

**Why:** the user explicitly required secure, optional owner control and said employees must start their own business to use real payout.

**How to apply:** resolve `organizations.ownerUserId` on the server for every setup, balance, and payout operation; do not treat a manager permission or client-supplied owner ID as sufficient. Keep new income domains opt-in, require server-verified settled earnings, and never derive cashable value from game currency, AI output, or activity logs.