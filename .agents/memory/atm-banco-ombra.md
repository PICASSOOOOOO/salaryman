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
