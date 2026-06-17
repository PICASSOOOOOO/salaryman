---
name: ATM network + BANCO OMBRA modal money model
description: The two-ledger money split behind the bank modal, and how ATM placement count is decided.
---

# ATM network + BANCO OMBRA

- ATMs are interior `terminal` objects whose label matches `/atm/i`; they open the *shared* `showBank` (BANCO OMBRA) modal. Reuse it — never build a parallel bank UI.
- ATM count per floor is tiered: corporate office floors get a small bank (3), residential/generic floors get 1, plus a few fixed street ATMs in the city. (mechanics live in worldInteriorData `ensureAtm` + WorldPlay floor builder.)

## Two money systems — DO NOT conflate
- **Why this matters:** the modal's balances + in-game HISTORY ledger are CLIENT save money (`g.salary`/`g.savings`/`g.loan`). The server bank routes (`bank.ts`, `/economy/bank/*`) are a SEPARATE ledger the modal does not display. Pulling server bank transactions into the modal would show history for money whose balance isn't shown → inconsistent UI.
- **How to apply:** the only real-money data the HISTORY tab pulls is pledge purchases (`/pledge/owned`, completed only), rendered as a distinct USD section. Any entitlement fetch into UI must clear state before refetch and on every failure path, or stale purchases leak across session/user changes.

## EXCHANGE counter — USD is real money, never a free swap
- **The hard line:** in-game currencies (FIAT/GOLD/BTC/ETH) may be freely swapped client-side; USD may NOT. A USD↔in-game leg moves real money, so it MUST route through server-authoritative real-money rails — Stripe top-up for USD→ƒ (in) and gold cash-out for →USD (out) — never the generic client swap dropdown.
- **Why:** the exchange *engine* (`src/lib/exchange.ts`) can quote any pair incl. USD, but if USD were in the UI's free-swap list the client could mint/burn real money. So the swap UI deliberately offers only the four in-game currencies; USD legs live in separate real-money panels.
- **BTC/ETH are in-game stores of value only** (no real crypto), priced off the live USD market index; crypto legs disable when the live rate is missing rather than guessing.
- **Top-up money safety:** server maps client `packId`→amount (never trust client ƒ/USD); FIAT is credited only on the confirmed Stripe webhook, and the claim (pending→completed) MUST share ONE DB transaction with the bank credit — flipping status before/outside the credit tx strands paid users with no FIAT on any transient failure, since retries then skip the "already completed" row. The conditional UPDATE inside the tx is also what makes duplicate webhooks idempotent.
- **Proceeds** flow to the platform's single Stripe account (= owner/Picasso) exactly like every other checkout here; this codebase uses NO Stripe Connect, so no per-charge routing fields are needed.
