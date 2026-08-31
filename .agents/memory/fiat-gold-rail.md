---
name: Authoritative FIAT/GOLD rail
description: Canonical conversion, market-display placement, and GOLD product boundaries.
---

The canonical authored rail is **ƒ100 = 0.1 GOLD = $1**. FIAT remains the primary in-game currency. BTC is a live market reference shown as the amount worth $1; spot gold is reference data, while game GOLD is an in-game wealth measure rather than a token or ounce that users can withdraw.

**Why:** Detailed live/changing market information elsewhere cluttered the game and made conflicting fixed legends look authoritative. Client-owned GOLD settlement also allowed retries or forged saves to create value.

**How to apply:** Keep live BTC/gold source, timestamp, freshness, balances, and FIAT↔GOLD controls on the Economy page. Outside Economy, show money only where a transaction needs it (USD in Pledge Store, FIAT in vending). Settle conversions through the server ledger with fixed-point tenths, expiring persisted quotes, atomic FIAT/GOLD updates, and reusable idempotency keys. Never add crypto deposit, withdrawal, or bank cash-out semantics to GOLD.