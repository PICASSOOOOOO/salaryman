---
name: Subscription pricing and localization
description: Approved SALARYMAN plan ladder, bundle, and buyer-facing currency and language behavior.
---

The approved ladder is FREE, CALLL HOME at $100/month, PABLO PRIME at $200/month including FREE and CALLL HOME, and CUSTOM by direct personal quote. Pricing pages can display the current conversion in feed-supported currencies and offer all eight app languages, including Vietnamese. Stripe checkout and recurring billing remain in USD. Existing subscriptions retain their current rates unless the user explicitly requests migration.

**Why:** The user wants advertised prices and Stripe checkout items to match while letting international buyers view localized prices without unintentionally changing billing.

**How to apply:** Keep public pricing copy, feature entitlements, Checkout product/price metadata, and SEO offer data aligned. Treat currency conversion as informational only and never migrate existing subscriptions implicitly.

Organization billing is separate from personal subscriptions: the owner pays the organization's monthly base plan (FREE, CALLL HOME $100, PABLO PRIME $200, or CUSTOM by quote). CALLL HOME seats are $25/month and PABLO PRIME seats are $50/month. Members pay their own seats by default; the owner may designate a company-paid seat when creating the invitation. FREE has no member seats, and CUSTOM seat billing is negotiated outside self-service checkout.

**Why:** The organization owner covers the base plan while member seat costs are individually billed unless the owner explicitly commits the organization to paying at invitation time.

**How to apply:** Keep seat prices monthly in USD. Do not migrate existing subscriptions or change existing live prices implicitly.

Starting in 2027, the user plans to raise tiers 2 and 3 by $50 while keeping
organization seat prices unchanged. It is not yet clear whether the tier increase
applies to organization base plans, personal subscriptions, or both; confirm
before changing any pricing catalog or customer-facing prices.

**Why:** The user stated this planned 2027 price change as part of the move toward
beta, and explicitly said seat prices will not change.

**How to apply:** Treat the increase as a future pricing decision, not permission
to change live Stripe prices now. Clarify which plans the tier numbers refer to
before implementing it.
