---
name: Gold → real-money cash-out (two-ledger bridge)
description: How the ATM gold cash-out maps client gold to the server "real money USD" pool, and why real Gusto payouts are still gated.
---

# Gold cash-out / "real money" USD

## Current product boundary

FIAT/Credits are for use inside SALARYMAN and cannot be withdrawn from an ATM.
Real-world payout setup is separate and may only be configured by verified real
organizations. Treat the ATM GOLD-to-server-balance behavior described below as
legacy in-game conversion, not authorization for a user-level cash-out or
external payout.

**Why:** the user explicitly limited FIAT/Credits to SALARYMAN and restricted
real-world payout setup to verified organizations.

**How to apply:** keep task and gameplay rewards internal. Any external payout
flow must be organization-owned and verification-gated; do not add ATM
withdrawals or personal cash-out.

The game runs **two separate money ledgers**, and "real money $" in the UI is the SERVER one:

- **Client save ledger** — `g.goldBalance` (oz) and `g.salary` (checking ƒ) live in the client save blob (`salaryman_saves.data`). Gold is **client-authoritative**; the server keeps no canonical gold balance.
- **Server bank ledger** — `bank_accounts` (kind=`checking`/`savings`/`vault`), `bank.ts`. The wallet "AVAILABLE $ / REAL USD" shown in Wallet/BalanceSheet is `GET /api/wallet/snapshot` → `earnedFiat = checking.balance − quarantineFiat`, `USD = earnedFiat / FIAT_PER_USD (1000)`. Rates live in `lib/pablo-tax.ts` (`FIAT_PER_USD=1000`, `GOLD_OZ_PER_USD=0.005`).

**ATM "GOLD" tab cash-out** (`POST /economy/bank/cashout`, `bank.ts`): deducts client gold (client side) and **credits the SERVER checking balance** by `netFiat = goldOz × FIAT_PER_GOLD(100000) × (1 − 0.20)`. So gold becomes withdrawable real-money USD in the wallet. Buy/sell gold in the same tab only touch the CLIENT ledger (`g.salary`).

**Starter/unemployment exclusion is by construction**: those grants are FIAT only and gold is never granted, so they can never be cashed out. No quarantine logic needed for gold.

**Gusto / real payout is NOT built.** Gusto is only a metadata flag (`world_businesses.payrollProvider="gusto"`); there is no automated payout rail anywhere (even the existing "USD Withdraw" in Payroll.tsx is simulated/recorded). `GUSTO_API_KEY`/`GUSTO_REFRESH_TOKEN` are missing secrets.

**Why this matters / prerequisite for real money:** because cash-out trusts client-reported `goldOz` (same trust model as the whole client-authoritative economy), it can *mint* in-game USD. That's only an in-game number TODAY because no real withdrawal exists. **Before wiring a real Gusto payout, gold must become server-authoritative** (or cash-out must validate `goldOz` against the persisted save and decrement it server-side), or clients can mint real money. Always do the fiat credit as an atomic `balance = balance + netFiat` SQL expr (not read-then-write) to avoid lost updates.

**Rate inconsistency (known, intentional):** ATM gold uses `FIAT_PER_GOLD=100000` (in-game exchange price); wallet `GOLD_OZ_PER_USD=0.005` implies ƒ200000/oz (display valuation only). Cash-out uses the in-game 100000 because it's an exchange transaction. Unifying them is an economy-balance decision — don't change unilaterally.
