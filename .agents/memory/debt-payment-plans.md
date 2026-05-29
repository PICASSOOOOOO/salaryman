---
name: Debt payment plans + credit-aware lending
description: How Banco Ombra's debt restructuring and credit-score-driven loans wire client wallet to server-authoritative debt.
---

Banco Ombra (WorldPlay loans tab) has two debt mechanics backed by `credit.ts` + `player_ledger` plan columns.

- **Credit score → APR**: `aprBpsFromScore` (server) drives loan/plan rates. Client mirrors with `creditRateMult` + score-gated max loan tiers (`maxLoanAmount`); the same lock check guards both the disabled tier button AND `doLoan`.
- **Debt payment plan**: alternative to working debt off under Pablo's collector. Enroll zeroes server `debt` + clears `jailUntil`. `tickPlan()` lazily applies overdue/late-fee(5%)/default-after-3-misses. Single active plan per ledger.

**Why the wallet guardrail exists:** wallet is client-authoritative (`g.salary`), but `pay`/`payoff` run `tickPlan()` server-side first, which can RAISE the balance via late fees between the client's fetch and click. Client checking stale `debtPlan.balance` then blindly doing `g.salary -= j.paid` could drive the wallet negative.

**How to apply:** `pay`/`payoff` accept `{ wallet }` in the body; server rejects with `402 { required }` when `wallet < freshAmount`. Client sends `g.salary`, and on 402 shows the fresh required amount + calls `refreshCredit()` instead of deducting. `enroll` does NOT deduct client money (pure server-debt restructure); `pay`/`payoff` DO deduct `j.paid`.
