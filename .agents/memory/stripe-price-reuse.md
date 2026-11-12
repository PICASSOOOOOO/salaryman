---
name: Stripe feature-price reuse gotcha
description: Why bumping FEATURE_CATALOG price in code does NOT change a live SALARYMAN subscription price.
---

# Stripe subscription price won't change from code alone

`getPriceIdForFeature` (api-server `routes/stripe.ts`) resolves a feature's Stripe
price by listing the product's **active prices and using the FIRST one**. It only
creates a new price (`unit_amount = catalog.price * 100`) when the product has **no
active price**.

**Consequence:** changing `FEATURE_CATALOG[feature].price` (lib/plan.ts) updates new
checkouts only on brand-new products. For the existing PRIME product
(`prod_UO2lpELBFP84Gd`), an old active price keeps being reused, so a code bump
(e.g. $145 → $149) is silently ignored for the live subscription.

**Why:** avoids creating duplicate prices on every boot.

**How to apply:** when changing the PRIME / Pixel Agents monthly price, you MUST
also act in the Stripe dashboard — archive the stale price (or set the new price as
the only active one) on the product, or set the `FEATURE_PRICE_ENV` env var to the
desired price id. Pledge-store items and slush tiers are NOT affected — those build
inline `price_data` from `priceUsd`, so their USD values are code-authoritative.
