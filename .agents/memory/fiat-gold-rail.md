---
name: Authoritative FIAT/GOLD rail
description: Canonical conversion, market-display placement, and GOLD product boundaries.
---

The canonical authored rail is **ƒ100 = 0.1 GOLD = $1**. FIAT remains the primary in-game currency. Net Worth is the FIAT-denominated consolidation of FIAT accounts; it must not include GOLD. Game GOLD is a savings/reserve balance for property and other major purchases, not a withdrawable token or real ounce. BTC and spot gold remain reference facts, not owned balances.

**Why:** Users could not distinguish owned GOLD from market GOLD, and legacy net-worth calculations mixed cash, GOLD, and property into one misleading number. Client-owned GOLD settlement also allowed retries or forged saves to create value.

**How to apply:** Visually separate personal finances, organization finances, and market references. Label owned GOLD as savings/reserve and market GOLD as a reference rate. Compute personal and org Net Worth from their FIAT accounts only. Keep live BTC/gold source, timestamp, freshness, and FIAT↔GOLD controls on Economy. Settle conversions through the server ledger with fixed-point tenths, expiring persisted quotes, atomic FIAT/GOLD updates, and reusable idempotency keys. Never add crypto deposit, withdrawal, or bank cash-out semantics to GOLD.