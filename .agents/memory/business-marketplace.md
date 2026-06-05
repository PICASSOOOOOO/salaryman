---
name: Business Marketplace
description: SALARYMAN digital-business buy/sell/lease marketplace — settlement invariants and ownership model.
---

# Business Marketplace (/business/marketplace)

Marketplace for in-game digital businesses, modeled on the real-estate (digital property) system. NPC showroom catalog (valuation: sale = monthlyIncome×24, lease = monthlyIncome×0.45) plus player-to-player listings (sale and lease). Ownership lives in the salaryman save blob at `data.businesses[]` (carried over on routine PUT saves like office/home, or it gets clobbered). Player balance is `salaryman_saves.salary`.

## Settlement invariant (conservation of funds)
Player-to-player transfer = ONE transaction (`settleListingTransfer`): buyer debit + listing status flip + buyer ownership write + seller credit all land together or none do.
- Lock BOTH save rows `FOR UPDATE` in deterministic `(userId, slot)` order — never debit-then-credit across two transactions, and never lock in caller-order, or concurrent cross-transfers deadlock.
- Seller credit is **mandatory-or-abort**: if the seller's save row is missing at settlement, abort (409) — do NOT skip the credit, or you destroy fiat (buyer charged, no payee).
- Guard the listing flip with `WHERE id=? AND status='active' RETURNING` so concurrent buyers lose safely (409).

**Why:** an earlier version credited the seller in a separate best-effort tx and skipped the credit if no seller save existed — both are silent fund-destruction paths. Listing creation now validates the seller has a save at that slot up front so the abort path is only reachable if the seller's save was later deleted.

## Scope
Income is stored/displayed only (`monthlyIncomeFiat`); there is NO auto-payout loop wired into WorldPlay. If asked for recurring lease/income payouts, that is net-new work.
