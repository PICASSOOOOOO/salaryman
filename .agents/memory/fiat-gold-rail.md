---
name: Authoritative FIAT/GOLD rail
description: Canonical conversion, market-display placement, and GOLD product boundaries.
---

The canonical authored rail is **ƒ1,000 = 0.1 GOLD = $1**. FIAT remains the primary in-game currency. Net Worth is the FIAT-denominated consolidation of FIAT accounts; it must not include GOLD. Game GOLD is a savings/reserve balance for property and other major purchases, not a withdrawable token or real ounce. BTC and spot gold remain reference facts, not owned balances.

The user specifies a separate FIAT→GOLD→Credits path. GOLD→Credits carries a 10% exchange fee; Credits are spent on the browser side for eligible metered services, not on in-game purchases or subscription fees. The user says Credits connect to Stripe. Do not merge Credits into FIAT/GOLD or invent a missing GOLD:Credits rate.

**Why:** Users could not distinguish owned GOLD from market GOLD, and legacy net-worth calculations mixed cash, GOLD, and property into one misleading number. Client-owned GOLD settlement also allowed retries or forged saves to create value. The user approved ƒ1,000 = $1 for new conversion logic to align it with their recent comments, then clarified browser Credits are a distinct, Stripe-connected service-use balance.

**How to apply:** Visually separate personal finances, organization finances, and market references. Label owned GOLD as savings/reserve and market GOLD as a reference rate. Compute personal and org Net Worth from their FIAT accounts only. Keep live BTC/gold source, timestamp, freshness, and FIAT↔GOLD controls on Economy. Settle conversions through the server ledger with fixed-point tenths, expiring persisted quotes, atomic FIAT/GOLD updates, and reusable idempotency keys. Implement the separate browser Credits/Stripe usage rail only after all other requested Tower work, and do not assume its missing exchange ratio. Never add crypto deposit, withdrawal, or bank cash-out semantics to GOLD.