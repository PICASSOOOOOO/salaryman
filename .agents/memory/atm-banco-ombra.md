---
name: ATM network + BANCO OMBRA wallet model
description: The server-authoritative FIAT wallet, settlement rules, and ATM placement conventions.
---

# ATM network + BANCO OMBRA

- ATMs are interior `terminal` objects whose label matches `/atm/i`; they open the *shared* `showBank` (BANCO OMBRA) modal. Reuse it — never build a parallel bank UI.
- ATM count per floor is tiered: corporate office floors get a small bank (3), residential/generic floors get 1, plus a few fixed street ATMs in the city. (mechanics live in worldInteriorData `ensureAtm` + WorldPlay floor builder.)

## One spendable FIAT wallet
- **Rule:** server-bank FIAT is the only spendable wallet for vending, food, cosmetics, items/power, salary, top-ups, and legitimate earnings. Plaid-linked balances are display-only.
- **Why:** client-save salary and legacy cosmetic crypto were forgeable parallel affordability paths and could grant goods without an authoritative debit.
- **How to apply:** money mutations must run through the shared wallet transaction, lock accounts, write bank transaction records, and commit the debit with the grant/effect. Mutating clients use `apiFetch` so global FIAT surfaces refresh immediately.
- **Withdrawal boundary:** FIAT/Credits are usable only within SALARYMAN and cannot be withdrawn at an ATM. Real-world payout setup is separate and available only to verified real organizations.
- **Why:** the user stated this product and money boundary.
- **How to apply:** keep game earnings and task rewards in the SALARYMAN wallet; never treat an ATM, FIAT balance, or a personal account as a real-money payout rail.

## EXCHANGE counter — USD is real money, never a free swap
- **The hard line:** USD may never participate in a free client-side swap. USD→ƒ must use confirmed Stripe settlement. GOLD cash-out is disabled until GOLD itself is server-authoritative and can be atomically debited.
- **Why:** the exchange *engine* (`src/lib/exchange.ts`) can quote any pair incl. USD, but if USD were in the UI's free-swap list the client could mint/burn real money. So the swap UI deliberately offers only the four in-game currencies; USD legs live in separate real-money panels.
- **BTC/ETH are in-game stores of value only** (no real crypto), priced off the live USD market index; crypto legs disable when the live rate is missing rather than guessing.
- **Top-up money safety:** server maps client `packId`→amount (never trust client ƒ/USD); FIAT is credited only on the confirmed Stripe webhook, and the claim (pending→completed) MUST share ONE DB transaction with the bank credit — flipping status before/outside the credit tx strands paid users with no FIAT on any transient failure, since retries then skip the "already completed" row. The conditional UPDATE inside the tx is also what makes duplicate webhooks idempotent.
- **Retry safety:** repeatable purchases and checkout starts carry request IDs. Signed paid webhooks may reconstruct a missing pending top-up only after validating the server catalog amount and currency.
- **Proceeds** flow to the platform's single Stripe account (= owner/Picasso) exactly like every other checkout here; this codebase uses NO Stripe Connect, so no per-charge routing fields are needed.
