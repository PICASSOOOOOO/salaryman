---
name: Accounting Autopilot
description: How the accounting autopilot domain handler behaves and the shared finance services it (and the manual routes) call.
---

# Accounting Autopilot

The accounting domain handler makes an assigned bot a virtual CFO: collections,
bill payment, periodic payroll. Registered at boot in api-server index.ts.

## Decisions (be consistent with these)
- **Acts on the org OWNER's books.** All finance tables are keyed by `userId`;
  the handler uses `ctx.ownerId` as that userId. "Org books" == owner's books.
- **No entitlement / no credit gate.** Manual Enterprise Finance requires only
  auth (no PRIME, no paid AI), so the handler deliberately does NOT call
  `ensureEntitlement`/`ensureCredit`. **Why:** gating it would make the automatic
  path stricter than the manual one, violating "OFF == manual-only, no divergence".
- **Money writes go through shared services only** in `lib/finance-actions.ts`:
  `payBill(userId, billId)` and `createPayrollRun(userId, input)`. The manual
  `/enterprise` bill-PUT (paid path) and payroll-POST were refactored to call the
  SAME functions. **Why:** the autopilot contract — manual and auto must never
  diverge; `payBill` is atomic (advisory lock + in-tx status re-check) so a bill
  can't be double-paid/double-recorded (this also fixed a latent double-record in
  the manual route).
- **Cash safety within a tick:** start from `report.summary.cashBalance`, then
  decrement a local running balance per bill paid and per payroll so it never
  overdraws inside one tick. Across ticks the finance-engine recomputes from
  recorded txns.
- **Collections** = log a deduped reminder per overdue receivable from
  finance-engine aging (no manual reminder service exists to reuse). Dedupe via
  the activity log: skip an invoiceId reminded within `REMINDER_COOLDOWN_DAYS` (3).
- **Payroll cadence** = at most once per `PAYROLL_PERIOD_DAYS` (28, monthly);
  there is no payroll-frequency config field, so this is the default. Idempotent
  via the latest payroll run's `runDate`. Active employees with payRate>0 only.
- All actions consume `ctx.claimAction()` (per-tick cap); insufficient cash logs
  one `skipped` summary rather than spamming per item.

## Gotcha
- A fresh isolated env may not have the autopilot foundation tables migrated
  (`autopilot_activity_log` "relation does not exist"). Run
  `pnpm --filter @workspace/db run push` before the handler/tests can read the log.
