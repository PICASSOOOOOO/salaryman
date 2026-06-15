---
name: Fiat HUD refresh gate
description: How the "YOU ƒ..." HUD instant-refresh works and the traps that silently break it
---
The world HUD "YOU ƒ..." (CurrencyTicker, showPlayerFiat) reads the SERVER bank
(GET /api/economy/bank/accounts) and refreshes instantly via a window event
FIAT_CHANGED_EVENT that `apiFetch` dispatches ONLY when a mutating request path
matches the `FIAT_AFFECTING` regex in lib/api-client.ts.

**Two ways this silently breaks (both were real bugs):**
1. The regex was written against ASSUMED paths (armory, gear, pledge/buy) but the
   REAL spend endpoints are different: `/api/items/buy`, `/api/pledge/vend`,
   `/api/cosmetics/buy`. Those debit the bank via spendEarnedFiat/spendCrypto yet
   weren't matched → HUD stayed stale.
2. A call that uses raw `fetch(...)` instead of `apiFetch(...)` NEVER fires the
   event regardless of the regex. Subway fares (Subway.tsx) and bank transfer
   (Game/Bank.tsx) were raw fetch.

**Which endpoints actually move the bank readout** (server writes
player_bank_accounts.balance): economy/bank/transfer, economy/salary/claim,
items/buy, cosmetics/buy, pledge/vend, subway/travel(+travel-intercity),
chat/pablo/command, construction/:id/work (creditFiat wage).
NOT the bank (don't need coverage): *_checkout & stripe/* (Stripe real money),
billboards/:id/purchase + business-market/acquire + real-estate/acquire +
credit/plan/* (client-save g.salary / player ledger, a SEPARATE money pool).

**Guards (two complementary static scans):**
- lib/api-client.fiat-affecting.test.ts scans mutating spend-vocab *apiFetch*
  calls; each must match FIAT_AFFECTING or be in EXCUSED_NON_BANK_SPENDS.
- lib/api-client.fiat-raw-fetch.test.ts scans for the OTHER bypass — mutating
  *raw* `fetch(...)` calls (incl. `fetch(apiUrl(...))` wrappers) whose path
  matches FIAT_AFFECTING. Those skip the event entirely; each must be switched to
  apiFetch or excused in EXCUSED_RAW_FETCH (token-coincidence non-bank paths, e.g.
  twilio/call/:sid/transfer = call routing, not bank ƒ).
**Why:** the regex is the single gate and apiFetch is the single dispatcher; a
money call that skips EITHER goes stale, and neither was tied to reality before.
**How to apply:** new spend feature → use apiFetch (never raw fetch) AND ensure
its path matches FIAT_AFFECTING; if it's Stripe/client-save, add to EXCUSED list.
