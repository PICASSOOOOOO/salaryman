---
name: Starting fiat, quarantine, and the economy ticker
description: Where a player's opening ƒ balance actually comes from, why quarantine is a no-op, and where the shared CurrencyTicker lives.
---

# Starting fiat & quarantine

A new player's opening ƒ is set in TWO independent places — change both together if you touch "starting money":
- **Bank seed** — `bank.ts ensureSeeded(userId, email)` first-touch-seeds three accounts (checking/savings/vault). This is the spendable wallet shown in `/api/economy/bank/accounts`. Idempotent: only seeds when the player has zero accounts (the table has NO unique constraint on (userId,kind), so the existence check is the only guard).
- **Onboarding ledger** — `onboard-housing.ts POST /charge` clamps the client-claimed `startingBalance` to 100,000 and uses it to compute rent/debt.

**Quarantine is a no-op.** The real column is `quarantineFiat`/`quarantine_fiat` in `player-ledger.ts`. It defaults to 0 and is **never written anywhere** in the codebase — so all seeded/granted money is already fully spendable for everyone. To make a grant spendable you do NOT need to "un-quarantine"; just don't add a quarantine write.

**Picasso staff start balance** — `PICASSO_START_FIAT` (in `plan.ts`, 999,999,999) is gated on `isPicassoOrgMemberEmail(email)` (server-side env allow-list, never a client flag). Applied in BOTH places above: ensureSeeded seeds the checking account with it; onboard-housing bypasses the 100k cap with it. Normal players unaffected.

**Why:** the spendable balance and the onboarding-debt math read different sources, so a grant applied to only one leaves either a broke wallet or a phantom debt.

# Economy ticker (CurrencyTicker)

`CurrencyTicker.tsx` is the shared BTC→USD→ƒ→Gold readout. It now lives in the **WorldPlay in-game HUD** (inside the `{hudOpen && (<>` block) and on the Economy page — it was REMOVED from the top `NavBar`. The `showPlayerFiat` prop adds an authenticated-only "YOU ƒ..." segment that sums FIAT bank accounts from `/api/economy/bank/accounts` (refreshes ~30s; gracefully omits on 401/guest).
