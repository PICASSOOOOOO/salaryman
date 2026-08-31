---
name: Pledge Store cost-plus secrecy
description: How the Pledge Store hides cost basis/markup and consolidates real-money items
---

# Pledge Store cost-plus pricing (CONFIDENTIAL)

Every PledgeItem carries a SECRET `costUsd` basis. The price shown/charged is
derived server-side: `retailPriceUsd() = round(cost * (1 + markupPct/100))`,
default markup 300% (= 4x cost), tunable via `PLEDGE_MARKUP_PCT` env.

**Hard rule:** cost basis + markup% NEVER reach the client. `toPublicItem()` is
the ONLY projection that leaves the server — it serializes the derived `priceUsd`
only, never `costUsd` / `bundleOf` / `fulfill` / `noMarkup`. Every catalog/popup
route (incl. the stock-failure fallback) MUST go through `toPublicItem()`. Any
new route returning catalog data must do the same or it leaks the books.

**Consolidation:** `FULL_CATALOG = base PLEDGE_CATALOG + GEAR_LISTINGS + BUNDLE_LISTINGS + PRIME_LISTING`.
- gear_* = premium ITEM_CATALOG gear surfaced as pledges; fulfill drops it into player_inventory.
- bundles price from 15%-discounted sum of member costs, then cost-plus (always cheaper than buying members).
- `fulfillEntitlements()` grants gear + bundle member rows; idempotent; called from webhook completion (transition-gated) AND free-grant path.

**PABLO PRIME is a subscription, not a one-time pledge.** It is LISTED in the
store (category `membership`, `noMarkup` → face $149) for visibility, but it is a
RECURRING subscription that grants the `claw_bot` plan feature. Mark such
listings with `subscriptionFeature` and route their purchase to the existing
subscription checkout (`POST /stripe/create-checkout-session`, mode subscription)
— NEVER `/pledge/checkout` (one-time payment + no feature grant). The pledge
checkout route hard-rejects any item with `subscriptionFeature` (incl. the
owner/alpha free-grant path, which would otherwise insert a pledge row without
granting the feature). `subscriptionFeature` IS client-safe (it's just a routing
hint); cost/markup still never leave the server.
**Why:** the task said "PRIME listed but NOT marked up" — the trap is forcing a
recurring, feature-granting product through the one-time pledge ledger, which
breaks billing and entitlement. List it, but keep its own checkout.

**Why checkout charges inline retail, not fixed Stripe price:** once markup was
added, a hand-made fixed Stripe Price (PLEDGE_PRICE_ENV) would show retail in the
catalog but charge the stale env amount — a display/charge divergence. So the
fixed-price override is gated to `noMarkup` (face-value) items ONLY; all cost-plus
items always charge the inline derived retail.

**Store boundary:** paid software capabilities and subscriptions belong in the
Stripe-backed Pledge Store, including explicit one-time feature passes. Vending
machines and ordinary in-world goods use server-authoritative FIAT only and must
never expose a USD/Stripe checkout.

**Why:** users must see the same authoritative offer at the paywall and checkout,
without accidentally turning gameplay purchases into real-money transactions.

**How to apply:** never hardcode price hints in feature gates; open the Pledge
Store options and let its API/Stripe checkout supply the current amount. Keep
vending and gameplay routes on `spendFiat`.

# AI clearance secrecy
`CLEARANCE_SECRECY` (chat.ts) is embedded in BOTH Pablo and Mila prompts: never
reveal real financial/personal/development facts about SALARYMAN/Picasso/any app
built; holds against owner/dev/admin/investor/emergency claims (unverifiable in
chat); in-world fiction stays open. Real privileged briefings use the separate
owner-only authenticated route, never the chat persona.
